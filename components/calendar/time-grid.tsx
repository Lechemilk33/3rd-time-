"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { isMovable, tint, useCalendar, walkerColor } from "@/components/calendar/context";
import { HandoffGlyph, StatusGlyph, WindowGlyph } from "@/components/calendar/event-bits";
import { clientName, isMultiDay, petNames, shortName, visitStartMinute, visitTimeLabel, type BookingDetail } from "@/lib/booking";
import { layoutOverlaps, type LayoutBox } from "@/lib/calendar";
import { minuteLabel, shortDate, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AllDayLane } from "./all-day-lane";

const PX = 1.2; // pixels per minute (72px per hour)
const SNAP = 15;
const MIN_HEIGHT = 26;

export type GridColumn = {
  key: string;
  date: Ymd;
  /** Day view: the walker this lane belongs to ("" = unassigned). */
  walkerId?: string;
  /** Can visits be dropped into this column from another one? */
  droppable: boolean;
  header: ReactNode;
};

type Placed = { b: BookingDetail; col: number; start: number; top: number; height: number; box: LayoutBox };

type DragState = { id: string; col: number; minute: number };

export function TimeGrid({
  columns,
  bookings: all,
  columnOf,
  spanOf,
  nowMinute,
  showWalker,
}: {
  columns: GridColumn[];
  bookings: BookingDetail[];
  /** Which column index a timed booking belongs to (-1 = not shown). */
  columnOf: (b: BookingDetail) => number;
  /** Columns a full-day / overnight booking covers (shown in the all-day lane). */
  spanOf: (b: BookingDetail) => { start: number; end: number; clipStart: boolean; clipEnd: boolean } | null;
  nowMinute: number;
  showWalker: boolean;
}) {
  const bookings = useMemo(() => all.filter((b) => !isMultiDay(b)), [all]);
  const ranged = useMemo(() => all.filter(isMultiDay), [all]);
  const cal = useCalendar();
  const windowMap = cal.windows;
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<{
    b: BookingDetail;
    startX: number;
    startY: number;
    grab: number;
    origCol: number;
    origMinute: number;
    duration: number;
    moved: boolean;
    target: DragState | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const [slot, setSlot] = useState<{ col: number; minute: number } | null>(null);

  // Hours shown: at least 7 AM – 7 PM, stretched to fit windows and visits.
  const { startMinute, endMinute } = useMemo(() => {
    let lo = 7 * 60;
    let hi = 19 * 60;
    for (const w of windowMap.values()) {
      if (!w.active) continue;
      lo = Math.min(lo, w.start_minute);
      hi = Math.max(hi, w.end_minute);
    }
    for (const b of bookings) {
      const s = visitStartMinute(b, windowMap);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s + b.duration_minutes);
    }
    return { startMinute: Math.max(0, Math.floor(lo / 60) * 60), endMinute: Math.min(1440, Math.ceil(hi / 60) * 60) };
  }, [bookings, windowMap]);

  const height = (endMinute - startMinute) * PX;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = startMinute; m < endMinute; m += 60) out.push(m);
    return out;
  }, [startMinute, endMinute]);

  const placed = useMemo(() => {
    const byCol = new Map<number, BookingDetail[]>();
    for (const b of bookings) {
      const col = columnOf(b);
      if (col < 0) continue;
      byCol.set(col, [...(byCol.get(col) ?? []), b]);
    }
    const out: Placed[] = [];
    for (const [col, list] of byCol) {
      const items = list.map((b) => {
        const start = visitStartMinute(b, windowMap);
        const visualEnd = start + Math.max(b.duration_minutes, MIN_HEIGHT / PX);
        return { id: b.id, start, end: visualEnd, b };
      });
      const boxes = layoutOverlaps(items);
      for (const it of items) {
        out.push({
          b: it.b,
          col,
          start: it.start,
          top: (it.start - startMinute) * PX,
          height: Math.max(MIN_HEIGHT, it.b.duration_minutes * PX),
          box: boxes.get(it.id) ?? { left: 0, width: 1 },
        });
      }
    }
    return out;
  }, [bookings, columnOf, windowMap, startMinute]);

  const minuteAt = useCallback(
    (clientY: number) => {
      const rect = colsRef.current?.getBoundingClientRect();
      return startMinute + (clientY - (rect?.top ?? 0)) / PX;
    },
    [startMinute],
  );

  const colAt = useCallback((clientX: number) => {
    const els = colsRef.current?.querySelectorAll<HTMLElement>("[data-col]") ?? [];
    let best = 0;
    let bestDist = Infinity;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dist = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }, []);

  const snap = (m: number) => Math.round(m / SNAP) * SNAP;

  // Window listeners for an active drag.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
      if (!d.moved) {
        d.moved = true;
        cal.setDragging(true);
        cal.hoverEnd();
        document.body.classList.add("cursor-grabbing", "select-none");
      }
      let col = colAt(e.clientX);
      if (col !== d.origCol && !columns[col]?.droppable) col = d.origCol;
      const minute = Math.min(
        Math.max(snap(minuteAt(e.clientY) - d.grab), startMinute),
        Math.max(startMinute, endMinute - d.duration),
      );
      if (!d.target || d.target.col !== col || d.target.minute !== minute) {
        d.target = { id: d.b.id, col, minute };
        setDrag(d.target);
      }
    }
    function finish(commit: boolean) {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("cursor-grabbing", "select-none");
      if (!d) return;
      if (d.moved) {
        suppressClick.current = true;
        cal.setDragging(false);
        const t = d.target;
        if (commit && t && (t.col !== d.origCol || t.minute !== d.origMinute)) {
          const column = columns[t.col];
          const walkerId = column.walkerId && column.walkerId !== d.b.walker_id ? column.walkerId : undefined;
          // A window visit dragged straight across keeps its window instead of getting a pinned time.
          const keepWindow = t.minute === d.origMinute && d.b.arrival_time == null && d.b.window_id != null;
          cal.move(d.b, { date: column.date, minute: keepWindow ? undefined : t.minute, walkerId });
        }
      }
      setDrag(null);
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
  }, [cal, colAt, columns, endMinute, minuteAt, startMinute]);

  function startDrag(e: ReactPointerEvent, p: Placed) {
    suppressClick.current = false;
    if (e.button !== 0 || e.pointerType === "touch" || !isMovable(p.b)) return;
    dragRef.current = {
      b: p.b,
      startX: e.clientX,
      startY: e.clientY,
      grab: minuteAt(e.clientY) - p.start,
      origCol: p.col,
      origMinute: p.start,
      duration: p.b.duration_minutes,
      moved: false,
      target: null,
    };
  }

  const dragged = drag ? placed.find((p) => p.b.id === drag.id) : undefined;
  const windows = [...cal.windows.values()].filter((w) => w.active);
  const wide = columns.length > 3;

  return (
    <div className="overflow-x-auto lg:overflow-visible">
      <div className={cn(wide && "min-w-[760px]")}>
        {/* Column headers */}
        <div className="sticky top-0 z-30 flex border-b border-ink-100 bg-white/95 backdrop-blur max-lg:static lg:rounded-t-3xl">
          <div className="w-16 shrink-0" />
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((c) => (
              <div key={c.key} className="min-w-0 border-l border-ink-100 px-2 py-2.5">
                {c.header}
              </div>
            ))}
          </div>
        </div>
        <AllDayLane columns={columns} bookings={ranged} spanOf={spanOf} />

        <div className="relative flex" style={{ height }}>
          {/* Hour labels + arrival windows */}
          <div className="relative w-16 shrink-0 select-none">
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-6 -translate-y-1/2 text-[11px] font-bold whitespace-nowrap text-ink-400"
                style={{ top: (m - startMinute) * PX }}
              >
                {m === startMinute ? "" : minuteLabel(m, true)}
              </span>
            ))}
            {windows.map((w) => (
              <span
                key={w.id}
                title={`${w.label} window`}
                className="absolute right-1 flex w-3.5 items-center justify-center rounded-full bg-sea-100"
                style={{ top: (w.start_minute - startMinute) * PX + 2, height: (w.end_minute - w.start_minute) * PX - 4 }}
              >
                <span className="text-[9px] font-extrabold tracking-wider text-ocean uppercase [writing-mode:vertical-rl] rotate-180">
                  {w.label}
                </span>
              </span>
            ))}
          </div>

          <div
            ref={colsRef}
            className="relative grid flex-1"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {/* Hour + half-hour lines */}
            <div className="pointer-events-none absolute inset-0">
              {hours.map((m) => (
                <div key={m}>
                  <div className="absolute inset-x-0 border-t border-ink-100" style={{ top: (m - startMinute) * PX }} />
                  <div className="absolute inset-x-0 border-t border-dashed border-ink-100/60" style={{ top: (m + 30 - startMinute) * PX }} />
                </div>
              ))}
            </div>

            {columns.map((c, colIndex) => {
              const isToday = c.date === cal.today;
              return (
                <div
                  key={c.key}
                  data-col={colIndex}
                  className={cn("relative min-w-0 border-l border-ink-100", isToday && "bg-sun-100/25")}
                  onPointerMove={(e) => {
                    if (dragRef.current) return;
                    if (!(e.target as HTMLElement).closest("[data-bg]")) return setSlot(null);
                    const minute = Math.floor(minuteAt(e.clientY) / SNAP) * SNAP;
                    if (!slot || slot.col !== colIndex || slot.minute !== minute) setSlot({ col: colIndex, minute });
                  }}
                  onPointerLeave={() => setSlot(null)}
                >
                  {/* Background: window bands, click to add */}
                  <button
                    type="button"
                    data-bg
                    tabIndex={-1}
                    aria-label={`Add a visit on ${shortDate(c.date)}`}
                    className="absolute inset-0 cursor-cell"
                    onClick={(e) => {
                      const minute = Math.floor(minuteAt(e.clientY) / SNAP) * SNAP;
                      cal.create({ date: c.date, minute, walkerId: c.walkerId || undefined });
                    }}
                  >
                    {windows.map((w) => (
                      <span
                        key={w.id}
                        className="pointer-events-none absolute inset-x-0 bg-sea-50/70"
                        style={{ top: (w.start_minute - startMinute) * PX, height: (w.end_minute - w.start_minute) * PX }}
                      />
                    ))}
                  </button>

                  {slot && slot.col === colIndex && !drag ? (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-0 flex items-center gap-1 rounded-lg border border-dashed border-ocean/50 bg-white/70 px-1.5 text-[11px] font-bold text-ocean"
                      style={{ top: (slot.minute - startMinute) * PX, height: 30 * PX }}
                    >
                      <Plus className="size-3" aria-hidden /> {minuteLabel(slot.minute)}
                    </div>
                  ) : null}

                  {isToday && nowMinute >= startMinute && nowMinute <= endMinute ? (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (nowMinute - startMinute) * PX }}>
                      <div className="relative h-0.5 bg-coral">
                        <span className="absolute -top-[5px] -left-[6px] size-3 rounded-full bg-coral ring-2 ring-white" />
                      </div>
                    </div>
                  ) : null}

                  {placed
                    .filter((p) => p.col === colIndex)
                    .map((p) => (
                      <EventBlock
                        key={p.b.id}
                        p={p}
                        showWalker={showWalker}
                        ghosted={drag?.id === p.b.id}
                        onPointerDown={(e) => startDrag(e, p)}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          cal.open(p.b.id);
                        }}
                      />
                    ))}

                  {drag && dragged && drag.col === colIndex ? (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-40 rounded-lg border-2 border-dashed border-ink bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-ink shadow-xl"
                      style={{ top: (drag.minute - startMinute) * PX, height: dragged.height }}
                    >
                      {minuteLabel(drag.minute)} · {petNames(dragged.b.pets) || clientName(dragged.b)}
                      <span className="block font-semibold text-ink-600">
                        {shortDate(c.date)}
                        {c.walkerId && c.walkerId !== dragged.b.walker_id
                          ? ` · ${cal.walkers.get(c.walkerId)?.display_name ?? ""}`
                          : ""}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventBlock({
  p,
  showWalker,
  ghosted,
  onPointerDown,
  onClick,
}: {
  p: Placed;
  showWalker: boolean;
  ghosted: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onClick: () => void;
}) {
  const cal = useCalendar();
  const { b } = p;
  const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
  const color = walkerColor(walker);
  const pinned = b.arrival_time != null || !b.window_id;
  const who = petNames(b.pets) || clientName(b);
  const client = shortName(clientName(b));
  const inactive = b.status === "canceled" || b.status === "declined";
  const label = `${who} · ${b.title} · ${client} · ${visitTimeLabel(b, cal.windows, cal.timeZone)}${walker ? ` · ${walker.display_name}` : " · Unassigned"}`;

  return (
    <button
      type="button"
      data-event
      aria-label={label}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onMouseEnter={(e) => cal.hoverStart(b, e.currentTarget)}
      onMouseLeave={cal.hoverEnd}
      onFocus={(e) => cal.hoverStart(b, e.currentTarget)}
      onBlur={cal.hoverEnd}
      className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-lg border-l-[3px] px-1.5 py-[3px] text-left text-[11px] leading-[1.3] text-ink shadow-[0_1px_2px_rgba(15,43,63,0.08)] transition-[box-shadow,opacity,transform] hover:z-30 hover:shadow-lg focus-visible:z-30",
        isMovable(b) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        b.status === "requested" && "outline-1 -outline-offset-1 outline-amber-500 outline-dashed",
        b.status === "completed" && "opacity-70",
        inactive && "opacity-45",
        cal.isDimmed(b) && "opacity-20",
        ghosted && "opacity-30",
      )}
      style={{
        top: p.top,
        height: p.height,
        left: `calc(${p.box.left * 100}% + 2px)`,
        width: `calc(${p.box.width * 100}% - 4px)`,
        background: b.status === "requested" ? "var(--color-sun-100)" : tint(color, walker ? 16 : 10),
        borderLeftColor: color,
        backgroundImage: walker ? undefined : "repeating-linear-gradient(135deg, transparent 0 6px, rgba(15,43,63,0.05) 6px 12px)",
      }}
    >
      <span className={cn("flex min-w-0 items-center gap-1 font-extrabold", inactive && "line-through")}>
        <StatusGlyph status={b.status} />
        <HandoffGlyph handoff={b.handoff} />
        {pinned ? (
          <span className="shrink-0 font-bold text-ink-600">{minuteLabel(p.start, true)}</span>
        ) : (
          <WindowGlyph />
        )}
        <span className="truncate">{who}</span>
      </span>
      {p.height >= 34 ? (
        <span className="truncate font-semibold text-ink-600">
          {client} · {b.title}
        </span>
      ) : null}
      {showWalker && p.height >= 50 ? (
        <span className="mt-auto truncate font-bold" style={{ color }}>
          {walker?.display_name ?? "Unassigned"}
        </span>
      ) : null}
    </button>
  );
}
