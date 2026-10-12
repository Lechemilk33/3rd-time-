import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { PetStack } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import {
  clientName,
  petNames,
  STATUS_META,
  dateSpanLabel,
  visitTimeLabel,
  type BookingDetail,
  type BookingWindow,
  type Walker,
} from "@/lib/booking";
import { shortDate } from "@/lib/dates";

/** Compact list of visits (portal home, admin overview, client profile). */
export function BookingList({
  bookings,
  windows,
  walkers = [],
  timeZone,
  empty,
  showClient = false,
  hrefFor,
}: {
  bookings: BookingDetail[];
  windows: BookingWindow[];
  walkers?: Walker[];
  timeZone: string;
  empty: string;
  showClient?: boolean;
  hrefFor?: (b: BookingDetail) => string;
}) {
  if (!bookings.length) return <p className="text-ink-600">{empty}</p>;
  const windowMap = new Map(windows.map((w) => [w.id, w]));
  const walkerMap = new Map(walkers.map((w) => [w.profile_id, w]));

  return (
    <ul className="divide-y divide-ink-100">
      {bookings.map((b) => {
        const walker = b.walker_id ? walkerMap.get(b.walker_id) : undefined;
        const meta = STATUS_META[b.status];
        const inner = (
          <>
            {b.pets.length ? (
              <PetStack pets={b.pets} size={40} max={2} />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sea-100 text-ocean">
                <CalendarDays className="size-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">
                {showClient ? `${petNames(b.pets) || clientName(b)} · ` : ""}
                {b.title}
              </p>
              <p className="truncate text-sm text-ink-600">
                {b.kind === "stay" ? dateSpanLabel(b) : shortDate(b.service_date)} · {visitTimeLabel(b, windowMap, timeZone)}
                {showClient && b.pets.length ? ` · ${clientName(b)}` : ""}
              </p>
            </div>
            {walker ? (
              <span className="hidden items-center gap-1.5 text-sm font-bold sm:inline-flex" style={{ color: walker.color }}>
                <span className="size-2 rounded-full" style={{ background: walker.color }} aria-hidden />
                {walker.display_name}
              </span>
            ) : null}
            {b.status !== "scheduled" ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
          </>
        );
        return (
          <li key={b.id}>
            {hrefFor ? (
              <Link href={hrefFor(b)} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-sea-50">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
