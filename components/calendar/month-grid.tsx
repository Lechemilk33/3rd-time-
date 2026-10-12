"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isMovable, useCalendar, walkerColor } from "@/components/calendar/context";
import { StatusGlyph } from "@/components/calendar/event-bits";
import { clientName, petNames, visitStartMinute, type BookingDetail } from "@/lib/booking";
import { daysBetween, minuteLabel, shortDate, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

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
  const byDay = useMemo(() => {
    const map = new Map<Ymd, BookingDetail[]>();
    for (const b of bookings) map.set(b.service_date, [...(map.get(b.service_date) ?? []), b]);
    for (const list of map.values()) {
      list.sort((a, b) => visitStartMinute(a, cal.windows) - visitStartMinute(b, cal.windows));
    }
    return map;
  }, [bookings, cal.windows]);

  const [dropDate, setDropDate] = useState<Ymd | null>(null);
  const dragRef = useRef<{ b: BookingDetail; x: number; y: number; moved: boolean; target: Ymd | null } | null>(null);
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
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-day]");
      d.target = (el?.dataset.day as Ymd | undefined) ?? null;
      setDropDate(d.target);
    }
    function finish(commit: boolean) {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("cursor-grabbing", "select-none");
      setDropDate(null);
      if (!d?.moved) return;
      suppressClick.current = true;
      cal.setDragging(false);
      if (commit && d.target && d.target !== d.b.service_date) cal.move(d.b, { date: d.target });
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
    dragRef.current = { b, x: e.clientX, y: e.clientY, moved: false, target: null };
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-ink-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-extrabold tracking-wide text-ink-400 uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const list = byDay.get(day) ?? [];
          const inMonth = day.startsWith(month);
          const isToday = day === cal.today;
          const extra = list.length - MAX_CHIPS;
          return (
            <div
              key={day}
              data-day={day}
              className={cn(
                "group relative min-h-28 border-b border-ink-100 p-1 sm:min-h-32 sm:p-1.5",
                i % 7 !== 0 && "border-l",
                !inMonth && "bg-ink-100/25",
                dropDate === day && "bg-sea-100 ring-2 ring-ocean ring-inset",
              )}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Add a visit on ${shortDate(day)}`}
                className="absolute inset-0 cursor-cell"
                onClick={() => cal.create({ date: day })}
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
                {list.length ? (
                  <span className="hidden text-[10px] font-bold text-ink-400 sm:inline">{list.length}</span>
                ) : null}
              </div>
              <div className="relative space-y-0.5">
                {list.slice(0, MAX_CHIPS).map((b) => {
                  const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
                  const color = walkerColor(walker);
                  const inactive = b.status === "canceled" || b.status === "declined";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onPointerDown={(e) => startDrag(e, b)}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        cal.open(b.id);
                      }}
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
      </div>
    </div>
  );
}
