"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { addDays, addMonths, daysBetween, formatYmd, longDate, startOfMonth, startOfWeek, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DayLook = {
  /** Can be clicked. */
  enabled: boolean;
  /** Has open spots (shows the dot and soft fill). */
  open?: boolean;
  full?: boolean;
  selected?: boolean;
  /** Part of a picked range (between the ends). */
  inRange?: boolean;
  rangeStart?: boolean;
  rangeEnd?: boolean;
  /** Small text under the number ("2 left"). */
  note?: string;
  label?: string;
};

/** Month calendar used by every booking picker. */
export function MonthGrid({
  today,
  initialMonth,
  lastDay,
  look,
  onPick,
  onHover,
  loading,
  legend,
}: {
  today: Ymd;
  initialMonth: Ymd;
  /** Furthest day that can be shown. */
  lastDay: Ymd;
  look: (d: Ymd) => DayLook;
  onPick: (d: Ymd) => void;
  onHover?: (d: Ymd | null) => void;
  loading?: boolean;
  legend?: ReactNode;
}) {
  const [month, setMonth] = useState<Ymd>(startOfMonth(initialMonth));
  const from = startOfWeek(month);
  const days = daysBetween(from, addDays(from, 41));
  const canPrev = month > startOfMonth(today);
  const canNext = addMonths(month, 1) <= lastDay;

  return (
    <div onPointerLeave={() => onHover?.(null)}>
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
      <div className={cn("grid grid-cols-7 gap-y-1", loading && "animate-pulse")}>
        {days.map((d) => {
          const l = look(d);
          const inMonth = d.startsWith(month.slice(0, 7));
          const end = l.selected || l.rangeStart || l.rangeEnd;
          return (
            <div
              key={d}
              className={cn(
                "relative px-0.5",
                l.inRange && "bg-sea-100",
                l.rangeStart && !l.rangeEnd && "rounded-l-xl bg-gradient-to-r from-transparent from-50% to-sea-100 to-50%",
                l.rangeEnd && !l.rangeStart && "rounded-r-xl bg-gradient-to-l from-transparent from-50% to-sea-100 to-50%",
              )}
            >
              <button
                type="button"
                disabled={!l.enabled}
                onClick={() => onPick(d)}
                onPointerEnter={() => onHover?.(d)}
                onFocus={() => onHover?.(d)}
                aria-label={l.label ?? `${longDate(d)}${l.enabled ? "" : l.full ? " (full)" : " (unavailable)"}`}
                aria-pressed={Boolean(end)}
                className={cn(
                  "relative grid aspect-square w-full place-items-center rounded-xl text-sm font-bold transition",
                  !inMonth && "opacity-40",
                  l.enabled && !end && !l.inRange && (l.open ? "bg-sea-50 text-ink hover:bg-sea-100" : "text-ink hover:bg-sea-50"),
                  l.enabled && l.inRange && !end && "text-ink hover:bg-sea-200",
                  !l.enabled && !l.inRange && "cursor-not-allowed text-ink-200",
                  !l.enabled && l.inRange && "cursor-not-allowed text-ink-600",
                  l.full && !end && "line-through",
                  end && "bg-ink text-white shadow-md",
                  d === today && !end && "ring-2 ring-sun",
                )}
              >
                <span className="leading-none">{Number(d.slice(8))}</span>
                {l.note && !end ? (
                  <span className="absolute bottom-0.5 text-[9px] leading-none font-extrabold text-amber-700">{l.note}</span>
                ) : l.open && !end && !l.inRange ? (
                  <span className="absolute bottom-1 size-1 rounded-full bg-ocean" aria-hidden />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded bg-sea-50 ring-1 ring-sea-100" /> Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded ring-2 ring-sun" /> Today
        </span>
        {legend}
      </div>
    </div>
  );
}
