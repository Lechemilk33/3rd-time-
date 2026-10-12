import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { safeHref } from "@/lib/utils";

const STATUS_TONE = { scheduled: "sea", completed: "green", canceled: "gray" } as const;

export function BookingList({ bookings, empty }: { bookings: Booking[]; empty: string }) {
  if (!bookings.length) return <p className="text-ink-600">{empty}</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {bookings.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sea-100 text-ocean">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">{b.title}</p>
            <p className="text-sm text-ink-600">{formatDateTime(b.start_time)}</p>
          </div>
          <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
          {b.status === "scheduled" && b.reschedule_url ? (
            <a href={safeHref(b.reschedule_url)} target="_blank" rel="noreferrer" className="text-sm font-bold text-ocean hover:underline">
              Reschedule
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
