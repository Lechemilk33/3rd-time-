"use client";

import { CalendarOff, Check, Copy, Eraser, Link2, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  addTimeOff,
  deleteTimeOff,
  deleteWindow,
  resetCalendarFeed,
  saveAvailability,
  saveBookingRules,
  saveWalker,
  saveWindow,
  sendTestEmail,
  type RulesInput,
} from "@/app/admin/_actions/schedule";
import { CopyField } from "@/components/admin/client-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { windowRange, type BookingSettings, type BookingWindow, type Walker } from "@/lib/booking";
import { minuteLabel, minutesToTimeInput, shortDate, timeToMinutes, type Ymd } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SWATCHES = ["#1A6FA0", "#F2711C", "#0E9F6E", "#7C3AED", "#DB2777", "#0891B2", "#CA8A04", "#475569"];

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      after?.(r);
    });
  return { pending, result, run, clear: () => setResult(null) };
}

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
      <Check className="size-4" aria-hidden /> {result.message ?? "Saved."}
    </span>
  ) : (
    <span className="text-sm font-bold text-red-700">{result.error}</span>
  );
}

function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink-200 transition peer-checked:bg-ocean peer-focus-visible:ring-4 peer-focus-visible:ring-sea-100 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
      <span>
        <span className="block font-bold">{label}</span>
        {help ? <span className="block text-sm text-ink-600">{help}</span> : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

export function RulesEditor({ settings }: { settings: BookingSettings }) {
  const [draft, setDraft] = useState<RulesInput>({
    booking_enabled: settings.booking_enabled,
    min_notice_hours: settings.min_notice_hours,
    max_days_ahead: settings.max_days_ahead,
    cancel_cutoff_hours: settings.cancel_cutoff_hours,
    admin_alerts: settings.admin_alerts,
    client_reminders: settings.client_reminders,
    walker_digest: settings.walker_digest,
    reminder_hour: settings.reminder_hour,
    reply_to: settings.reply_to,
  });
  const { pending, result, run } = useAction();
  const set = <K extends keyof RulesInput>(k: K, v: RulesInput[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Booking rules</h2>
        <p className="text-sm text-ink-600">How far ahead clients can book, and when they can still cancel.</p>
      </div>
      <Toggle
        checked={draft.booking_enabled}
        onChange={(v) => set("booking_enabled", v)}
        label="Clients can book online"
        help="Turn off to pause new bookings (you can still add visits yourself)."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Minimum notice" htmlFor="r-notice" help="Hours before a visit">
          <Input id="r-notice" type="number" min={0} max={336} value={draft.min_notice_hours} onChange={(e) => set("min_notice_hours", Number(e.target.value))} />
        </Field>
        <Field label="Book up to" htmlFor="r-ahead" help="Days ahead">
          <Input id="r-ahead" type="number" min={1} max={365} value={draft.max_days_ahead} onChange={(e) => set("max_days_ahead", Number(e.target.value))} />
        </Field>
        <Field label="Cancel / reschedule until" htmlFor="r-cutoff" help="Hours before a visit">
          <Input id="r-cutoff" type="number" min={0} max={336} value={draft.cancel_cutoff_hours} onChange={(e) => set("cancel_cutoff_hours", Number(e.target.value))} />
        </Field>
      </div>

      <div className="space-y-4 border-t border-ink-100 pt-5">
        <h3 className="font-display text-lg font-semibold">Emails</h3>
        <Toggle checked={draft.admin_alerts} onChange={(v) => set("admin_alerts", v)} label="Email the team about new bookings, cancellations and changes" />
        <Toggle checked={draft.client_reminders} onChange={(v) => set("client_reminders", v)} label="Remind clients the evening before a visit" />
        <Toggle checked={draft.walker_digest} onChange={(v) => set("walker_digest", v)} label="Send each walker their schedule for the next day" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Send reminders at" htmlFor="r-hour">
            <Select id="r-hour" value={draft.reminder_hour} onChange={(e) => set("reminder_hour", Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {minuteLabel(h * 60)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Replies go to" htmlFor="r-reply" help="When clients reply to a booking email.">
            <Input id="r-reply" type="email" value={draft.reply_to} onChange={(e) => set("reply_to", e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
        <Button onClick={() => run(() => saveBookingRules(draft))} disabled={pending}>
          {pending ? "Saving…" : "Save rules"}
        </Button>
        <Result result={result} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

export function WindowsEditor({ windows }: { windows: BookingWindow[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Arrival windows</h2>
        <p className="text-sm text-ink-600">
          Clients pick one of these when they book. You can pin an exact arrival time later from the calendar.
        </p>
      </div>
      <ul className="space-y-2">
        {windows.map((w) => (
          <WindowRow key={`${w.id}-${w.start_minute}-${w.end_minute}-${w.label}-${w.active}`} window={w} />
        ))}
      </ul>
      {adding ? (
        <WindowRow window={null} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add a window
        </Button>
      )}
    </Card>
  );
}

function WindowRow({ window: w, onDone }: { window: BookingWindow | null; onDone?: () => void }) {
  const [label, setLabel] = useState(w?.label ?? "Evening");
  const [start, setStart] = useState(minutesToTimeInput(w?.start_minute ?? 17 * 60));
  const [end, setEnd] = useState(minutesToTimeInput(w?.end_minute ?? 19 * 60));
  const [active, setActive] = useState(w?.active ?? true);
  const { pending, result, run } = useAction();
  const startMin = timeToMinutes(`${start}:00`) ?? 0;
  const endMin = end === "00:00" ? 1440 : (timeToMinutes(`${end}:00`) ?? 0);
  const dirty = !w || label !== w.label || startMin !== w.start_minute || endMin !== w.end_minute || active !== w.active;

  return (
    <li className={cn("rounded-2xl border-2 p-3", w && !w.active ? "border-dashed border-ink-100 bg-ink-100/20" : "border-ink-100")}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name" htmlFor={`wl-${w?.id ?? "new"}`} className="min-w-36 flex-1">
          <Input id={`wl-${w?.id ?? "new"}`} value={label} onChange={(e) => setLabel(e.target.value)} className="py-2" />
        </Field>
        <Field label="From" htmlFor={`ws-${w?.id ?? "new"}`}>
          <Input id={`ws-${w?.id ?? "new"}`} type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} className="w-32 py-2" />
        </Field>
        <Field label="To" htmlFor={`we-${w?.id ?? "new"}`}>
          <Input id={`we-${w?.id ?? "new"}`} type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className="w-32 py-2" />
        </Field>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-bold">
          <input type="checkbox" className="size-4 accent-ocean" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Bookable
        </label>
        <div className="flex gap-1 pb-0.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !dirty}
            onClick={() =>
              run(
                () => saveWindow({ id: w?.id, label, start_minute: startMin, end_minute: endMin, active }),
                (r) => r.ok && onDone?.(),
              )
            }
          >
            {w ? "Save" : "Add"}
          </Button>
          {w ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${w.label}`}
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove the ${w.label} window?`)) run(() => deleteWindow(w.id));
              }}
            >
              <Trash2 className="size-4 text-red-700" aria-hidden />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {result && !result.ok ? <p className="mt-2 text-sm font-bold text-red-700">{result.error}</p> : null}
      {w && !w.active ? <p className="mt-2 text-xs font-bold text-ink-400">Hidden from clients</p> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Walkers + weekly availability
// ---------------------------------------------------------------------------------------------

export function WalkersEditor({
  walkers,
  windows,
  availability,
}: {
  walkers: Walker[];
  windows: BookingWindow[];
  availability: { walker_id: string; weekday: number; window_id: string; capacity: number }[];
}) {
  const [selected, setSelected] = useState(walkers[0]?.profile_id ?? "");
  const walker = walkers.find((w) => w.profile_id === selected);
  if (!walkers.length) {
    return (
      <Card>
        <h2 className="text-xl font-semibold">Walkers</h2>
        <p className="mt-2 text-ink-600">Every admin becomes a walker automatically. Make someone an admin from their client profile.</p>
      </Card>
    );
  }
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Walkers &amp; weekly availability</h2>
        <p className="text-sm text-ink-600">
          How many visits each walker can take in each window. 0 = not working. Clients only see times with an open spot.
        </p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {walkers.map((w) => (
          <button
            key={w.profile_id}
            type="button"
            role="tab"
            aria-selected={w.profile_id === selected}
            onClick={() => setSelected(w.profile_id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 font-bold transition",
              w.profile_id === selected ? "border-ink bg-ink text-white" : "border-ink-100 bg-white hover:border-ink-200",
            )}
          >
            <span className="size-3 rounded-full ring-2 ring-white" style={{ background: w.color }} aria-hidden />
            {w.display_name}
            {!w.active ? <span className="text-xs opacity-70">(off)</span> : null}
          </button>
        ))}
      </div>
      {walker ? (
        <WalkerPanel
          key={walker.profile_id}
          walker={walker}
          windows={windows.filter((w) => w.active)}
          availability={availability.filter((a) => a.walker_id === walker.profile_id)}
        />
      ) : null}
    </Card>
  );
}

function WalkerPanel({
  walker,
  windows,
  availability,
}: {
  walker: Walker;
  windows: BookingWindow[];
  availability: { weekday: number; window_id: string; capacity: number }[];
}) {
  const [name, setName] = useState(walker.display_name);
  const [color, setColor] = useState(walker.color);
  const [active, setActive] = useState(walker.active);
  const profile = useAction();
  const grid = useAction();
  const key = (d: number, w: string) => `${d}:${w}`;
  const initial = Object.fromEntries(availability.map((a) => [key(a.weekday, a.window_id), a.capacity]));
  const [cells, setCells] = useState<Record<string, number>>(initial);
  const get = (d: number, w: string) => cells[key(d, w)] ?? 0;
  const set = (d: number, w: string, v: number) => setCells((c) => ({ ...c, [key(d, w)]: Math.max(0, Math.min(50, v)) }));
  const gridDirty = windows.some((w) => [1, 2, 3, 4, 5, 6, 7].some((d) => get(d, w.id) !== (initial[key(d, w.id)] ?? 0)));
  const weekTotal = windows.reduce((sum, w) => sum + [1, 2, 3, 4, 5, 6, 7].reduce((s, d) => s + get(d, w.id), 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name clients see" htmlFor="wk-name" className="min-w-40 flex-1">
            <Input id="wk-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-bold">Calendar color</p>
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color.toLowerCase() === c.toLowerCase()}
                  className={cn("size-8 rounded-full transition", color.toLowerCase() === c.toLowerCase() ? "ring-4 ring-sea-200" : "hover:scale-110")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <Toggle checked={active} onChange={setActive} label="Takes client bookings" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={profile.pending || (name === walker.display_name && color === walker.color && active === walker.active)}
          onClick={() => profile.run(() => saveWalker({ profile_id: walker.profile_id, display_name: name, color, active }))}
        >
          Save walker
        </Button>
        <Result result={profile.result} />
      </div>

      {windows.length ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-ink-100">
            <table className="w-full min-w-[620px] border-collapse text-center">
              <thead>
                <tr className="bg-sea-50">
                  <th className="px-3 py-2 text-left text-xs font-extrabold tracking-wider text-ink-400 uppercase">Window</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className="px-1 py-2 text-xs font-extrabold tracking-wider text-ink-600 uppercase">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.id} className="border-t border-ink-100">
                    <th scope="row" className="px-3 py-2 text-left">
                      <span className="block font-extrabold">{w.label}</span>
                      <span className="block text-xs font-semibold text-ink-400">{windowRange(w)}</span>
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const v = get(d, w.id);
                      return (
                        <td key={d} className="px-1 py-2">
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={v}
                            aria-label={`${w.label} ${WEEKDAYS[d - 1]} visits`}
                            onChange={(e) => set(d, w.id, Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className={cn(
                              "h-11 w-14 rounded-xl border-2 text-center text-base font-extrabold transition focus:border-ocean focus:ring-4 focus:ring-sea-100 focus:outline-none",
                              v > 0 ? "border-transparent bg-sea-100 text-ink" : "border-ink-100 bg-white text-ink-400",
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={grid.pending || !gridDirty} onClick={() =>
              grid.run(() =>
                saveAvailability(
                  walker.profile_id,
                  windows.flatMap((w) => [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, window_id: w.id, capacity: get(d, w.id) }))),
                ),
              )
            }>
              Save availability
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = { ...cells };
                for (const w of windows) for (const d of [2, 3, 4, 5]) next[key(d, w.id)] = get(1, w.id);
                setCells(next);
              }}
            >
              <Copy className="size-4" aria-hidden /> Copy Monday to Tue–Fri
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCells(Object.fromEntries(windows.flatMap((w) => [1, 2, 3, 4, 5, 6, 7].map((d) => [key(d, w.id), 0]))))}
            >
              <Eraser className="size-4" aria-hidden /> Clear
            </Button>
            <span className="text-sm font-bold text-ink-400">{weekTotal} visits a week</span>
            <Result result={grid.result} />
          </div>
        </div>
      ) : (
        <Notice>Add an arrival window first.</Notice>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------------------------

export function TimeOffEditor({
  entries,
  walkers,
  windows,
  today,
}: {
  entries: { id: string; walker_id: string | null; start_date: Ymd; end_date: Ymd; window_id: string | null; note: string | null }[];
  walkers: Walker[];
  windows: BookingWindow[];
  today: Ymd;
}) {
  const [walkerId, setWalkerId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [windowId, setWindowId] = useState("");
  const [note, setNote] = useState("");
  const { pending, result, run } = useAction();
  const remove = useAction();

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Time off &amp; holidays</h2>
        <p className="text-sm text-ink-600">Block days for one walker or the whole business. Existing visits aren’t touched.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field label="Who" htmlFor="to-who">
          <Select id="to-who" value={walkerId} onChange={(e) => setWalkerId(e.target.value)}>
            <option value="">Everyone (closed)</option>
            {walkers.map((w) => (
              <option key={w.profile_id} value={w.profile_id}>
                {w.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="to-from">
          <Input id="to-from" type="date" value={from} onChange={(e) => {
            setFrom(e.target.value);
            if (e.target.value > to) setTo(e.target.value);
          }} />
        </Field>
        <Field label="To" htmlFor="to-to">
          <Input id="to-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Part of day" htmlFor="to-window">
          <Select id="to-window" value={windowId} onChange={(e) => setWindowId(e.target.value)}>
            <option value="">All day</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="to-note">
          <Input id="to-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Thanksgiving" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => addTimeOff({ walker_id: walkerId || null, start_date: from, end_date: to, window_id: windowId || null, note }), (r) => {
              if (r.ok) setNote("");
            })
          }
        >
          <CalendarOff className="size-4" aria-hidden /> Block these days
        </Button>
        <Result result={result} />
      </div>
      {entries.length ? (
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
          {entries.map((t) => {
            const w = t.walker_id ? walkers.find((x) => x.profile_id === t.walker_id) : null;
            const win = t.window_id ? windows.find((x) => x.id === t.window_id) : null;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="size-3 rounded-full" style={{ background: w?.color ?? "#0F2B3F" }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">
                    {t.start_date === t.end_date ? shortDate(t.start_date) : `${shortDate(t.start_date)} – ${shortDate(t.end_date)}`}
                    {win ? ` · ${win.label}` : ""}
                  </span>
                  <span className="block text-sm text-ink-600">
                    {w ? w.display_name : "Everyone"}
                    {t.note ? ` · ${t.note}` : ""}
                  </span>
                </span>
                <Button size="sm" variant="ghost" disabled={remove.pending} onClick={() => remove.run(() => deleteTimeOff(t.id))} aria-label="Remove time off">
                  <Trash2 className="size-4 text-red-700" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-400">No upcoming time off.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Calendar sync + email
// ---------------------------------------------------------------------------------------------

export function CalendarSyncCard({ origin, token }: { origin: string; token: string | null }) {
  const [current, setCurrent] = useState(token);
  const { pending, result, run } = useAction();
  const host = origin.replace(/^https?:\/\//, "");
  const all = current ? `${origin}/api/calendar/${current}` : "";
  const mine = current ? `${all}?mine=1` : "";

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Link2 className="size-5 text-ocean" aria-hidden /> Sync to your phone’s calendar
        </h2>
        <p className="text-sm text-ink-600">
          Subscribe once and visits show up in Google Calendar or Apple Calendar automatically. This link is private to you — don’t share it.
        </p>
      </div>
      {current ? (
        <>
          <CopyField label="All visits" value={all} />
          <CopyField label="Just my visits" value={mine} />
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex h-9 items-center gap-2 rounded-full border-2 border-ink-200 bg-white px-4 text-sm font-bold hover:border-ocean hover:text-ocean"
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${host}/api/calendar/${current}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Add to Google Calendar
            </a>
            <a
              className="inline-flex h-9 items-center gap-2 rounded-full border-2 border-ink-200 bg-white px-4 text-sm font-bold hover:border-ocean hover:text-ocean"
              href={`webcal://${host}/api/calendar/${current}`}
            >
              Add to Apple Calendar
            </a>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (confirm("Make a new link? The old one stops working right away.")) {
                  run(resetCalendarFeed, (r) => {
                    const t = (r as ActionResult & { token?: string }).token;
                    if (t) setCurrent(t);
                  });
                }
              }}
            >
              <RefreshCw className="size-4" aria-hidden /> New link
            </Button>
          </div>
          <p className="text-xs text-ink-400">Google refreshes subscribed calendars every few hours; Apple about every 15 minutes.</p>
        </>
      ) : (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(resetCalendarFeed, (r) => {
              const t = (r as ActionResult & { token?: string }).token;
              if (t) setCurrent(t);
            })
          }
        >
          Create my calendar link
        </Button>
      )}
      <Result result={result && !result.ok ? result : null} />
    </Card>
  );
}

export function EmailCard({ configured, email }: { configured: boolean; email: string }) {
  const { pending, result, run } = useAction();
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Mail className="size-5 text-ocean" aria-hidden /> Booking emails
        </h2>
        <Badge tone={configured ? "green" : "sun"}>{configured ? "Connected" : "Not connected"}</Badge>
      </div>
      <p className="text-sm text-ink-600">
        Confirmations, reminders and alerts go out from noreply@waitingforpaws.com.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending || !configured} onClick={() => run(sendTestEmail)}>
          Send a test to {email}
        </Button>
        <Result result={result} />
      </div>
    </Card>
  );
}
