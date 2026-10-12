"use client";

import { CalendarClock, Check, KeyRound, MapPin, MessageSquareText, Phone, X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCalendar, walkerColor } from "@/components/calendar/context";
import { PetAvatar } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import { clientName, STATUS_META, visitTimeLabel, type BookingDetail } from "@/lib/booking";
import { longDate } from "@/lib/dates";
import { formatDuration } from "@/lib/format";

const WIDTH = 320;
const GAP = 10;

export function HoverCard({
  booking,
  anchor,
  onEnter,
  onLeave,
  onConfirm,
  onDecline,
}: {
  booking: BookingDetail;
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
  onConfirm: (b: BookingDetail) => void;
  onDecline: (b: BookingDetail) => void;
}) {
  const cal = useCalendar();
  const ref = useRef<HTMLDivElement>(null);

  // Place it beside the visit: right if there's room, else left; keep it on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top = anchor.top;
    if (vw - anchor.right - GAP - 8 >= WIDTH) left = anchor.right + GAP;
    else if (anchor.left - GAP - 8 >= WIDTH) left = anchor.left - WIDTH - GAP;
    else {
      // No room beside it: show below (or above) the visit instead.
      left = Math.min(Math.max(8, anchor.left), vw - WIDTH - 8);
      top = anchor.bottom + GAP + h > vh - 8 ? anchor.top - h - GAP : anchor.bottom + GAP;
    }
    top = Math.min(Math.max(8, top), vh - h - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [anchor, booking.id]);

  const b = booking;
  const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
  const color = walkerColor(walker);
  const window_ = b.window_id ? cal.windows.get(b.window_id) : undefined;
  const meta = STATUS_META[b.status];

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-[70] overflow-hidden rounded-2xl border border-ink-100 bg-white text-left shadow-[0_20px_50px_-12px_rgba(15,43,63,0.35)] motion-safe:animate-[pop_120ms_ease-out]"
      style={{ width: WIDTH, left: 0, top: 0, visibility: "hidden" }}
    >
      <div className="h-1.5" style={{ background: color }} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight font-semibold text-ink">{b.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold" style={{ color }}>
              <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
              {walker?.display_name ?? "Unassigned"}
            </p>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>

        <div className="flex items-start gap-2 text-sm">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-ocean" aria-hidden />
          <div>
            <p className="font-bold text-ink">{longDate(b.service_date)}</p>
            <p className="text-ink-600">
              {visitTimeLabel(b, cal.windows, cal.timeZone)} · {formatDuration(b.duration_minutes)}
            </p>
            {window_ && !b.arrival_time && (b.status === "scheduled" || b.status === "requested") ? (
              <p className="mt-0.5 text-xs font-semibold text-ink-400">No exact time yet — drag it to pin one.</p>
            ) : null}
          </div>
        </div>

        {b.pets.length ? (
          <ul className="space-y-1.5">
            {b.pets.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5">
                <PetAvatar pet={p} size={36} ring={false} />
                <span className="min-w-0">
                  <span className="block font-extrabold text-ink">{p.name}</span>
                  <span className="block truncate text-xs text-ink-600">
                    {[p.breed, p.medications ? "💊 meds" : null].filter(Boolean).join(" · ") || "Pup"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-1 rounded-xl bg-sea-50 p-3 text-sm">
          <p className="font-extrabold text-ink">{clientName(b)}</p>
          {b.client?.phone ? (
            <p className="flex items-center gap-1.5 text-ink-600">
              <Phone className="size-3.5" aria-hidden /> {b.client.phone}
            </p>
          ) : null}
          {b.client?.address ? (
            <p className="flex items-start gap-1.5 text-ink-600">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{b.client.address}</span>
            </p>
          ) : null}
          {b.client?.access_notes ? (
            <p className="flex items-center gap-1.5 font-bold text-amber-700">
              <KeyRound className="size-3.5" aria-hidden /> Has home access notes
            </p>
          ) : null}
        </div>

        {b.client_note ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-sun-100 p-3 text-sm text-ink">
            <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-3">“{b.client_note}”</span>
          </p>
        ) : null}

        {b.status === "requested" ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onConfirm(b)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Check className="size-4" aria-hidden /> Confirm
            </button>
            <button
              type="button"
              onClick={() => onDecline(b)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-ink-100 px-3 py-2 text-sm font-bold text-ink hover:border-red-200 hover:text-red-700"
            >
              <X className="size-4" aria-hidden /> Decline
            </button>
          </div>
        ) : null}

        <p className="border-t border-ink-100 pt-2 text-xs font-semibold text-ink-400">
          Click for details{b.status === "scheduled" || b.status === "requested" ? " · drag to move" : ""}
        </p>
      </div>
    </div>,
    document.body,
  );
}
