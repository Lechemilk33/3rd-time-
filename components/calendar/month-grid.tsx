"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { stackBars } from "@/components/calendar/all-day-lane";
import { isMovable, tint, useCalendar, walkerColor } from "@/components/calendar/context";
import { StatusGlyph } from "@/components/calendar/event-bits";
import { clientName, coversDay, isMultiDay, petNames, stayLength, visitStartMinute, type BookingDetail } from "@/lib/booking";
import { addDays, daysBetween, diffDays, minuteLabel, shortDate, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_ITEMS = 3;
const BAR_ROWS = 2;
const BAR = 20;

function dayUnder(x: number, y: number): Ymd | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const day = (el as HTMLElement).dataset?.day;
    if (day) return day;
  }
  return null;
}

export function MonthGrid({
  from,
  to,
  month,
  bookings,
  onShowDay,
}: {
  from: Ymd;
  to: Ymd;
  /** "YYYY-MM" of the month being shown (other days are dimmed). */
  month: string;
  bookings: BookingDetail[];
  onShowDay: (date: Ymd) => void;
}) {
  const cal = useCalendar();
  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const weeks = useMemo(() => {
    const out: Ymd[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const timedByDay = useMemo(() => {
    const map = new Map<Ymd, BookingDetail[]>();
    for (const b of bookings) {
      if (isMultiDay(b)) continue;
      map.set(b.service_date, [...(map.get(b.service_date) ?? []), b]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => visitStartMinute(a, cal.windows) - visitStartMinute(b, cal.windows));
    }
    return map;
  }, [bookings, cal.windows]);

  const ranged = useMemo(() => bookings.filter(isMultiDay), [bookings]);

  const [drop, setDrop] = useState<{ day: Ymd; b: BookingDetail; shift: number } | null>(null);
  const dragRef = useRef<{ b: BookingDetail; grab: Ymd; x: number; y: number; moved: boolean; shift: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      if (!d.moved) {
        d.moved = true;
        cal.setDragging(true);
        cal.hoverEnd();
        document.body.classList.add("cursor-grabbing", "select-none");
      }
      const day = dayUnder(e.clientX, e.clientY);
      d.shift = day ? diffDays(day, d.grab) : 0;
      setDrop(day ? { day, b: d.b, shift: d.shift } : null);
    }
    function finish(commit: boolean) {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("cursor-grabbing", "select-none");
      setDrop(null);
      if (!d?.moved) return;
      suppressClick.current = true;
      cal.setDragging(false);
      if (commit && d.shift !== 0) cal.move(d.b, { date: addDays(d.b.service_date, d.shift) });
    }
    const onUp = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [cal]);

  function startDrag(e: ReactPointerEvent, b: BookingDetail) {
    suppressClick.current = false;
    if (e.button !== 0 || e.pointerType === "touch" || !isMovable(b)) return;
    const grab = dayUnder(e.clientX, e.clientY) ?? b.service_date;
    dragRef.current = { b, grab, x: e.clientX, y: e.clientY, moved: false, shift: 0 };
  }

  const clicked = (b: BookingDetail) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    cal.open(b.id);
  };

  // Days the dragged booking would land on.
  const dropDays = useMemo(() => {
    if (!drop) return new Set<Ymd>();
    const start = addDays(drop.b.service_date, drop.shift);
    const end = addDays(drop.b.end_date ?? drop.b.service_date, drop.shift);
    return new Set(daysBetween(start, end));
  }, [drop]);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-ink-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-extrabold tracking-wide text-ink-400 uppercase">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const first = week[0];
        const last = week[week.length - 1];
        const bars = stackBars(
          ranged
            .filter((b) => b.service_date <= last && (b.end_date ?? b.service_date) >= first)
            .map((b) => {
              const end = b.end_date ?? b.service_date;
              return {
                b,
                start: Math.max(0, diffDays(b.service_date, first)),
                end: Math.min(6, diffDays(end, first)),
                clipStart: b.service_date < first,
                clipEnd: end > last,
              };
            }),
        );
        const rows = Math.min(BAR_ROWS, bars.reduce((m, x) => Math.max(m, x.row + 1), 0));
        const reserved = rows * (BAR + 2);
        return (
          <div key={first} className="relative grid grid-cols-7">
            {week.map((day, i) => {
              const timed = timedByDay.get(day) ?? [];
              const hiddenBars = bars.filter((x) => x.row >= rows && coversDay(x.b, day)).length;
              const room = Math.max(1, MAX_ITEMS - rows);
              const shown = timed.length + hiddenBars > room ? timed.slice(0, room - 1) : timed;
              const extra = timed.length - shown.length + hiddenBars;
              const inMonth = day.startsWith(month);
              const isToday = day === cal.today;
              const total = timed.length + bars.filter((x) => coversDay(x.b, day)).length;
              return (
                <div
                  key={day}
                  data-day={day}
                  className={cn(
                    "group relative min-h-28 border-b border-ink-100 p-1 sm:min-h-32 sm:p-1.5",
                    i % 7 !== 0 && "border-l",
                    !inMonth && "bg-ink-100/25",
                    dropDays.has(day) && "bg-sea-100",
                    drop?.day === day && "ring-2 ring-ocean ring-inset",
                  )}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Add a booking on ${shortDate(day)}`}
                    className="absolute inset-0 cursor-cell"
                    // Phones: a tap on a tiny cell means "show me this day", not "start a booking".
                    onClick={() =>
                      window.matchMedia("(hover: none), (max-width: 639px)").matches ? onShowDay(day) : cal.create({ date: day })
                    }
                  />
                  <div className="relative mb-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onShowDay(day)}
                      className={cn(
                        "grid size-7 place-items-center rounded-full text-sm font-bold transition hover:bg-sea-100",
                        isToday ? "bg-ink text-white hover:bg-ink" : inMonth ? "text-ink" : "text-ink-400",
                      )}
                      aria-label={`Open ${shortDate(day)}`}
                    >
                      {Number(day.slice(8))}
                    </button>
                    {total ? <span className="hidden text-[10px] font-bold text-ink-400 sm:inline">{total}</span> : null}
                  </div>
                  <div className="relative space-y-0.5" style={{ marginTop: reserved }}>
                    {shown.map((b) => {
                      const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
                      const color = walkerColor(walker);
                      const inactive = b.status === "canceled" || b.status === "declined";
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onPointerDown={(e) => startDrag(e, b)}
                          onClick={clicked(b)}
                          onMouseEnter={(e) => cal.hoverStart(b, e.currentTarget)}
                          onMouseLeave={cal.hoverEnd}
                          onFocus={(e) => cal.hoverStart(b, e.currentTarget)}
                          onBlur={cal.hoverEnd}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] leading-tight transition hover:bg-sea-100",
                            isMovable(b) ? "cursor-grab" : "cursor-pointer",
                            b.status === "requested" && "bg-sun-100 outline-1 -outline-offset-1 outline-amber-500 outline-dashed",
                            inactive && "line-through opacity-50",
                            b.status === "completed" && "opacity-60",
                            cal.isDimmed(b) && "opacity-20",
                          )}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                          <StatusGlyph status={b.status} />
                          <span className="hidden shrink-0 font-bold text-ink-600 sm:inline">
                            {minuteLabel(visitStartMinute(b, cal.windows), true)}
                          </span>
                          <span className="truncate font-bold">{petNames(b.pets) || clientName(b)}</span>
                        </button>
                      );
                    })}
                    {extra > 0 ? (
                      <button
                        type="button"
                        onClick={() => onShowDay(day)}
                        className="w-full rounded-md px-1 py-0.5 text-left text-[11px] font-extrabold text-ocean hover:bg-sea-100"
                      >
                        +{extra} more
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {/* Full-day and overnight bars across the week */}
            {rows ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-9 grid grid-cols-7 gap-y-0.5 sm:top-10"
                style={{ gridAutoRows: BAR }}
              >
                {bars
                  .filter((x) => x.row < rows)
                  .map((x) => {
                    const b = x.b;
                    const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
                    const color = walkerColor(walker);
                    const inactive = b.status === "canceled" || b.status === "declined";
                    const nights = b.kind === "stay" ? stayLength(b) : 0;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onPointerDown={(e) => startDrag(e, b)}
                        onClick={clicked(b)}
                        onMouseEnter={(e) => cal.hoverStart(b, e.currentTarget)}
                        onMouseLeave={cal.hoverEnd}
                        onFocus={(e) => cal.hoverStart(b, e.currentTarget)}
                        onBlur={cal.hoverEnd}
                        aria-label={`${petNames(b.pets) || clientName(b)} · ${b.title} · ${shortDate(b.service_date)}${b.kind === "stay" ? ` to ${shortDate(b.end_date)}` : ""}`}
                        className={cn(
                          "pointer-events-auto mx-1 flex min-w-0 items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] leading-none text-ink transition hover:shadow-md",
                          x.clipStart ? "-ml-px rounded-l-none" : "rounded-l-md border-l-[3px]",
                          x.clipEnd ? "-mr-px rounded-r-none" : "rounded-r-md",
                          isMovable(b) ? "cursor-grab" : "cursor-pointer",
                          b.status === "requested" && "outline-1 -outline-offset-1 outline-amber-500 outline-dashed",
                          inactive && "line-through opacity-50",
                          b.status === "completed" && "opacity-60",
                          cal.isDimmed(b) && "opacity-20",
                        )}
                        style={{
                          gridColumn: `${x.start + 1} / ${x.end + 2}`,
                          gridRow: x.row + 1,
                          background: b.status === "requested" ? "var(--color-sun-100)" : tint(color, walker ? 22 : 12),
                          borderLeftColor: color,
                        }}
                      >
                        <StatusGlyph status={b.status} />
                        <span aria-hidden>{b.kind === "stay" ? "🌙" : "☀️"}</span>
                        <span className="truncate font-bold">{petNames(b.pets) || clientName(b)}</span>
                        {nights && x.end - x.start >= 2 ? (
                          <span className="hidden shrink-0 font-semibold text-ink-600 sm:inline">
                            · {nights} night{nights === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
