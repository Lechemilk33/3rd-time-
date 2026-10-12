"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, addMonths, daysBetween, formatYmd, startOfMonth, startOfWeek, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Small month picker for jumping to a date. */
export function MiniMonth({
  value,
  today,
  onSelect,
  marked,
}: {
  value: Ymd;
  today: Ymd;
  onSelect: (date: Ymd) => void;
  /** Dates that get a little dot (have visits). */
  marked?: Set<Ymd>;
}) {
  const [month, setMonth] = useState(startOfMonth(value));
  const from = startOfWeek(month);
  const days = daysBetween(from, addDays(from, 41));
  return (
    <div className="w-72 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="grid size-8 place-items-center rounded-full hover:bg-sea-50" aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </button>
        <p className="font-display font-semibold">{formatYmd(month, { month: "long", year: "numeric" })}</p>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="grid size-8 place-items-center rounded-full hover:bg-sea-50" aria-label="Next month">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-extrabold text-ink-400">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            className={cn(
              "relative grid h-9 place-items-center rounded-full text-sm font-bold transition hover:bg-sea-100",
              !d.startsWith(month.slice(0, 7)) && "text-ink-400",
              d === today && "text-ocean underline decoration-2 underline-offset-4",
              d === value && "bg-ink text-white hover:bg-ink",
            )}
          >
            {Number(d.slice(8))}
            {marked?.has(d) && d !== value ? <span className="absolute bottom-1 size-1 rounded-full bg-coral" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
