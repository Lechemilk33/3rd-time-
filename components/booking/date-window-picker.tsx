"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { windowRange, type Availability, type BookingWindow } from "@/lib/booking";
import { addDays, addMonths, daysBetween, formatYmd, longDate, startOfMonth, startOfWeek, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Month calendar with open days marked, then the arrival windows for the picked day.
 * `availability` only contains bookable slots (the server already applied notice/limits).
 */
export function DateWindowPicker({
  availability,
  windows,
  today,
  date,
  windowId,
  onChange,
  loading,
  blocked,
}: {
  availability: Availability[];
  windows: BookingWindow[];
  today: Ymd;
  date: Ymd | null;
  windowId: string | null;
  onChange: (date: Ymd, windowId: string | null) => void;
  loading?: boolean;
  /** Slots the pup already has a visit in ("date:windowId"). */
  blocked?: Set<string>;
}) {
  const byDay = useMemo(() => {
    const map = new Map<Ymd, Availability[]>();
    for (const a of availability) map.set(a.service_date, [...(map.get(a.service_date) ?? []), a]);
    return map;
  }, [availability]);

  const lastDay = useMemo(() => availability.reduce<Ymd>((max, a) => (a.service_date > max ? a.service_date : max), today), [availability, today]);
  const firstOpen = useMemo(
    () => [...byDay.entries()].filter(([, rows]) => rows.some((r) => r.remaining > 0)).map(([d]) => d).sort()[0],
    [byDay],
  );
  const [month, setMonth] = useState<Ymd>(startOfMonth(date ?? firstOpen ?? today));
  const from = startOfWeek(month);
  const days = daysBetween(from, addDays(from, 41));
  const canPrev = month > startOfMonth(today);
  const canNext = addMonths(month, 1) <= lastDay;
  const dayRows = date ? (byDay.get(date) ?? []) : [];
  const windowsById = new Map(windows.map((w) => [w.id, w]));

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => setMonth(addMonths(month, -1))}
            className="grid size-9 place-items-center rounded-full hover:bg-sea-50 disabled:opacity-30"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="font-display text-lg font-semibold">{formatYmd(month, { month: "long", year: "numeric" })}</p>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setMonth(addMonths(month, 1))}
            className="grid size-9 place-items-center rounded-full hover:bg-sea-50 disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-extrabold tracking-wide text-ink-400 uppercase">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="py-1">
              {d.charAt(0)}
            </span>
          ))}
        </div>
        <div className={cn("grid grid-cols-7 gap-1", loading && "animate-pulse")}>
          {days.map((d) => {
            const rows = byDay.get(d) ?? [];
            const open = rows.some((r) => r.remaining > 0);
            const full = rows.length > 0 && !open;
            const inMonth = d.startsWith(month.slice(0, 7));
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                disabled={!open}
                onClick={() => {
                  const firstWindow = rows.find((r) => r.remaining > 0)?.window_id ?? null;
                  onChange(d, rows.some((r) => r.window_id === windowId && r.remaining > 0) ? windowId : firstWindow);
                }}
                aria-label={`${longDate(d)}${open ? "" : full ? " (full)" : " (unavailable)"}`}
                aria-pressed={selected}
                className={cn(
                  "relative grid aspect-square place-items-center rounded-xl text-sm font-bold transition",
                  !inMonth && "opacity-40",
                  open && !selected && "bg-sea-50 text-ink hover:bg-sea-100",
                  !open && "cursor-not-allowed text-ink-200",
                  full && "line-through",
                  selected && "bg-ink text-white shadow-md",
                  d === today && !selected && "ring-2 ring-sun",
                )}
              >
                {Number(d.slice(8))}
                {open && !selected ? <span className="absolute bottom-1 size-1 rounded-full bg-ocean" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-3 text-xs font-semibold text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-sea-50" /> Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded ring-2 ring-sun" /> Today
          </span>
        </p>
      </div>

      <div>
        {date ? (
          <>
            <p className="mb-3 font-display text-lg font-semibold">{longDate(date)}</p>
            <div className="space-y-2">
              {windows
                .filter((w) => w.active)
                .map((w) => {
                  const a = dayRows.find((r) => r.window_id === w.id);
                  const taken = blocked?.has(`${date}:${w.id}`);
                  const available = Boolean(a && a.remaining > 0 && !taken);
                  const selected = w.id === windowId;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      disabled={!available}
                      onClick={() => onChange(date, w.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition",
                        selected ? "border-ocean bg-sea-50 shadow-sm" : "border-ink-100 bg-white hover:border-ink-200",
                        !available && "cursor-not-allowed opacity-50 hover:border-ink-100",
                      )}
                    >
                      <span>
                        <span className="block font-extrabold">{w.label}</span>
                        <span className="block text-sm text-ink-600">Arrive between {windowRange(w)}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold",
                          taken
                            ? "bg-sea-100 text-ocean"
                            : !a
                              ? "bg-ink-100 text-ink-400"
                              : a.remaining === 0
                                ? "bg-ink-100 text-ink-600"
                                : a.remaining <= 2
                                  ? "bg-sun-100 text-ink"
                                  : "bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {taken ? "Already booked" : !a ? "Unavailable" : a.remaining === 0 ? "Full" : a.remaining <= 2 ? `${a.remaining} left` : "Open"}
                      </span>
                    </button>
                  );
                })}
            </div>
            {windowsById.size ? (
              <p className="mt-3 text-sm text-ink-600">
                Your walker may pin an exact arrival time later — you’ll see it under My visits.
              </p>
            ) : null}
          </>
        ) : (
          <div className="grid h-full min-h-40 place-items-center rounded-2xl border-2 border-dashed border-sea-200 bg-sea-50/50 p-6 text-center">
            <p className="font-bold text-ink-600">
              {loading ? "Checking availability…" : firstOpen ? "Pick a day to see times" : "No open times right now — send us a message!"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
