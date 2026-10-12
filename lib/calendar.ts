import {
  addDays,
  addMonths,
  formatYmd,
  startOfMonth,
  startOfWeek,
  type Ymd,
} from "@/lib/dates";

export const CALENDAR_VIEWS = ["day", "week", "month", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export function isCalendarView(v: unknown): v is CalendarView {
  return typeof v === "string" && (CALENDAR_VIEWS as readonly string[]).includes(v);
}

/** Dates a view shows (inclusive). */
export function viewRange(view: CalendarView, date: Ymd): { from: Ymd; to: Ymd } {
  switch (view) {
    case "day":
      return { from: date, to: date };
    case "week": {
      const from = startOfWeek(date);
      return { from, to: addDays(from, 6) };
    }
    case "month": {
      const from = startOfWeek(startOfMonth(date));
      return { from, to: addDays(from, 41) };
    }
    case "agenda":
      return { from: date, to: addDays(date, 29) };
  }
}

export function stepDate(view: CalendarView, date: Ymd, direction: 1 | -1): Ymd {
  switch (view) {
    case "day":
      return addDays(date, direction);
    case "week":
      return addDays(date, 7 * direction);
    case "month":
      return addMonths(date, direction);
    case "agenda":
      return addDays(date, 30 * direction);
  }
}

export function viewTitle(view: CalendarView, date: Ymd): string {
  if (view === "day") return formatYmd(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (view === "month") return formatYmd(date, { month: "long", year: "numeric" });
  const { from, to } = viewRange(view, date);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const left = formatYmd(from, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  // Day + year without a month formats oddly in some browsers ("2026 (day: 18)"), so build it by hand.
  const right = sameMonth
    ? `${Number(to.slice(8))}, ${to.slice(0, 4)}`
    : formatYmd(to, { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

export type LayoutItem = { id: string; start: number; end: number };
export type LayoutBox = { left: number; width: number };

/**
 * Side-by-side layout for overlapping events in one column (like Google Calendar): each cluster of
 * overlapping events is split into lanes, and events stretch into empty lanes on their right.
 */
export function layoutOverlaps(items: LayoutItem[]): Map<string, LayoutBox> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const result = new Map<string, LayoutBox>();
  let cluster: { item: LayoutItem; lane: number }[] = [];
  let lanes: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const count = lanes.length;
    for (const { item, lane } of cluster) {
      // Expand right while the next lanes are free for this event's whole span.
      let span = 1;
      for (let next = lane + 1; next < count; next++) {
        const blocked = cluster.some((o) => o.lane === next && o.item.start < item.end && item.start < o.item.end);
        if (blocked) break;
        span++;
      }
      result.set(item.id, { left: lane / count, width: span / count });
    }
    cluster = [];
    lanes = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let lane = lanes.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(item.end);
    } else {
      lanes[lane] = item.end;
    }
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}
