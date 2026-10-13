"use client";

import { CalendarClock, CalendarPlus, CircleCheck, MessageSquareText, Repeat, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { cancelVisit, getAvailability, getServiceDays, rescheduleVisit } from "@/app/portal/booking-actions";
import { DateWindowPicker } from "@/components/booking/date-window-picker";
import { DaysPicker, StayPicker, TimeSlotPicker } from "@/components/booking/day-pickers";
import { PetStack } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/form";
import {
  dateSpanLabel,
  HANDOFF_META,
  hasLengthChoice,
  icsForVisits,
  isMultiDay,
  petNames,
  STATUS_META,
  visitTimeLabel,
  type Availability,
  type BookingDetail,
  type BookingWindow,
  type DayAvailability,
} from "@/lib/booking";
import { addDays, diffDays, formatYmd, longDate, timeToMinutes, zonedToDate, type Ymd } from "@/lib/dates";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

type WalkerInfo = { display_name: string; color: string };

export function VisitList({
  visits,
  windows,
  walkers,
  timeZone,
  cutoffHours,
  maxDaysAhead,
  today,
  now,
  past,
  empty,
}: {
  visits: BookingDetail[];
  windows: BookingWindow[];
  walkers: Record<string, WalkerInfo>;
  timeZone: string;
  cutoffHours: number;
  maxDaysAhead: number;
  today: Ymd;
  /** Server time (ms) so cutoffs render the same on server and client. */
  now: number;
  past?: boolean;
  /** Shown when the list is empty — kept in here so the toast survives canceling the last one. */
  empty?: ReactNode;
}) {
  const windowMap = new Map(windows.map((w) => [w.id, w]));
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {toast ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 font-bold text-white shadow-xl motion-safe:animate-[rise_200ms_ease-out]"
        >
          <CircleCheck className="size-5 shrink-0 text-emerald-300" aria-hidden />
          <span className="flex-1">{toast}</span>
          <button type="button" onClick={() => setToast(null)} className="grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label="Dismiss">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {visits.length ? (
        <ul className="space-y-3">
          {visits.map((v) => (
          <VisitCard
            key={v.id}
            visit={v}
            windowMap={windowMap}
            walker={v.walker_id ? walkers[v.walker_id] : undefined}
            timeZone={timeZone}
            cutoffHours={cutoffHours}
            maxDaysAhead={maxDaysAhead}
            today={today}
            now={now}
            past={past}
            onDone={setToast}
          />
          ))}
        </ul>
      ) : (
        empty
      )}
    </>
  );
}

function VisitCard({
  visit: v,
  windowMap,
  walker,
  timeZone,
  cutoffHours,
  maxDaysAhead,
  today,
  now,
  past,
  onDone,
}: {
  visit: BookingDetail;
  windowMap: Map<string, BookingWindow>;
  walker?: WalkerInfo;
  timeZone: string;
  cutoffHours: number;
  maxDaysAhead: number;
  today: Ymd;
  now: number;
  past?: boolean;
  onDone: (message: string) => void;
}) {
  const [panel, setPanel] = useState<null | "cancel" | "move">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"one" | "following">("one");
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  const [date, setDate] = useState<Ymd | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [checkOut, setCheckOut] = useState<Ymd | null>(null);
  const service = v.service;
  const kind = v.kind ?? "window";
  const nights = kind === "stay" ? diffDays(v.end_date, v.service_date) : 0;
  const noun = kind === "stay" ? "stay" : kind === "day" ? "day" : "visit";
  const Noun = noun[0].toUpperCase() + noun.slice(1);

  function toggle(next: "cancel" | "move") {
    setError(null);
    if (panel === next) setPanel(null);
    else if (next === "move") openMove();
    else setPanel(next);
  }

  const active = v.status === "scheduled" || v.status === "requested";
  const locked = new Date(v.start_time).getTime() - now < cutoffHours * 3_600_000;
  const meta = STATUS_META[v.status];
  const color = walker?.color ?? "#94A3B8";

  function openMove() {
    setPanel("move");
    if (isMultiDay(v)) {
      if (!days && service) {
        const to = addDays(today, maxDaysAhead + (kind === "stay" ? service.max_nights : 0));
        // Its own nights count as free while moving it.
        getServiceDays(service.id, today, to).then((rows) =>
          setDays(
            rows.map((r) =>
              r.service_date >= v.service_date && r.service_date < (kind === "stay" ? v.end_date : addDays(v.end_date, 1))
                ? { ...r, remaining: r.remaining + 1 }
                : r,
            ),
          ),
        );
      }
    } else if (!availability) {
      getAvailability(today, addDays(today, maxDaysAhead)).then(setAvailability);
    }
  }

  const ready = kind === "window" ? Boolean(date && windowId) : kind === "time" ? Boolean(date && minute != null) : kind === "stay" ? Boolean(date && checkOut) : Boolean(date);

  function addToCalendar() {
    const w = v.window_id ? windowMap.get(v.window_id) : undefined;
    const pinned = timeToMinutes(v.arrival_time);
    const start = pinned != null ? zonedToDate(v.service_date, pinned, timeZone) : new Date(v.start_time);
    const end =
      pinned != null
        ? new Date(start.getTime() + v.duration_minutes * 60_000)
        : v.end_time
          ? new Date(v.end_time)
          : new Date(start.getTime() + v.duration_minutes * 60_000);
    const ics = icsForVisits([
      {
        id: v.id,
        title: `🐾 ${v.title}${v.pets.length ? ` · ${petNames(v.pets)}` : ""}`,
        start,
        end,
        description: w && pinned == null ? `Arrival window: ${w.label}` : "Waiting for Paws",
      },
    ]);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `visit-${v.service_date}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <li className={cn("overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm", !active && !past && "opacity-70")}>
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="hidden w-16 shrink-0 flex-col items-center rounded-2xl bg-sea-50 py-2 text-center sm:flex">
          <span className="text-xs font-extrabold text-ocean uppercase">{formatYmd(v.service_date, { month: "short" })}</span>
          <span className="font-display text-2xl leading-none font-semibold">{Number(v.service_date.slice(8))}</span>
          <span className="text-xs font-bold text-ink-600">
            {kind === "stay" ? `${nights} night${nights === 1 ? "" : "s"}` : formatYmd(v.service_date, { weekday: "short" })}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-lg font-semibold">{v.title}</p>
            <Badge tone={meta.tone}>{v.status === "requested" ? "Waiting for confirmation" : meta.label}</Badge>
            {v.series_id ? (
              <Badge tone="gray">
                <Repeat className="size-3" aria-hidden /> Weekly
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 font-bold text-ink">
            {kind === "stay" ? (
              <span className="block">{dateSpanLabel(v)}</span>
            ) : (
              <span className="sm:hidden">{longDate(v.service_date)} · </span>
            )}
            {visitTimeLabel(v, windowMap, timeZone)}
            {service && hasLengthChoice(service) && !isMultiDay(v) ? ` · ${formatDuration(v.duration_minutes)}` : ""}
          </p>
          {v.handoff ? (
            <p className="mt-0.5 text-sm font-bold text-ink-600">
              <span aria-hidden>{HANDOFF_META[v.handoff].emoji}</span>{" "}
              {v.handoff === "pickup" ? "We’ll pick your pup up from home" : `You’re dropping off${service?.bring_details ? ` · ${service.bring_details}` : ""}`}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-600">
            {v.pets.length ? (
              <span className="inline-flex items-center gap-2">
                <PetStack pets={v.pets} size={26} /> {petNames(v.pets)}
              </span>
            ) : null}
            {walker ? (
              <span className="inline-flex items-center gap-1.5 font-bold" style={{ color }}>
                <span className="size-2 rounded-full" style={{ background: color }} aria-hidden /> with {walker.display_name}
              </span>
            ) : null}
          </div>
          {v.notes ? (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-sea-50 p-3 text-sm">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-ocean" aria-hidden />
              <span>
                <span className="font-bold">A note from us:</span> {v.notes}
              </span>
            </p>
          ) : null}
          {v.cancel_reason && !active ? <p className="mt-2 text-sm text-ink-600">Reason: {v.cancel_reason}</p> : null}
        </div>
      </div>

      {active && !past ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-sand/40 px-4 py-3 sm:px-5">
          {locked ? (
            <p className="text-sm font-semibold text-ink-600">
              Less than {cutoffHours} hours away —{" "}
              <Link href="/contact" className="font-bold text-ocean hover:underline">
                message us
              </Link>{" "}
              to make changes.
            </p>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => toggle("move")}>
                <CalendarClock className="size-4" aria-hidden /> Reschedule
              </Button>
              <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => toggle("cancel")}>
                <X className="size-4" aria-hidden /> Cancel
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={addToCalendar}>
            <CalendarPlus className="size-4" aria-hidden /> Add to calendar
          </Button>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="space-y-3 border-t border-red-100 bg-red-50/40 p-4 sm:p-5">
          <p className="font-extrabold">Cancel this {noun}?</p>
          {v.series_id ? (
            <div className="flex flex-wrap gap-2 text-sm font-bold">
              {(["one", "following"] as const).map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink-100 bg-white px-3 py-1.5 has-[:checked]:border-ocean">
                  <input type="radio" className="accent-ocean" checked={scope === s} onChange={() => setScope(s)} />
                  {s === "one" ? `Just this ${noun}` : `This and all later ${noun}s`}
                </label>
              ))}
            </div>
          ) : null}
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Want to tell us why? (optional)" aria-label="Reason" />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancelVisit(v.id, scope, reason);
                  if (!r.ok) return setError(r.error ?? "Couldn’t cancel — please try again.");
                  setPanel(null);
                  onDone(scope === "following" ? (r.message ?? "Canceled.") : `${Noun} canceled. We’ve let the team know.`);
                })
              }
            >
              {pending ? "Canceling…" : "Yes, cancel"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "move" ? (
        <div className="space-y-4 border-t border-sea-200 bg-sea-50/40 p-4 sm:p-5">
          <p className="font-extrabold">
            {kind === "stay" ? `Pick new dates (currently ${nights} night${nights === 1 ? "" : "s"})` : kind === "day" ? "Pick a new day" : "Pick a new day and time"}
          </p>
          {kind === "window" ? (
            <DateWindowPicker
              availability={availability ?? []}
              loading={availability === null}
              windows={[...windowMap.values()].filter((w) => w.active)}
              today={today}
              date={date}
              windowId={windowId}
              onChange={(d, w) => {
                setDate(d);
                setWindowId(w);
              }}
            />
          ) : kind === "time" && service ? (
            <TimeSlotPicker
              serviceId={service.id}
              length={v.duration_minutes}
              openDays={new Set((availability ?? []).filter((a) => a.remaining > 0).map((a) => a.service_date))}
              today={today}
              lastDay={addDays(today, maxDaysAhead)}
              loading={availability === null}
              date={date}
              minute={minute}
              onChange={(d, m) => {
                setDate(d);
                setMinute(m);
              }}
            />
          ) : kind === "day" && service ? (
            <DaysPicker
              service={service}
              days={days ?? []}
              loading={days === null}
              today={today}
              lastStart={addDays(today, maxDaysAhead)}
              selected={date ? [date] : []}
              max={2}
              onChange={(list) => setDate(list.length ? list[list.length - 1] : null)}
            />
          ) : kind === "stay" && service ? (
            <StayPicker
              service={service}
              days={days ?? []}
              loading={days === null}
              today={today}
              lastStart={addDays(today, maxDaysAhead)}
              checkIn={date}
              checkOut={checkOut}
              onChange={(ci, co) => {
                setDate(ci);
                setCheckOut(co);
              }}
            />
          ) : (
            <p className="text-ink-600">
              <Link href="/contact" className="font-bold text-ocean hover:underline">
                Message us
              </Link>{" "}
              and we’ll move this one for you.
            </p>
          )}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !ready}
              onClick={() =>
                start(async () => {
                  const r = await rescheduleVisit(v.id, { date: date!, windowId, arrivalMinute: minute, endDate: checkOut });
                  if (!r.ok) return setError(r.error ?? "Couldn’t move it — please try again.");
                  setPanel(null);
                  const what = kind === "stay" ? "dates" : kind === "day" ? "day" : "time";
                  onDone(service?.confirmation === "request" ? `Sent! We’ll confirm the new ${what} by email.` : `Done! You’ll get an email with the new ${what}.`);
                })
              }
            >
              {pending ? "Moving…" : `Move my ${noun}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Never mind
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
