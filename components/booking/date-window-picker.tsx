"use client";

import { useMemo } from "react";
import { windowRange, type Availability, type BookingWindow } from "@/lib/booking";
import { longDate, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MonthGrid, NothingOpen } from "./month-grid";

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
  const dayRows = date ? (byDay.get(date) ?? []) : [];
  const windowsById = new Map(windows.map((w) => [w.id, w]));

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
      <MonthGrid
        today={today}
        initialMonth={date ?? firstOpen ?? today}
        lastDay={lastDay}
        loading={loading}
        look={(d) => {
          const rows = byDay.get(d) ?? [];
          // Open = a window with room that the pup isn't already booked in.
          const open = rows.some((r) => r.remaining > 0 && !blocked?.has(`${d}:${r.window_id}`));
          return { enabled: open, open, full: rows.length > 0 && !open, selected: d === date };
        }}
        onPick={(d) => {
          const usable = (byDay.get(d) ?? []).filter((r) => r.remaining > 0 && !blocked?.has(`${d}:${r.window_id}`));
          onChange(d, usable.some((r) => r.window_id === windowId) ? windowId : (usable[0]?.window_id ?? null));
        }}
      />

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
              {loading ? "Checking availability…" : firstOpen ? "Pick a day to see times" : <NothingOpen what="times" />}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
