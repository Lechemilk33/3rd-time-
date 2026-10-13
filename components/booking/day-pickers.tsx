"use client";

import { LoaderCircle, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getTimeSlots } from "@/app/portal/booking-actions";
import { serviceEndMinute, serviceStartMinute, UNLIMITED, type DayAvailability } from "@/lib/booking";
import { addDays, diffDays, longDate, minuteLabel, shortDate, type Ymd } from "@/lib/dates";
import type { Service } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MonthGrid, NothingOpen } from "./month-grid";

function nightsLabel(n: number) {
  return `${n} night${n === 1 ? "" : "s"}`;
}

function spotsNote(a: DayAvailability | undefined) {
  if (!a || a.capacity >= UNLIMITED) return undefined;
  return a.remaining > 0 && a.remaining <= 2 && a.remaining < a.capacity ? `${a.remaining} left` : undefined;
}

/** Overnight stays: pick check-in, then check-out. Every night in between needs a spot. */
export function StayPicker({
  service,
  days,
  today,
  lastStart,
  loading,
  checkIn,
  checkOut,
  onChange,
}: {
  service: Pick<Service, "kind" | "start_minute" | "end_minute" | "min_nights" | "max_nights">;
  days: DayAvailability[];
  today: Ymd;
  /** Latest check-in allowed. */
  lastStart: Ymd;
  loading?: boolean;
  checkIn: Ymd | null;
  checkOut: Ymd | null;
  onChange: (checkIn: Ymd | null, checkOut: Ymd | null) => void;
}) {
  const [hover, setHover] = useState<Ymd | null>(null);
  const byDay = useMemo(() => new Map(days.map((d) => [d.service_date, d])), [days]);
  const lastDay = useMemo(() => days.reduce<Ymd>((max, d) => (d.service_date > max ? d.service_date : max), addDays(today, 30)), [days, today]);
  const nightOpen = (d: Ymd) => (byDay.get(d)?.remaining ?? 0) > 0;
  // A check-in only works if the shortest allowed stay fits from there.
  const canCheckIn = (d: Ymd) => {
    if (d > lastStart) return false;
    for (let i = 0; i < Math.max(1, service.min_nights); i++) if (!nightOpen(addDays(d, i))) return false;
    return true;
  };

  /** Furthest valid check-out from this check-in (every night open, up to max nights). */
  const maxOut = useMemo(() => {
    if (!checkIn) return null;
    let out = checkIn;
    for (let i = 0; i < service.max_nights && (byDay.get(out)?.remaining ?? 0) > 0; i++) out = addDays(out, 1);
    return out;
  }, [checkIn, byDay, service.max_nights]);
  const canCheckOut = (d: Ymd) =>
    Boolean(checkIn && maxOut && d > checkIn && d <= maxOut && diffDays(d, checkIn) >= service.min_nights);

  const picking = Boolean(checkIn && !checkOut);
  const end = checkOut ?? (picking && hover && canCheckOut(hover) ? hover : null);
  const nights = checkIn && end ? diffDays(end, checkIn) : 0;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
      <MonthGrid
        today={today}
        initialMonth={checkIn ?? days.find((d) => d.remaining > 0)?.service_date ?? today}
        lastDay={lastDay}
        loading={loading}
        onHover={setHover}
        look={(d) => {
          const a = byDay.get(d);
          const isStart = d === checkIn;
          const isEnd = d === end;
          const between = Boolean(checkIn && end && d > checkIn && d < end);
          const enabled = picking ? canCheckOut(d) || canCheckIn(d) : canCheckIn(d);
          return {
            enabled,
            open: picking ? canCheckOut(d) : canCheckIn(d),
            // The check-out day itself doesn't need a spot.
            full: Boolean(a && a.remaining === 0) && !(picking && canCheckOut(d)),
            rangeStart: isStart && Boolean(end),
            rangeEnd: isEnd,
            selected: isStart && !end,
            inRange: between,
            note: picking ? undefined : spotsNote(a),
            label: `${longDate(d)}${picking && canCheckOut(d) ? ` — check out (${nightsLabel(diffDays(d, checkIn!))})` : ""}`,
          };
        }}
        onPick={(d) => {
          if (picking && canCheckOut(d)) onChange(checkIn, d);
          else if (canCheckIn(d)) onChange(d, null);
        }}
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Ends
            icon={<Sun className="size-4" aria-hidden />}
            label="Check-in"
            date={checkIn}
            time={minuteLabel(serviceStartMinute(service))}
            active={!checkIn}
            onClick={() => onChange(null, null)}
          />
          <Ends
            icon={<Moon className="size-4" aria-hidden />}
            label="Check-out"
            date={checkOut}
            time={minuteLabel(serviceEndMinute(service))}
            active={picking}
            onClick={checkOut ? () => onChange(checkIn, null) : undefined}
          />
        </div>
        <p className={cn("rounded-2xl p-4 text-sm font-bold", nights ? "bg-sea-50 text-ink" : "bg-ink-100/40 text-ink-600")}>
          {loading
            ? "Checking availability…"
            : !checkIn
              ? days.some((d) => d.remaining > 0)
                ? "Tap your check-in date."
                : <NothingOpen what="nights" />
              : !end
                ? `Now tap check-out. Stays are ${
                    service.min_nights === service.max_nights ? nightsLabel(service.min_nights) : `${service.min_nights}–${service.max_nights} nights`
                  }.`
                : `${nightsLabel(nights)} · ${shortDate(checkIn)} → ${shortDate(end)}`}
        </p>
      </div>
    </div>
  );
}

function Ends({
  icon,
  label,
  date,
  time,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  date: Ymd | null;
  time: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn("rounded-2xl border-2 p-3 text-left transition", active ? "border-ocean bg-sea-50" : "border-ink-100 bg-white", onClick && "hover:border-ink-200")}
    >
      <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider text-ink-400 uppercase">
        {icon} {label}
      </span>
      <span className="mt-1 block font-extrabold">{date ? shortDate(date) : "—"}</span>
      <span className="block text-sm text-ink-600">{label === "Check-in" ? `from ${time}` : `by ${time}`}</span>
    </button>
  );
}

/** Full-day services: pick one or more days. */
export function DaysPicker({
  service,
  days,
  today,
  lastStart,
  loading,
  selected,
  onChange,
  max = 30,
}: {
  service: Pick<Service, "kind" | "start_minute" | "end_minute">;
  days: DayAvailability[];
  today: Ymd;
  lastStart: Ymd;
  loading?: boolean;
  selected: Ymd[];
  onChange: (days: Ymd[]) => void;
  max?: number;
}) {
  const byDay = useMemo(() => new Map(days.map((d) => [d.service_date, d])), [days]);
  const lastDay = useMemo(() => days.reduce<Ymd>((m, d) => (d.service_date > m ? d.service_date : m), addDays(today, 30)), [days, today]);
  const can = (d: Ymd) => d <= lastStart && (byDay.get(d)?.remaining ?? 0) > 0;
  const sorted = [...selected].sort();

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
      <MonthGrid
        today={today}
        initialMonth={sorted[0] ?? days.find((d) => d.remaining > 0)?.service_date ?? today}
        lastDay={lastDay}
        loading={loading}
        look={(d) => {
          const a = byDay.get(d);
          const on = selected.includes(d);
          return { enabled: on || can(d), open: can(d), full: Boolean(a && a.remaining === 0), selected: on, note: spotsNote(a) };
        }}
        onPick={(d) => {
          if (selected.includes(d)) onChange(selected.filter((x) => x !== d));
          else if (selected.length < max) onChange([...selected, d]);
        }}
      />
      <div className="space-y-3">
        <p className="rounded-2xl bg-sea-50 p-4 text-sm font-bold">
          Drop-off from {minuteLabel(serviceStartMinute(service))}, pick-up by {minuteLabel(serviceEndMinute(service))}.
          <span className="block font-semibold text-ink-600">{max <= 2 ? "Tap the new day." : "Tap as many days as you like."}</span>
        </p>
        {sorted.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {sorted.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((x) => x !== d))}
                  className="min-h-10 rounded-full bg-ink px-3.5 text-sm font-bold text-white hover:bg-ink-600"
                  aria-label={`Remove ${longDate(d)}`}
                >
                  {shortDate(d)} ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-bold text-ink-600">
            {loading ? "Checking availability…" : days.some((d) => d.remaining > 0) ? "No days picked yet." : <NothingOpen what="days" />}
          </p>
        )}
      </div>
    </div>
  );
}

/** Set-time services: pick a day, then a start time. */
export function TimeSlotPicker({
  serviceId,
  openDays,
  today,
  lastDay,
  loading,
  date,
  minute,
  onChange,
  length,
  slotsFor = getTimeSlots,
}: {
  serviceId: string;
  /** Days that have any open time. */
  openDays: Set<Ymd>;
  today: Ymd;
  lastDay: Ymd;
  loading?: boolean;
  date: Ymd | null;
  minute: number | null;
  onChange: (date: Ymd, minute: number | null) => void;
  /** Appointment length, when the client picks one (longer ones fit fewer start times). */
  length?: number | null;
  slotsFor?: (serviceId: string, date: Ymd, length?: number | null) => Promise<{ minute: number }[]>;
}) {
  const [slots, setSlots] = useState<{ key: string; minutes: number[] } | null>(null);
  const key = date ? `${serviceId}:${date}:${length ?? ""}` : null;
  const current = slots && slots.key === key ? slots.minutes : null;

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    slotsFor(serviceId, date, length).then((rows) => {
      if (!cancelled) setSlots({ key: `${serviceId}:${date}:${length ?? ""}`, minutes: rows.map((r) => r.minute) });
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId, date, length, slotsFor]);

  const groups = useMemo(() => {
    const g: { label: string; minutes: number[] }[] = [
      { label: "Morning", minutes: [] },
      { label: "Afternoon", minutes: [] },
      { label: "Evening", minutes: [] },
    ];
    for (const m of current ?? []) g[m < 720 ? 0 : m < 1020 ? 1 : 2].minutes.push(m);
    return g.filter((x) => x.minutes.length);
  }, [current]);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
      <MonthGrid
        today={today}
        initialMonth={date ?? [...openDays].sort()[0] ?? today}
        lastDay={lastDay}
        loading={loading}
        look={(d) => ({ enabled: openDays.has(d), open: openDays.has(d), selected: d === date })}
        onPick={(d) => onChange(d, null)}
      />
      <div>
        {date ? (
          <>
            <p className="mb-3 font-display text-lg font-semibold">{longDate(date)}</p>
            {current === null ? (
              <p className="flex items-center gap-2 text-ink-600">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Finding open times…
              </p>
            ) : groups.length ? (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-1.5 text-xs font-extrabold tracking-wider text-ink-400 uppercase">{g.label}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {g.minutes.map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={m === minute}
                          onClick={() => onChange(date, m)}
                          className={cn(
                            "rounded-xl border-2 px-2 py-2.5 text-sm font-extrabold transition",
                            m === minute ? "border-ink bg-ink text-white shadow-md" : "border-ink-100 bg-white hover:border-ocean",
                          )}
                        >
                          {minuteLabel(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-ink-100/40 p-4 font-bold text-ink-600">No times left this day — try another.</p>
            )}
          </>
        ) : (
          <div className="grid h-full min-h-40 place-items-center rounded-2xl border-2 border-dashed border-sea-200 bg-sea-50/50 p-6 text-center">
            <p className="font-bold text-ink-600">
              {loading ? "Checking availability…" : openDays.size ? "Pick a day to see times" : <NothingOpen what="times" />}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
