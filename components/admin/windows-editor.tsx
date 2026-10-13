"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { saveWindows } from "@/app/admin/_actions/schedule";
import { SaveBar } from "@/components/admin/save-bar";
import { Toggle } from "@/components/admin/schedule-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import type { BookingWindow, HoursBlock } from "@/lib/booking";
import { minuteLabel } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = { key: string; id: string | null; label: string; start_minute: number; end_minute: number; active: boolean };

const STEPS = Array.from({ length: 97 }, (_, i) => i * 15);
const timeLabel = (m: number) => (m >= 1440 ? "Midnight" : minuteLabel(m));
const span = (r: Pick<Row, "start_minute" | "end_minute">) => `${timeLabel(r.start_minute)} – ${timeLabel(r.end_minute)}`;
const toRows = (windows: BookingWindow[]): Row[] =>
  [...windows]
    .sort((a, b) => a.start_minute - b.start_minute)
    .map((w) => ({ key: w.id, id: w.id, label: w.label, start_minute: w.start_minute, end_minute: w.end_minute, active: w.active }));
const snapshot = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.id, r.label.trim(), r.start_minute, r.end_minute, r.active]));

/** The arrival windows clients pick from, on a timeline of the day with the hours someone works. */
export function WindowsEditor({ windows, hours }: { windows: BookingWindow[]; hours: HoursBlock[] }) {
  const [rows, setRows] = useState(() => toRows(windows));
  const [saved, setSaved] = useState(() => snapshot(toRows(windows)));
  const [removed, setRemoved] = useState<string[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const dirty = snapshot(rows) !== saved || removed.length > 0;

  // Does anyone work during a window on any day? If not, clients never see it.
  const covered = (r: Row) => hours.some((h) => h.start_minute < r.end_minute && r.start_minute < h.end_minute);

  const problem = useMemo(() => {
    const live = rows.filter((r) => r.active).sort((a, b) => a.start_minute - b.start_minute);
    if (rows.some((r) => !r.label.trim())) return "Give every window a name, like “Morning”.";
    if (rows.some((r) => r.end_minute <= r.start_minute)) return "A window has to end after it starts.";
    for (let i = 1; i < live.length; i++) {
      if (live[i].start_minute < live[i - 1].end_minute) {
        return `${live[i - 1].label} and ${live[i].label} overlap. Windows can touch but not overlap.`;
      }
    }
    if (!live.length) return "Clients need at least one window to book walks and drop-ins.";
    return null;
  }, [rows]);

  const update = (key: string, patch: Partial<Row>) => {
    setResult(null);
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const add = () => {
    const last = Math.max(0, ...rows.map((r) => r.end_minute));
    const startMinute = last && last <= 1380 ? last : 17 * 60;
    setResult(null);
    setRows((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        id: null,
        label: startMinute >= 17 * 60 ? "Evening" : "",
        start_minute: startMinute,
        end_minute: Math.min(1440, startMinute + 120),
        active: true,
      },
    ]);
  };

  const remove = (r: Row) => {
    setResult(null);
    setRows((list) => list.filter((x) => x.key !== r.key));
    if (r.id) setRemoved((list) => [...list, r.id!]);
  };

  const save = () => {
    if (problem) return;
    start(async () => {
      const res = await saveWindows(
        rows.map((r) => ({ id: r.id, label: r.label, start_minute: r.start_minute, end_minute: r.end_minute, active: r.active })),
        removed,
      );
      setResult(res);
      if (res.ok && res.windows) {
        // Take the saved list back so new windows have their ids.
        const next = toRows(res.windows);
        setRows(next);
        setSaved(snapshot(next));
        setRemoved([]);
      }
    });
  };

  // Timeline: 6 AM – 9 PM, stretched to fit.
  const lo = Math.floor(Math.min(6 * 60, ...rows.map((r) => r.start_minute)) / 60) * 60;
  const hi = Math.ceil(Math.max(21 * 60, ...rows.map((r) => r.end_minute)) / 60) * 60;
  const pct = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`;
  const ticks = Array.from({ length: Math.floor((hi - lo) / 180) + 1 }, (_, i) => lo + i * 180);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Arrival windows</h2>
        <p className="text-sm text-ink-600">
          Clients booking a walk, drop-in or park visit pick one of these and you arrive sometime inside it. Visits are fit
          into your hours within the window, and you can always pin an exact time from the calendar.
        </p>
      </div>

      <div aria-hidden className="hidden sm:block">
        <div className="relative h-14 rounded-2xl bg-sea-50/60">
          {rows.map((r) => (
            <div
              key={r.key}
              className={cn(
                "absolute inset-y-1.5 flex min-w-0 flex-col justify-center overflow-hidden rounded-xl px-2 text-xs leading-tight",
                r.active ? "bg-ocean text-white" : "border-2 border-dashed border-ink-200 text-ink-400",
              )}
              style={{ left: pct(r.start_minute), width: `calc(${pct(r.end_minute)} - ${pct(r.start_minute)} - 2px)` }}
            >
              <span className="truncate font-extrabold">{r.label || "New window"}</span>
              <span className="truncate font-semibold opacity-80">{span(r)}</span>
            </div>
          ))}
        </div>
        <div className="relative mt-1 h-4">
          {ticks.map((m) => (
            <span key={m} className="absolute -translate-x-1/2 text-[11px] font-bold text-ink-400" style={{ left: pct(m) }}>
              {minuteLabel(m, true)}
            </span>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className={cn("rounded-2xl border-2 p-3", r.active ? "border-ink-100" : "border-dashed border-ink-100 bg-ink-100/20")}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto] sm:items-end">
              <Field label="Name" htmlFor={`w-${r.key}-name`}>
                <Input
                  id={`w-${r.key}-name`}
                  value={r.label}
                  maxLength={40}
                  placeholder="e.g. Midday"
                  className="py-2"
                  onChange={(e) => update(r.key, { label: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <Field label="From" htmlFor={`w-${r.key}-from`}>
                  <Select
                    id={`w-${r.key}-from`}
                    value={r.start_minute}
                    className="py-2"
                    onChange={(e) => {
                      const s = Number(e.target.value);
                      update(r.key, { start_minute: s, end_minute: Math.max(r.end_minute, s + 15) });
                    }}
                  >
                    {STEPS.slice(0, -1).map((m) => (
                      <option key={m} value={m}>
                        {timeLabel(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To" htmlFor={`w-${r.key}-to`}>
                  <Select
                    id={`w-${r.key}-to`}
                    value={r.end_minute}
                    className="py-2"
                    onChange={(e) => update(r.key, { end_minute: Number(e.target.value) })}
                  >
                    {STEPS.filter((m) => m > r.start_minute).map((m) => (
                      <option key={m} value={m}>
                        {timeLabel(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mb-0.5 hidden sm:inline-flex"
                aria-label={`Remove ${r.label || "this window"}`}
                onClick={() => remove(r)}
              >
                <Trash2 className="size-4 text-red-700" aria-hidden />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Toggle checked={r.active} onChange={(v) => update(r.key, { active: v })} label="Clients can pick it" />
              {r.active && !covered(r) ? (
                <span className="text-xs font-bold text-amber-700">No one works then yet, so clients won’t see it.</span>
              ) : null}
              <Button size="sm" variant="ghost" className="ml-auto sm:hidden" onClick={() => remove(r)}>
                <Trash2 className="size-4 text-red-700" aria-hidden /> Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" aria-hidden /> Add a window
      </Button>

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={save}
        onReset={() => {
          setRows(toRows(windows));
          setRemoved([]);
          setResult(null);
        }}
        message={result?.ok ? result.message : null}
        error={dirty ? problem ?? (result && !result.ok ? result.error : null) : result && !result.ok ? result.error : null}
        label="Save windows"
      />
    </Card>
  );
}
