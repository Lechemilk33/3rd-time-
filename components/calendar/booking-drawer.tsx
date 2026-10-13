"use client";

import {
  CalendarClock,
  Check,
  ClipboardList,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  cancelBooking,
  deleteBooking,
  moveBooking,
  setBookingStatus,
  updateBooking,
} from "@/app/admin/_actions/bookings";
import { useCalendar, walkerColor } from "@/components/calendar/context";
import { PetAvatar } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  clientName,
  dateSpanLabel,
  isMultiDay,
  petNames,
  servicePrice,
  STATUS_META,
  visitTimeLabel,
  windowRange,
  type BookingDetail,
} from "@/lib/booking";
import { addDays, diffDays, isYmd, longDate, minutesToTimeInput, timeToMinutes } from "@/lib/dates";
import { formatDate, formatDuration } from "@/lib/format";
import { answerRows } from "@/lib/intake";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Panel = null | "cancel" | "decline" | "move";
type Run = (action: () => Promise<ActionResult>, after?: () => void, message?: string) => void;

/** Tells the calendar something typed here isn't saved yet, so closing asks first. */
function useUnsaved(ref: RefObject<Set<string>> | undefined, key: string, dirty: boolean) {
  useEffect(() => {
    const set = ref?.current;
    if (!set) return;
    if (dirty) set.add(key);
    else set.delete(key);
    return () => {
      set.delete(key);
    };
  }, [ref, key, dirty]);
}

/** Keeps Tab inside the drawer while it's open (it's a modal dialog). */
function trapTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const items = [
    ...e.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function BookingDrawer({
  booking,
  onClose,
  onToast,
  unsaved,
  initialPanel = null,
}: {
  booking: BookingDetail;
  onClose: () => void;
  onToast: (message: string, tone?: "success" | "error") => void;
  unsaved?: RefObject<Set<string>>;
  initialPanel?: Panel;
}) {
  const cal = useCalendar();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [pending, start] = useTransition();
  const b = booking;
  const walker = b.walker_id ? cal.walkers.get(b.walker_id) : undefined;
  const color = walkerColor(walker);
  const meta = STATUS_META[b.status];
  const active = b.status === "scheduled" || b.status === "requested";
  const window_ = b.window_id ? cal.windows.get(b.window_id) : undefined;
  const noun = b.kind === "stay" ? "stay" : b.kind === "day" ? "day" : "visit";
  const answers = answerRows(cal.fields, b.answers);

  const who = clientName(b);
  const Noun = noun[0].toUpperCase() + noun.slice(1);

  // Hand focus back to whatever opened the drawer. (Declared first so it records the opener
  // before the next effect moves focus to the close button.)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);
  useEffect(() => {
    closeRef.current?.focus();
  }, [b.id]);

  const run: Run = (action, after, message) => {
    start(async () => {
      const res = await action();
      if (res.ok) {
        onToast(message ?? res.message ?? "Saved.");
        after?.();
      } else onToast(res.error ?? "Something went wrong.", "error");
    });
  };

  const mapsUrl = b.client?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.client.address)}`
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/25 backdrop-blur-[1px] motion-safe:animate-[pop_150ms_ease-out]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        className="relative flex h-full w-full max-w-[28rem] flex-col overflow-hidden bg-white shadow-2xl motion-safe:animate-[slide-in-right_180ms_ease-out] sm:rounded-l-3xl"
      >
        <div className="h-1.5 shrink-0" style={{ background: color }} />
        <header className="flex items-start gap-3 border-b border-ink-100 px-5 pt-4 pb-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {b.series_id ? (
                <Badge tone="gray">
                  <Repeat className="size-3" aria-hidden /> Weekly
                </Badge>
              ) : null}
              {pending ? <LoaderCircle className="size-4 animate-spin text-ocean" aria-label="Saving" /> : null}
            </div>
            <h2 id={titleId} className="truncate font-display text-2xl leading-tight font-semibold text-ink">
              {petNames(b.pets) || clientName(b)}
            </h2>
            <p className="font-bold text-ink-600">
              {b.title}
              {b.service && servicePrice(b.service) ? ` · ${servicePrice(b.service)}` : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-600 hover:bg-sea-50 hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Primary actions */}
          <div className="flex flex-wrap gap-2">
            {b.status === "requested" ? (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white shadow-none hover:translate-y-0 hover:bg-emerald-700 hover:shadow-none"
                  disabled={pending}
                  onClick={() => run(() => setBookingStatus(b.id, "scheduled"), undefined, `Confirmed · ${who} emailed`)}
                >
                  <Check className="size-4" aria-hidden /> Confirm
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setPanel(panel === "decline" ? null : "decline")}>
                  Decline…
                </Button>
              </>
            ) : null}
            {b.status === "scheduled" ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setBookingStatus(b.id, "completed"), undefined, "Marked done")}>
                <Check className="size-4" aria-hidden /> Mark done
              </Button>
            ) : null}
            {active ? (
              <>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setPanel(panel === "move" ? null : "move")}>
                  <CalendarClock className="size-4" aria-hidden /> Reschedule
                </Button>
                <Button size="sm" variant="danger" disabled={pending} onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
                  Cancel {noun}…
                </Button>
              </>
            ) : null}
            {b.status === "completed" ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setBookingStatus(b.id, "scheduled", { notify: false }), undefined, "Marked not done")}>
                <RotateCcw className="size-4" aria-hidden /> Mark not done
              </Button>
            ) : null}
            {b.status === "canceled" || b.status === "declined" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => setBookingStatus(b.id, "scheduled", { notify: false }), undefined, `${Noun} restored · ${who} wasn’t emailed`)}
                >
                  <RotateCcw className="size-4" aria-hidden /> Restore {noun}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => setBookingStatus(b.id, "scheduled"), undefined, `${Noun} restored · ${who} emailed`)}
                >
                  <Mail className="size-4" aria-hidden /> Restore &amp; email {who}
                </Button>
              </>
            ) : null}
          </div>

          {panel === "cancel" || panel === "decline" ? (
            <ReasonPanel
              noun={noun}
              kind={panel}
              series={Boolean(b.series_id)}
              pending={pending}
              unsaved={unsaved}
              onCancel={() => setPanel(null)}
              onSubmit={({ reason, notify, scope }) =>
                run(
                  () =>
                    panel === "cancel"
                      ? cancelBooking(b.id, { reason, notify, scope })
                      : setBookingStatus(b.id, "declined", { reason, notify, scope }),
                  () => setPanel(null),
                  scope === "following"
                    ? undefined
                    : `${panel === "cancel" ? `${Noun} canceled` : "Request declined"}${notify ? ` · ${who} emailed` : ""}`,
                )
              }
            />
          ) : null}

          {panel === "move" ? (
            <MovePanel key={b.id} booking={b} pending={pending} onCancel={() => setPanel(null)} onSubmit={(input) => run(() => moveBooking(input), () => setPanel(null))} />
          ) : null}

          {b.status === "canceled" || b.status === "declined" ? (
            b.cancel_reason ? (
              <p className="rounded-2xl bg-ink-100/50 p-3 text-sm">
                <span className="font-bold">Reason:</span> {b.cancel_reason}
              </p>
            ) : null
          ) : null}

          {/* When */}
          <Section title="When" icon={<CalendarClock className="size-4" />}>
            <p className="font-extrabold text-ink">{b.kind === "stay" ? dateSpanLabel(b) : longDate(b.service_date)}</p>
            <p className="text-ink-600">
              {visitTimeLabel(b, cal.windows, cal.timeZone)}
              {isMultiDay(b) ? "" : ` · ${formatDuration(b.duration_minutes)}`}
            </p>
            {active && !isMultiDay(b) ? <ArrivalEditor key={`${b.id}-${b.arrival_time}`} booking={b} pending={pending} run={run} /> : null}
            {window_ && !b.arrival_time ? (
              <p className="mt-1 text-xs font-semibold text-ink-400">
                Client booked the {window_.label.toLowerCase()} window ({windowRange(window_)}).
              </p>
            ) : null}
          </Section>

          {answers.length ? (
            <Section title={`${b.title} answers`} icon={<ClipboardList className="size-4" />}>
              <dl className="space-y-2 rounded-2xl border border-ink-100 p-3 text-sm">
                {answers.map((a) => (
                  <div key={a.id}>
                    <dt className="font-bold text-ink-600">{a.label}</dt>
                    <dd className="whitespace-pre-wrap text-ink">{a.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}

          {/* Walker */}
          <Section title="Walker" icon={<UserRound className="size-4" />}>
            <div className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              <Select
                aria-label="Walker"
                value={b.walker_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateBooking(b.id, { walkerId: e.target.value || null }))}
                className="py-2"
              >
                <option value="">Unassigned</option>
                {[...cal.walkers.values()].map((w) => (
                  <option key={w.profile_id} value={w.profile_id}>
                    {w.display_name}
                    {w.active ? "" : " (not taking visits)"}
                  </option>
                ))}
              </Select>
            </div>
          </Section>

          {/* Client */}
          <Section
            title="Client"
            icon={<UserRound className="size-4" />}
            action={
              b.client ? (
                <Link href={`/admin/clients/${b.client.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-ocean hover:underline">
                  Profile <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              ) : null
            }
          >
            <p className="font-extrabold text-ink">
              {clientName(b)}
              {!b.client ? <span className="ml-2 text-sm font-semibold text-ink-400">Guest</span> : null}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {b.client?.phone ? (
                <li>
                  <a href={`tel:${b.client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 text-ocean hover:underline">
                    <Phone className="size-4" aria-hidden /> {b.client.phone}
                  </a>
                </li>
              ) : null}
              {b.client?.email || b.invitee_email ? (
                <li>
                  <a href={`mailto:${b.client?.email ?? b.invitee_email}`} className="inline-flex items-center gap-2 break-all text-ocean hover:underline">
                    <Mail className="size-4 shrink-0" aria-hidden /> {b.client?.email ?? b.invitee_email}
                  </a>
                </li>
              ) : null}
              {b.client?.address && mapsUrl ? (
                <li>
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 text-ocean hover:underline">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {b.client.address}
                  </a>
                </li>
              ) : null}
            </ul>
            {b.client?.access_notes ? (
              <div className="mt-3 rounded-2xl bg-sun-100 p-3 text-sm">
                <p className="mb-0.5 flex items-center gap-1.5 font-extrabold">
                  <KeyRound className="size-4" aria-hidden /> Home access
                </p>
                <p className="whitespace-pre-wrap">{b.client.access_notes}</p>
              </div>
            ) : null}
            {b.client?.emergency_contact_name || b.client?.emergency_contact_phone ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm">
                <ShieldAlert className="size-4 text-coral" aria-hidden />
                <span className="font-bold">Emergency:</span> {b.client.emergency_contact_name} {b.client.emergency_contact_phone}
              </p>
            ) : null}
            {b.client && !b.client.booking_approved ? (
              <p className="mt-3 rounded-xl bg-sea-50 p-2.5 text-xs font-semibold text-ink-600">
                New client — not approved for regular visits yet. Approve them on their profile after the meet &amp; greet.
              </p>
            ) : null}
          </Section>

          {/* Pups */}
          {b.pets.length ? (
            <Section title={b.pets.length > 1 ? "Pups" : "Pup"}>
              <ul className="space-y-3">
                {b.pets.map((p) => (
                  <li key={p.id} className="rounded-2xl border border-ink-100 p-3">
                    <div className="flex items-center gap-3">
                      <PetAvatar pet={p} size={48} ring={false} />
                      <div>
                        <p className="font-display text-lg leading-tight font-semibold">{p.name}</p>
                        {p.breed ? <p className="text-sm text-ink-600">{p.breed}</p> : null}
                      </div>
                    </div>
                    <dl className="mt-2 space-y-1.5 text-sm">
                      <PetLine label="Personality" value={p.temperament} />
                      <PetLine label="On walks" value={p.walking_notes} />
                      <PetLine label="Medications" value={p.medications} highlight />
                      <PetLine label="Medical / allergies" value={p.medical_notes} highlight />
                      <PetLine label="Feeding" value={p.feeding_notes} />
                    </dl>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* Notes */}
          <Section title="Notes" icon={<MessageSquareText className="size-4" />}>
            {b.client_note ? (
              <p className="mb-3 rounded-2xl bg-sun-100 p-3 text-sm">
                <span className="font-bold">From the client:</span> “{b.client_note}”
              </p>
            ) : null}
            <NotesEditor key={`${b.id}-${b.notes ?? ""}`} booking={b} pending={pending} run={run} unsaved={unsaved} noun={noun} />
          </Section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 text-xs text-ink-400">
            <span>
              {b.source === "portal" ? "Booked online" : "Added by the team"} · {formatDate(b.created_at)}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Delete this ${noun} for good? (Canceling keeps a record — use that unless this was a mistake.)`)) {
                  run(() => deleteBooking(b.id), onClose);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </button>
          </footer>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider text-ink-400 uppercase">
          {icon ? <span className="text-ocean">{icon}</span> : null}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function PetLine({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className={cn(highlight && "rounded-lg bg-coral-100/60 px-2 py-1")}>
      <dt className="inline font-bold text-ink-600">{label}: </dt>
      <dd className="inline whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function ArrivalEditor({
  booking,
  pending,
  run,
}: {
  booking: BookingDetail;
  pending: boolean;
  run: (action: () => Promise<ActionResult>) => void;
}) {
  const current = timeToMinutes(booking.arrival_time);
  const [value, setValue] = useState(current != null ? minutesToTimeInput(current) : "");
  const minute = value ? timeToMinutes(`${value}:00`) : null;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Exact arrival time" htmlFor={`arrive-${booking.id}`} className="w-36">
        <Input id={`arrive-${booking.id}`} type="time" step={300} value={value} onChange={(e) => setValue(e.target.value)} className="py-2" />
      </Field>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || minute == null || minute === current}
        onClick={() => minute != null && run(() => moveBooking({ id: booking.id, date: booking.service_date, arrivalMinute: minute, notify: false }))}
      >
        Pin time
      </Button>
      {current != null && booking.window_id && booking.kind !== "time" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setValue("");
            run(() => moveBooking({ id: booking.id, date: booking.service_date, windowId: booking.window_id, clearArrival: true, notify: false }));
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function NotesEditor({
  booking,
  pending,
  run,
  unsaved,
  noun,
}: {
  booking: BookingDetail;
  pending: boolean;
  run: Run;
  unsaved?: RefObject<Set<string>>;
  noun: string;
}) {
  const [notes, setNotes] = useState(booking.notes ?? "");
  const dirty = notes !== (booking.notes ?? "");
  useUnsaved(unsaved, "notes", dirty);
  return (
    <div className="space-y-2">
      <Textarea
        aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} notes`}
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} notes — the client can see these (e.g. “Max did great, two potty breaks!”)`}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-400">Private notes go on the client’s profile.</p>
        <Button size="sm" variant="secondary" disabled={pending || !dirty} onClick={() => run(() => updateBooking(booking.id, { notes }), undefined, "Notes saved")}>
          Save notes
        </Button>
      </div>
    </div>
  );
}

function ReasonPanel({
  noun,
  kind,
  series,
  pending,
  unsaved,
  onCancel,
  onSubmit,
}: {
  noun: string;
  kind: "cancel" | "decline";
  series: boolean;
  pending: boolean;
  unsaved?: RefObject<Set<string>>;
  onCancel: () => void;
  onSubmit: (v: { reason: string; notify: boolean; scope: "one" | "following" }) => void;
}) {
  const [reason, setReason] = useState("");
  useUnsaved(unsaved, "reason", reason.trim() !== "");
  const [notify, setNotify] = useState(true);
  const [scope, setScope] = useState<"one" | "following">("one");
  return (
    <div className="space-y-3 rounded-2xl border-2 border-red-100 bg-red-50/50 p-4">
      <p className="font-extrabold">{kind === "cancel" ? `Cancel this ${noun}?` : "Decline this request?"}</p>
      {series ? (
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          {(["one", "following"] as const).map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink-100 bg-white px-3 py-1.5 has-[:checked]:border-ocean">
              <input type="radio" name="scope" className="accent-ocean" checked={scope === s} onChange={() => setScope(s)} />
              {s === "one" ? `Just this ${noun}` : "This and all after it"}
            </label>
          ))}
        </div>
      ) : null}
      <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, included in the email)" aria-label="Reason" />
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="size-4 accent-ocean" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email the client
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="danger" disabled={pending} onClick={() => onSubmit({ reason, notify, scope })}>
          {kind === "cancel" ? `Cancel ${noun}` : "Decline request"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function MovePanel({
  booking,
  pending,
  onCancel,
  onSubmit,
}: {
  booking: BookingDetail;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof moveBooking>[0]) => void;
}) {
  const cal = useCalendar();
  const kind = booking.kind ?? "window";
  const windows = [...cal.windows.values()].filter((w) => w.active || w.id === booking.window_id);
  const pinned = timeToMinutes(booking.arrival_time);
  const [date, setDate] = useState(booking.service_date);
  const [checkOut, setCheckOut] = useState(booking.end_date ?? booking.service_date);
  const [windowId, setWindowId] = useState(booking.window_id ?? (windows[0]?.id ?? ""));
  const [time, setTime] = useState(pinned != null ? minutesToTimeInput(pinned) : "");
  const [walkerId, setWalkerId] = useState(booking.walker_id ?? "");
  const [notify, setNotify] = useState(true);
  const minute = time ? timeToMinutes(`${time}:00`) : null;
  const nights = kind === "stay" && isYmd(date) && isYmd(checkOut) ? diffDays(checkOut, date) : 0;
  const valid = isYmd(date) && (kind === "stay" ? nights > 0 : kind === "time" ? minute != null : true);

  return (
    <div className="space-y-3 rounded-2xl border-2 border-sea-200 bg-sea-50/60 p-4">
      <p className="font-extrabold">Reschedule</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === "stay" ? "Check-in" : "Date"} htmlFor="mv-date">
          <Input
            id="mv-date"
            type="date"
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              // Keep the stay's length when the check-in moves.
              if (kind === "stay" && isYmd(d) && isYmd(date)) setCheckOut(addDays(checkOut, diffDays(d, date)));
              setDate(d);
            }}
            className="py-2"
          />
        </Field>
        {kind === "stay" ? (
          <Field label={`Check-out${nights > 0 ? ` (${nights} night${nights === 1 ? "" : "s"})` : ""}`} htmlFor="mv-out">
            <Input id="mv-out" type="date" min={isYmd(date) ? addDays(date, 1) : undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="py-2" />
          </Field>
        ) : null}
        {kind === "window" ? (
          <Field label="Time of day" htmlFor="mv-window">
            <Select id="mv-window" value={windowId} onChange={(e) => setWindowId(e.target.value)} className="py-2">
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label} · {windowRange(w)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {kind === "window" || kind === "time" ? (
          <Field label={kind === "time" ? "Start time" : "Exact time (optional)"} htmlFor="mv-time">
            <Input id="mv-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="py-2" />
          </Field>
        ) : null}
        <Field label="Walker" htmlFor="mv-walker">
          <Select id="mv-walker" value={walkerId} onChange={(e) => setWalkerId(e.target.value)} className="py-2">
            <option value="">Keep current</option>
            {[...cal.walkers.values()].map((w) => (
              <option key={w.profile_id} value={w.profile_id}>
                {w.display_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="size-4 accent-ocean" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email the client the new {kind === "stay" ? "dates" : "time"}
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !valid}
          onClick={() =>
            onSubmit(
              isMultiDay(booking)
                ? { id: booking.id, date, endDate: kind === "stay" ? checkOut : null, walkerId: walkerId || null, notify }
                : {
                    id: booking.id,
                    date,
                    windowId: minute != null ? null : windowId,
                    arrivalMinute: minute,
                    walkerId: walkerId || null,
                    notify,
                    clearArrival: minute == null,
                  },
            )
          }
        >
          Move {kind === "stay" ? "stay" : kind === "day" ? "day" : "visit"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Never mind
        </Button>
      </div>
    </div>
  );
}
