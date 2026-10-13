"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isMovable, tint, useCalendar, walkerColor } from "@/components/calendar/context";
import { HandoffGlyph, StatusGlyph } from "@/components/calendar/event-bits";
import { clientName, petNames, shortName, stayLength, visitTimeLabel, type BookingDetail } from "@/lib/booking";
import { addDays, shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { GridColumn } from "./time-grid";

const MAX_ROWS = 3;
const ROW = 26;

type Bar = { b: BookingDetail; start: number; end: number; row: number; clipStart: boolean; clipEnd: boolean };

/** Stacks bars into rows so none overlap (longest first within the same start). */
export function stackBars<T extends { start: number; end: number }>(items: T[]): (T & { row: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const rowEnds: number[] = [];
  return sorted.map((it) => {
    let row = rowEnds.findIndex((end) => end < it.start);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(it.end);
    } else rowEnds[row] = it.end;
    return { ...it, row };
  });
}

/**
 * Full-day and overnight bookings above the hours: one bar across every day it covers (week view)
 * or in its walker's lane (day view). Drag a bar sideways to move it — stays keep their length.
 */
export function AllDayLane({
  columns,
  bookings,
  spanOf,
}: {
  columns: GridColumn[];
  bookings: BookingDetail[];
  /** First and last column a booking covers, or null if it isn't shown. Clipped to the view. */
  spanOf: (b: BookingDetail) => { start: number; end: number; clipStart: boolean; clipEnd: boolean } | null;
}) {
  const cal = useCalendar();
  const gridRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState<{ id: string; delta: number } | null>(null);
  const dragRef = useRef<{ bar: Bar; grabCol: number; x: number; y: number; moved: boolean; delta: number } | null>(null);
  const suppressClick = useRef(false);
  const byDate = !columns.some((c) => c.walkerId !== undefined);

  const bars = useMemo(() => {
    const items: Omit<Bar, "row">[] = [];
    for (const b of bookings) {
      const span = spanOf(b);
      if (span) items.push({ b, ...span });
    }
    return stackBars(items);
  }, [bookings, spanOf]);

  const rows = bars.reduce((m, x) => Math.max(m, x.row + 1), 0);
  const shownRows = expanded ? rows : Math.min(rows, MAX_ROWS);
  const hiddenCount = bars.filter((x) => x.row >= shownRows).length;

  useEffect(() => {
    const colAt = (clientX: number) => {
      const r = gridRef.current?.getBoundingClientRect();
      if (!r || !columns.length) return 0;
      return Math.min(columns.length - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * columns.length)));
    };
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
      let delta = colAt(e.clientX) - d.grabCol;
      if (!byDate) {
        // Day view: lanes are walkers, so a bar can only change lanes.
        const target = d.bar.start + delta;
        if (target < 0 || target >= columns.length || !columns[target]?.droppable) delta = 0;
      }
      if (delta !== d.delta) {
        d.delta = delta;
        setDrag({ id: d.bar.b.id, delta });
      }
    }
    function finish(commit: boolean) {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("cursor-grabbing", "select-none");
      setDrag(null);
      if (!d?.moved) return;
      suppressClick.current = true;
      cal.setDragging(false);
      if (!commit || d.delta === 0) return;
      const b = d.bar.b;
      if (byDate) cal.move(b, { date: addDays(b.service_date, d.delta) });
      else {
        const walkerId = columns[d.bar.start + d.delta]?.walkerId;
        if (walkerId) cal.move(b, { date: b.service_date, walkerId });
      }
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
  }, [cal, columns, byDate]);

  function startDrag(e: ReactPointerEvent, bar: Bar) {
    suppressClick.current = false;
    if (e.button !== 0 || e.pointerType === "touch" || !isMovable(bar.b)) return;
    const r = gridRef.current?.getBoundingClientRect();
    const grabCol = r ? Math.floor(((e.clientX - r.left) / r.width) * columns.length) : bar.start;
    dragRef.current = { bar, grabCol, x: e.clientX, y: e.clientY, moved: false, delta: 0 };
  }

  if (!bars.length) return null;
  const dragged = drag ? bars.find((x) => x.b.id === drag.id) : undefined;

  return (
    <div className="flex border-b border-ink-100 bg-sand/30">
      <div className="flex w-16 shrink-0 flex-col items-end justify-start gap-1 py-1.5 pr-2">
        <span className="text-[10px] font-extrabold tracking-wider text-ink-400 uppercase">All day</span>
        {rows > MAX_ROWS ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 text-[10px] font-extrabold text-ocean ring-1 ring-ink-100 hover:bg-sea-50"
            aria-expanded={expanded}
          >
            {expanded ? "Less" : `+${hiddenCount}`}
            <ChevronDown className={cn("size-3 transition", expanded && "rotate-180")} aria-hidden />
          </button>
        ) : null}
      </div>
      <div
        ref={gridRef}
        className="relative grid flex-1 gap-y-1 py-1.5"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, gridAutoRows: ROW }}
      >
        {/* Column dividers */}
        {columns.map((c, i) => (
          <div
            key={c.key}
            aria-hidden
            className={cn("pointer-events-none border-l border-ink-100", c.date === cal.today && byDate && "bg-sun-100/25")}
            style={{ gridColumn: i + 1, gridRow: `1 / span ${Math.max(1, shownRows)}` }}
          />
        ))}
        {bars
          .filter((x) => x.row < shownRows)
          .map((bar) => (
            <BarButton
              key={bar.b.id}
              bar={bar}
              ghosted={drag?.id === bar.b.id && drag.delta !== 0}
              onPointerDown={(e) => startDrag(e, bar)}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                cal.open(bar.b.id);
              }}
            />
          ))}
        {drag && dragged && drag.delta !== 0 ? (
          <div
            className="pointer-events-none z-20 flex items-center rounded-md border-2 border-dashed border-ink bg-white/90 px-2 text-[11px] font-extrabold text-ink shadow-xl"
            style={{
              gridColumn: `${Math.max(1, dragged.start + drag.delta + 1)} / ${Math.min(columns.length, dragged.end + drag.delta) + 2}`,
              gridRow: Math.min(dragged.row, Math.max(0, shownRows - 1)) + 1,
            }}
          >
            <span className="truncate">
              {byDate
                ? `${shortDate(addDays(dragged.b.service_date, drag.delta))} → ${shortDate(addDays(dragged.b.end_date, drag.delta))}`
                : (cal.walkers.get(columns[dragged.start + drag.delta]?.walkerId ?? "")?.display_name ?? "")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BarButton({
  bar,
  ghosted,
  onPointerDown,
  onClick,
}: {
  bar: Bar;
  ghosted: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onClick: () => void;
}) {
  const cal = useCalendar();
  const { b } = bar;
  const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
  const color = walkerColor(walker);
  const inactive = b.status === "canceled" || b.status === "declined";
  const who = petNames(b.pets) || clientName(b);
  const nights = b.kind === "stay" ? stayLength(b) : 0;
  const label = `${who} · ${b.title} · ${clientName(b)} · ${shortDate(b.service_date)}${b.kind === "stay" ? ` → ${shortDate(b.end_date)}` : ""} · ${visitTimeLabel(b, cal.windows, cal.timeZone)}`;

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onMouseEnter={(e) => cal.hoverStart(b, e.currentTarget)}
      onMouseLeave={cal.hoverEnd}
      onFocus={(e) => cal.hoverStart(b, e.currentTarget)}
      onBlur={cal.hoverEnd}
      className={cn(
        "z-10 mx-0.5 flex min-w-0 items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] leading-none text-ink shadow-[0_1px_2px_rgba(15,43,63,0.08)] transition hover:z-20 hover:shadow-md",
        bar.clipStart ? "rounded-l-none" : "rounded-l-md border-l-[3px]",
        bar.clipEnd ? "rounded-r-none" : "rounded-r-md",
        isMovable(b) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        b.status === "requested" && "outline-1 -outline-offset-1 outline-amber-500 outline-dashed",
        b.status === "completed" && "opacity-70",
        inactive && "line-through opacity-45",
        cal.isDimmed(b) && "opacity-20",
        ghosted && "opacity-30",
      )}
      style={{
        gridColumn: `${bar.start + 1} / ${bar.end + 2}`,
        gridRow: bar.row + 1,
        background: b.status === "requested" ? "var(--color-sun-100)" : tint(color, walker ? 22 : 12),
        borderLeftColor: color,
      }}
    >
      {bar.clipStart ? <ChevronLeft className="size-3 shrink-0 text-ink-400" aria-hidden /> : null}
      <StatusGlyph status={b.status} />
      <HandoffGlyph handoff={b.handoff} />
      <span aria-hidden>{b.kind === "stay" ? "🌙" : "☀️"}</span>
      <span className="truncate font-extrabold">{who}</span>
      <span className="hidden truncate font-semibold text-ink-600 sm:inline">
        · {shortName(clientName(b))}
        {nights ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}
      </span>
      {bar.clipEnd ? <ChevronRight className="ml-auto size-3 shrink-0 text-ink-400" aria-hidden /> : null}
    </button>
  );
}
