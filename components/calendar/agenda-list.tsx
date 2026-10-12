"use client";

import { CalendarDays, KeyRound, MapPin, Phone } from "lucide-react";
import { useMemo } from "react";
import { useCalendar, walkerColor } from "@/components/calendar/context";
import { PetStack, StatusGlyph } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import { clientName, petNames, STATUS_META, visitStartMinute, visitTimeLabel, type BookingDetail } from "@/lib/booking";
import { addDays, longDate, type Ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function AgendaList({ bookings }: { bookings: BookingDetail[] }) {
  const cal = useCalendar();
  const groups = useMemo(() => {
    const map = new Map<Ymd, BookingDetail[]>();
    const sorted = [...bookings].sort(
      (a, b) =>
        a.service_date.localeCompare(b.service_date) ||
        visitStartMinute(a, cal.windows) - visitStartMinute(b, cal.windows),
    );
    for (const b of sorted) map.set(b.service_date, [...(map.get(b.service_date) ?? []), b]);
    return [...map.entries()];
  }, [bookings, cal.windows]);

  if (!groups.length) {
    return (
      <div className="px-6 py-16 text-center">
        <CalendarDays className="mx-auto size-10 text-sea-300" aria-hidden />
        <p className="mt-3 font-display text-xl font-semibold">Nothing scheduled</p>
        <p className="mt-1 text-ink-600">No visits in the next 30 days match your filters.</p>
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
                        {visitTimeLabel(b, cal.windows, cal.timeZone)}
                      </span>
                      <PetStack pets={b.pets} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-extrabold">
                          <StatusGlyph status={b.status} />
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
