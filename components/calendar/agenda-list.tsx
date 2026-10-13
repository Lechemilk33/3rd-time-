"use client";

import { CalendarDays, KeyRound, MapPin, Phone } from "lucide-react";
import { useMemo } from "react";
import { useCalendar, walkerColor } from "@/components/calendar/context";
import { HandoffGlyph, PetStack, StatusGlyph } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import {
  clientName,
  isMultiDay,
  petNames,
  STATUS_META,
  stayLength,
  visitStartMinute,
  visitTimeLabel,
  type BookingDetail,
} from "@/lib/booking";
import { addDays, daysBetween, diffDays, isoToLocalMinutes, longDate, minuteLabel, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** What a full-day / overnight booking means on one of its days. */
function rangedLabel(b: BookingDetail, day: Ymd, timeZone: string) {
  if (b.kind !== "stay") return null;
  if (day === b.service_date) return `Check-in · from ${minuteLabel(isoToLocalMinutes(b.start_time, timeZone))}`;
  if (day === b.end_date) return `Check-out · by ${b.end_time ? minuteLabel(isoToLocalMinutes(b.end_time, timeZone)) : ""}`;
  return `Staying · night ${diffDays(day, b.service_date) + 1} of ${stayLength(b)}`;
}

export function AgendaList({ bookings, from, to }: { bookings: BookingDetail[]; from: Ymd; to: Ymd }) {
  const cal = useCalendar();
  const groups = useMemo(() => {
    const map = new Map<Ymd, BookingDetail[]>();
    const add = (day: Ymd, b: BookingDetail) => map.set(day, [...(map.get(day) ?? []), b]);
    for (const b of bookings) {
      if (!isMultiDay(b)) add(b.service_date, b);
      else {
        const start = b.service_date < from ? from : b.service_date;
        const end = (b.end_date ?? b.service_date) > to ? to : (b.end_date ?? b.service_date);
        for (const day of daysBetween(start, end)) add(day, b);
      }
    }
    // All-day items first, then by time.
    const minute = (b: BookingDetail) => (isMultiDay(b) ? -1 : visitStartMinute(b, cal.windows));
    for (const list of map.values()) list.sort((a, b) => minute(a) - minute(b) || a.title.localeCompare(b.title));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [bookings, cal.windows, from, to]);

  if (!groups.length) {
    return (
      <div className="px-6 py-16 text-center">
        <CalendarDays className="mx-auto size-10 text-sea-300" aria-hidden />
        <p className="mt-3 font-display text-xl font-semibold">Nothing scheduled</p>
        <p className="mt-1 text-ink-600">No bookings in the next 30 days match your filters.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ink-100">
      {groups.map(([day, list]) => {
        const label = day === cal.today ? "Today" : day === addDays(cal.today, 1) ? "Tomorrow" : null;
        return (
          <section key={day} className="px-3 py-4 sm:px-5">
            <h3 className="mb-2 flex items-baseline gap-2 px-1 font-display text-lg font-semibold">
              {label ? <span className="text-ocean">{label}</span> : null}
              <span className={cn(label && "text-base text-ink-600")}>{longDate(day)}</span>
              <span className="text-sm font-bold text-ink-400">· {list.length}</span>
            </h3>
            <ul className="space-y-1.5">
              {list.map((b) => {
                const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
                const color = walkerColor(walker);
                const stayLine = rangedLabel(b, day, cal.timeZone);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => cal.open(b.id)}
                      onMouseEnter={(e) => cal.hoverStart(b, e.currentTarget)}
                      onMouseLeave={cal.hoverEnd}
                      className={cn(
                        "flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-ink-100 bg-white px-3 py-3 text-left transition hover:border-ocean/40 hover:shadow-md sm:flex-nowrap",
                        cal.isDimmed(b) && "opacity-30",
                        (b.status === "canceled" || b.status === "declined") && "opacity-60",
                      )}
                    >
                      <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                      <span className="w-32 shrink-0 text-sm font-bold text-ink">
                        {isMultiDay(b) ? (
                          <span className="mr-1" aria-hidden>
                            {b.kind === "stay" ? "🌙" : "☀️"}
                          </span>
                        ) : null}
                        {stayLine ?? visitTimeLabel(b, cal.windows, cal.timeZone)}
                      </span>
                      <PetStack pets={b.pets} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-extrabold">
                          <StatusGlyph status={b.status} />
                          <HandoffGlyph handoff={b.handoff} />
                          <span className="truncate">{petNames(b.pets) || clientName(b)}</span>
                          <span className="font-semibold text-ink-600">· {b.title}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-600">
                          <span>{clientName(b)}</span>
                          {b.client?.address ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" aria-hidden />
                              {b.client.address}
                            </span>
                          ) : null}
                          {b.client?.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="size-3.5" aria-hidden />
                              {b.client.phone}
                            </span>
                          ) : null}
                          {b.client?.access_notes ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                              <KeyRound className="size-3.5" aria-hidden /> Access notes
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color }}>
                          <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
                          {walker?.display_name ?? "Unassigned"}
                        </span>
                        <Badge tone={STATUS_META[b.status].tone}>{STATUS_META[b.status].label}</Badge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
