"use client";

import { CalendarClock, CalendarPlus, MessageSquareText, Repeat, X } from "lucide-react";
import { useState, useTransition } from "react";
import { cancelVisit, getAvailability, rescheduleVisit } from "@/app/portal/booking-actions";
import { DateWindowPicker } from "@/components/booking/date-window-picker";
import { PetStack } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/form";
import {
  icsForVisits,
  petNames,
  STATUS_META,
  visitTimeLabel,
  type Availability,
  type BookingDetail,
  type BookingWindow,
} from "@/lib/booking";
import { addDays, longDate, timeToMinutes, zonedToDate, type Ymd } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
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
}) {
  const windowMap = new Map(windows.map((w) => [w.id, w]));
  const [message, setMessage] = useState<ActionResult | null>(null);
  if (!visits.length) return null;

  return (
    <div className="space-y-3">
      {message ? (
        <Notice tone={message.ok ? "success" : "error"}>{message.ok ? message.message : message.error}</Notice>
      ) : null}
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
            onResult={setMessage}
          />
        ))}
      </ul>
    </div>
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
  onResult,
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
  onResult: (r: ActionResult) => void;
}) {
  const [panel, setPanel] = useState<null | "cancel" | "move">(null);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"one" | "following">("one");
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [date, setDate] = useState<Ymd | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);

  const active = v.status === "scheduled" || v.status === "requested";
  const locked = new Date(v.start_time).getTime() - now < cutoffHours * 3_600_000;
  const meta = STATUS_META[v.status];
  const color = walker?.color ?? "#94A3B8";

  function openMove() {
    setPanel("move");
    if (!availability) {
      getAvailability(today, addDays(today, maxDaysAhead)).then(setAvailability);
    }
  }

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
          <span className="text-xs font-extrabold text-ocean uppercase">
            {new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${v.service_date}T12:00:00Z`))}
          </span>
          <span className="font-display text-2xl leading-none font-semibold">{Number(v.service_date.slice(8))}</span>
          <span className="text-xs font-bold text-ink-600">
            {new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${v.service_date}T12:00:00Z`))}
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
            <span className="sm:hidden">{longDate(v.service_date)} · </span>
            {visitTimeLabel(v, windowMap, timeZone)}
          </p>
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
                <span className="font-bold">From your walker:</span> {v.notes}
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
              Less than {cutoffHours} hours away — message us to make changes.
            </p>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => (panel === "move" ? setPanel(null) : openMove())}>
                <CalendarClock className="size-4" aria-hidden /> Reschedule
              </Button>
              <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
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
          <p className="font-extrabold">Cancel this visit?</p>
          {v.series_id ? (
            <div className="flex flex-wrap gap-2 text-sm font-bold">
              {(["one", "following"] as const).map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink-100 bg-white px-3 py-1.5 has-[:checked]:border-ocean">
                  <input type="radio" className="accent-ocean" checked={scope === s} onChange={() => setScope(s)} />
                  {s === "one" ? "Just this visit" : "This and all later visits"}
                </label>
              ))}
            </div>
          ) : null}
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Want to tell us why? (optional)" aria-label="Reason" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancelVisit(v.id, scope, reason);
                  onResult(r);
                  if (r.ok) setPanel(null);
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
          <p className="font-extrabold">Pick a new day and time</p>
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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !date || !windowId}
              onClick={() =>
                start(async () => {
                  const r = await rescheduleVisit(v.id, date!, windowId!);
                  onResult(r);
                  if (r.ok) setPanel(null);
                })
              }
            >
              {pending ? "Moving…" : "Move my visit"}
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
