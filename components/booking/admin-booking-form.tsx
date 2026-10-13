"use client";

import { ArrowRight, CalendarCheck2, ClipboardList, Clock, LoaderCircle, Moon, PawPrint, Repeat, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  createBookings,
  getAdminAvailability,
  getAdminServiceDays,
  getAdminTimeSlots,
  type CreateBookingsResult,
} from "@/app/admin/_actions/bookings";
import { ClientPicker, type PickerClient, type PickerPet } from "@/components/booking/client-picker";
import { PetAvatar } from "@/components/calendar/event-bits";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { DynamicFormFields } from "@/components/forms/dynamic-form-fields";
import {
  HANDOFF_META,
  hasLengthChoice,
  KIND_META,
  lengthOptions,
  serviceEndMinute,
  servicePrice,
  serviceStartMinute,
  serviceTiming,
  SKIP_REASONS,
  UNLIMITED,
  windowRange,
  type Availability,
  type BookingWindow,
  type DayAvailability,
  type Walker,
} from "@/lib/booking";
import {
  addDays,
  daysBetween,
  diffDays,
  isoWeekday,
  isYmd,
  minuteLabel,
  minutesToTimeInput,
  shortDate,
  startOfWeek,
  timeToMinutes,
  type Ymd,
} from "@/lib/dates";
import { formatDuration, formatMoney } from "@/lib/format";
import { bookingQuestions } from "@/lib/intake";
import type { FormField, Handoff, Service } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AdminBookingForm({
  clients,
  services,
  windows,
  walkers,
  today,
  initial,
  intakeFields,
}: {
  clients: PickerClient[];
  services: Service[];
  windows: BookingWindow[];
  walkers: Walker[];
  today: Ymd;
  initial: { date: Ymd; minute: number | null; walkerId: string | null; clientId: string | null; serviceId: string | null };
  intakeFields: FormField[];
}) {
  const activeWindows = windows.filter((w) => w.active);
  const [client, setClient] = useState<PickerClient | null>(() => clients.find((c) => c.id === initial.clientId) ?? null);
  const [guest, setGuest] = useState<{ name: string; email: string } | null>(null);
  const [petIds, setPetIds] = useState<string[]>(() => {
    const c = clients.find((x) => x.id === initial.clientId);
    return c && c.pets.length === 1 ? [c.pets[0].id] : [];
  });
  const [serviceId, setServiceId] = useState(
    () =>
      services.find((s) => s.id === initial.serviceId)?.id ??
      services.find((s) => s.audience === "approved" && s.kind === "window")?.id ??
      services[0]?.id ??
      "",
  );
  // Length (when the service offers a choice) and how the pup gets to us (when it asks).
  const [length, setLength] = useState<number | null>(() => startLength(services.find((s) => s.id === serviceId)));
  const [handoff, setHandoff] = useState<Handoff | null>(() => startHandoff(services.find((s) => s.id === serviceId)));
  const [date, setDate] = useState<Ymd>(initial.date);
  const [checkOut, setCheckOut] = useState<Ymd>(() => addDays(initial.date, 1));
  const [timeMode, setTimeMode] = useState<"window" | "exact">(initial.minute != null ? "exact" : "window");
  const [windowId, setWindowId] = useState(
    () =>
      activeWindows.find((w) => initial.minute != null && initial.minute >= w.start_minute && initial.minute < w.end_minute)?.id ??
      activeWindows[0]?.id ??
      "",
  );
  const [exactTime, setExactTime] = useState(initial.minute != null ? minutesToTimeInput(initial.minute) : "12:00");
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>(() => [isoWeekday(initial.date)]);
  const [weeks, setWeeks] = useState(4);
  const [walkerId, setWalkerId] = useState(initial.walkerId ?? "");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [notify, setNotify] = useState(true);
  const [availability, setAvailability] = useState<{ key: string; rows: Availability[] } | null>(null);
  const [serviceDays, setServiceDays] = useState<{ key: string; rows: DayAvailability[] } | null>(null);
  const [slots, setSlots] = useState<{ key: string; minutes: number[] } | null>(null);
  const [result, setResult] = useState<CreateBookingsResult | null>(null);
  const [pending, start] = useTransition();
  const answersRef = useRef<HTMLFormElement>(null);
  // Answers from the last submit, reused if skipped dates are booked anyway.
  const lastAnswers = useRef<FormData | undefined>(undefined);
  const [retryError, setRetryError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const kind = service?.kind ?? "window";
  const ranged = kind === "day" || kind === "stay";
  const minute = kind === "time" || (kind === "window" && timeMode === "exact") ? timeToMinutes(`${exactTime}:00`) : null;
  const nights = kind === "stay" && isYmd(date) && isYmd(checkOut) ? diffDays(checkOut, date) : 0;
  const perBooking = service ? bookingQuestions(intakeFields, service.id) : [];


  // Spots per day for full-day / overnight services.
  const rangeEnd = kind === "stay" && isYmd(checkOut) && checkOut > date ? addDays(checkOut, -1) : date;
  const daysKey = ranged && service && isYmd(date) ? `${service.id}:${date}:${rangeEnd}` : null;
  useEffect(() => {
    if (!daysKey) return;
    const [id, from, to] = daysKey.split(":");
    let cancelled = false;
    getAdminServiceDays(id, from, to).then((rows) => {
      if (!cancelled) setServiceDays({ key: daysKey, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [daysKey]);
  const dayRows = serviceDays && serviceDays.key === daysKey ? serviceDays.rows : null;

  // Which arrival windows still have room that day, for this service, length and number of pups.
  const pupCount = Math.max(1, petIds.length);
  const availKey = kind === "window" && service && isYmd(date) ? `${service.id}:${date}:${length ?? ""}:${pupCount}` : null;
  useEffect(() => {
    if (!availKey) return;
    const [id, d, len, n] = availKey.split(":");
    let cancelled = false;
    getAdminAvailability(d, d, { serviceId: id, minutes: len ? Number(len) : null, pets: Number(n) }).then((rows) => {
      if (!cancelled) setAvailability({ key: availKey, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [availKey]);
  const availRows = availability && availability.key === availKey ? availability.rows : null;

  // Open start times for set-time services.
  const slotsKey = kind === "time" && service && isYmd(date) ? `${service.id}:${date}:${length ?? ""}:${pupCount}` : null;
  useEffect(() => {
    if (!slotsKey) return;
    const [id, d, len, n] = slotsKey.split(":");
    let cancelled = false;
    getAdminTimeSlots(id, d, len ? Number(len) : null, Number(n)).then((rows) => {
      if (!cancelled) setSlots({ key: slotsKey, minutes: rows.map((r) => r.minute) });
    });
    return () => {
      cancelled = true;
    };
  }, [slotsKey]);
  const openSlots = slots && slots.key === slotsKey ? slots.minutes : null;

  // The dates that will be booked (weekly repeats expand here; cheap enough to do every render).
  const dates = ((): Ymd[] => {
    if (!isYmd(date)) return [];
    if (!repeat || kind === "stay") return [date];
    const monday = startOfWeek(date);
    const out: Ymd[] = [];
    for (let w = 0; w < weeks; w++) {
      for (const d of [...weekdays].sort()) {
        const day = addDays(monday, w * 7 + d - 1);
        if (day >= date) out.push(day);
      }
    }
    return out;
  })();

  const who = client ? (client.full_name || client.email || "client") : guest?.name;
  const timeReady =
    kind === "window" ? (timeMode === "window" ? Boolean(windowId) : minute != null) : kind === "time" ? minute != null : kind === "stay" ? nights > 0 : true;
  // A client with pups needs at least one picked (it's also what stops double-booking a pup).
  const needsPup = Boolean(client && client.pets.length && !petIds.length);
  const canSubmit = Boolean(serviceId && dates.length && (client || guest?.name.trim()) && timeReady && !needsPup);
  const noun = kind === "stay" ? "stay" : kind === "day" ? "day" : "visit";

  const payload = (list: Ymd[], overbook: boolean) => ({
    clientId: client?.id ?? null,
    guestName: guest?.name,
    guestEmail: guest?.email,
    serviceId,
    petIds: client ? petIds : [],
    dates: list,
    windowId: kind === "window" && timeMode === "window" ? windowId : null,
    arrivalMinute: minute,
    endDate: kind === "stay" ? checkOut : null,
    minutes: service && hasLengthChoice(service) ? length : null,
    handoff,
    walkerId: walkerId || null,
    note,
    force: overbook,
    notify,
  });

  function submit() {
    start(async () => {
      const answers = answersRef.current ? new FormData(answersRef.current) : undefined;
      lastAnswers.current = answers;
      setRetryError(null);
      const res = await createBookings(payload(dates, force), answers);
      setResult(res);
      if (res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Overbooking can't fix a pup that's already booked then, so those stay skipped.
  const retryable = (result?.skipped ?? []).filter((s) => s.reason !== "already_booked").map((s) => s.date as Ymd);
  function bookSkipped() {
    start(async () => {
      const res = await createBookings(payload(retryable, true), lastAnswers.current);
      if (!res.ok) return setRetryError(res.error ?? "Couldn’t book those dates.");
      setRetryError(null);
      setResult((prev) => ({
        ...res,
        created: [...(prev?.created ?? []), ...(res.created ?? [])],
        skipped: [...(prev?.skipped ?? []).filter((s) => s.reason === "already_booked"), ...(res.skipped ?? [])],
      }));
    });
  }

  if (result?.ok) {
    const first = result.created?.[0];
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CalendarCheck2 className="size-8" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-3xl font-semibold">
          {result.created?.length === 1 ? `${noun === "stay" ? "Stay" : noun === "day" ? "Day" : "Visit"} booked!` : `${result.created?.length} ${noun}s booked!`}
        </h2>
        <p className="mt-2 text-ink-600">
          {service?.name} for {who}
          {notify && client ? " · we emailed the client" : ""}
        </p>
        {result.skipped?.length ? (
          <Notice tone="warning" className="mt-5 text-left" title={`${result.skipped.length} date${result.skipped.length === 1 ? " was" : "s were"} skipped`}>
            <ul className="mt-1 space-y-0.5">
              {result.skipped.map((s) => (
                <li key={s.date}>
                  {shortDate(s.date)} — {SKIP_REASONS[s.reason] ?? s.reason}
                </li>
              ))}
            </ul>
            {retryable.length ? (
              <Button size="sm" variant="outline" className="mt-3" disabled={pending} onClick={bookSkipped}>
                {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Book {retryable.length === 1 ? "it" : `these ${retryable.length}`} anyway (overbook)
              </Button>
            ) : null}
            {retryError ? <p className="mt-2 font-bold text-red-700">{retryError}</p> : null}
          </Notice>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {first ? (
            <Link href={`/admin/calendar?view=week&date=${first.date}&b=${first.id}`} className={buttonClass("primary")}>
              See it on the calendar <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          <Button variant="outline" onClick={() => setResult(null)}>
            Book another
          </Button>
        </div>
      </Card>
    );
  }

  const availFor = (wId: string) => availRows?.find((r) => r.window_id === wId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {/* Who */}
        <Card className="space-y-4">
          <StepTitle n={1} title="Who’s it for?" />
          {guest ? (
            <div className="space-y-3 rounded-2xl border-2 border-ink-100 p-4">
              <div className="flex items-center justify-between">
                <p className="font-extrabold">Guest (no account)</p>
                <button type="button" onClick={() => setGuest(null)} className="text-sm font-bold text-ocean hover:underline">
                  Search clients instead
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="g-name" required>
                  <Input id="g-name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
                </Field>
                <Field label="Email (for confirmations)" htmlFor="g-email">
                  <Input id="g-email" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : (
            <>
              <ClientPicker
                clients={clients}
                selected={client}
                autoFocus={!client}
                onSelect={(c: PickerClient, pet?: PickerPet) => {
                  setClient(c);
                  setPetIds(pet ? [pet.id] : c.pets.length === 1 ? [c.pets[0].id] : []);
                }}
                onClear={() => {
                  setClient(null);
                  setPetIds([]);
                }}
              />
              {!client ? (
                <button type="button" onClick={() => setGuest({ name: "", email: "" })} className="inline-flex items-center gap-1.5 text-sm font-bold text-ocean hover:underline">
                  <UserPlus className="size-4" aria-hidden /> Book for someone without an account
                </button>
              ) : null}
            </>
          )}

          {client ? (
            client.pets.length ? (
              <div>
                <p className="mb-2 text-sm font-bold">Which pups?</p>
                <div className="flex flex-wrap gap-2">
                  {client.pets.map((p) => {
                    const on = petIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPetIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                        className={cn(
                          "flex items-center gap-2 rounded-full border-2 py-1 pr-4 pl-1 font-bold transition",
                          on ? "border-ocean bg-sea-50" : "border-ink-100 bg-white text-ink-600 hover:border-ink-200",
                        )}
                      >
                        <PetAvatar pet={p} size={32} ring={false} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Notice tone="info">
                <PawPrint className="mr-1 inline size-4" aria-hidden />
                {client.full_name || "This client"} hasn’t added any pups yet. You can still book the visit.
              </Notice>
            )
          ) : null}
        </Card>

        {/* What */}
        <Card className="space-y-4">
          <StepTitle n={2} title="What service?" />
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === serviceId}
                onClick={() => {
                  setServiceId(s.id);
                  setLength(startLength(s));
                  setHandoff(startHandoff(s));
                }}
                className={cn(
                  "rounded-2xl border-2 p-3 text-left transition",
                  s.id === serviceId ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                )}
              >
                <span className="block font-extrabold">
                  <span className="mr-1" aria-hidden>
                    {KIND_META[s.kind].emoji}
                  </span>
                  {s.name}
                </span>
                <span className="text-sm text-ink-600">{[serviceTiming(s), servicePrice(s)].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
          {service && hasLengthChoice(service) ? (
            <div>
              <p className="mb-2 text-sm font-bold">How long?</p>
              <div className="flex flex-wrap gap-2">
                {lengthOptions(service).map((o) => (
                  <button
                    key={o.minutes}
                    type="button"
                    aria-pressed={length === o.minutes}
                    onClick={() => setLength(o.minutes)}
                    className={cn(
                      "rounded-full border-2 px-4 py-2 text-sm font-bold transition",
                      length === o.minutes ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                    )}
                  >
                    {formatDuration(o.minutes)}
                    {o.price_cents != null ? <span className="ml-1.5 text-ocean">{o.price_cents ? formatMoney(o.price_cents) : "Free"}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {service?.handoff_options.length ? (
            <div>
              <p className="mb-2 text-sm font-bold">Getting there</p>
              <div className="flex flex-wrap gap-2">
                {service.handoff_options.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={handoff === h}
                    onClick={() => setHandoff(handoff === h && service.handoff_options.length > 1 ? null : h)}
                    className={cn(
                      "rounded-full border-2 px-4 py-2 text-sm font-bold transition",
                      handoff === h ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                    )}
                  >
                    <span aria-hidden>{HANDOFF_META[h].emoji}</span> {HANDOFF_META[h].team}
                    {h === "pickup" && service.pickup_fee_cents ? <span className="ml-1.5 text-ocean">+{formatMoney(service.pickup_fee_cents)}</span> : null}
                  </button>
                ))}
              </div>
              {handoff === "bring" && service.bring_details ? <p className="mt-2 text-sm text-ink-600">{service.bring_details}</p> : null}
            </div>
          ) : null}
        </Card>

        {/* When */}
        <Card className="space-y-5">
          <StepTitle n={3} title="When?" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={kind === "stay" ? "Check-in" : "Date"} htmlFor="b-date">
              <Input
                id="b-date"
                type="date"
                value={date}
                onChange={(e) => {
                  const d = e.target.value;
                  setDate(d);
                  if (isYmd(d) && !repeat) setWeekdays([isoWeekday(d)]);
                  if (isYmd(d) && kind === "stay" && (!isYmd(checkOut) || checkOut <= d)) setCheckOut(addDays(d, Math.max(1, service?.min_nights ?? 1)));
                }}
              />
            </Field>
            {kind === "stay" ? (
              <Field label="Check-out" htmlFor="b-out">
                <Input id="b-out" type="date" min={isYmd(date) ? addDays(date, 1) : undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Walker" htmlFor="b-walker" className={kind === "stay" ? "sm:col-span-2" : undefined}>
              <Select id="b-walker" value={walkerId} onChange={(e) => setWalkerId(e.target.value)}>
                <option value="">Auto-assign (keeps their usual walker)</option>
                {walkers.map((w) => (
                  <option key={w.profile_id} value={w.profile_id}>
                    {w.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {kind === "window" ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">Time</p>
                <div className="ml-auto flex rounded-full bg-sea-50 p-1 text-sm font-bold">
                  {(["window", "exact"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTimeMode(m)}
                      className={cn("rounded-full px-3 py-1", timeMode === m ? "bg-white shadow-sm" : "text-ink-600")}
                    >
                      {m === "window" ? "Arrival window" : "Exact time"}
                    </button>
                  ))}
                </div>
              </div>
              {timeMode === "window" ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {activeWindows.map((w) => {
                    const a = availFor(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        aria-pressed={w.id === windowId}
                        onClick={() => setWindowId(w.id)}
                        className={cn(
                          "rounded-2xl border-2 p-3 text-left transition",
                          w.id === windowId ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                        )}
                      >
                        <span className="block font-extrabold">{w.label}</span>
                        <span className="block text-sm text-ink-600">{windowRange(w)}</span>
                        <span
                          className={cn(
                            "mt-1 block text-xs font-bold",
                            !a ? "text-ink-400" : a.remaining > 0 ? "text-emerald-700" : "text-red-700",
                          )}
                        >
                          {availRows === null ? "Checking…" : !a ? "Outside your hours" : a.remaining > 0 ? "Has room" : "Full"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <ExactTime value={exactTime} onChange={setExactTime} minute={minute} windows={activeWindows} />
              )}
            </div>
          ) : kind === "time" ? (
            <div className="space-y-3">
              <ExactTime value={exactTime} onChange={setExactTime} minute={minute} windows={activeWindows} label="Start time" />
              <div>
                <p className="mb-1.5 text-xs font-extrabold tracking-wider text-ink-400 uppercase">Open times that day</p>
                {openSlots === null ? (
                  <p className="text-sm text-ink-600">Checking…</p>
                ) : openSlots.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {openSlots.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setExactTime(minutesToTimeInput(m))}
                        aria-pressed={m === minute}
                        className={cn(
                          "rounded-full border-2 px-3 py-1 text-sm font-bold transition",
                          m === minute ? "border-ink bg-ink text-white" : "border-ink-100 hover:border-ocean",
                        )}
                      >
                        {minuteLabel(m)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-600">Nothing open — you can still book any time with “Allow overbooking”.</p>
                )}
              </div>
            </div>
          ) : service ? (
            <RangeSummary service={service} date={date} checkOut={checkOut} nights={nights} rows={dayRows} />
          ) : null}

          {kind !== "stay" ? (
            <div className="rounded-2xl border-2 border-ink-100 p-4">
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" className="size-5 accent-ocean" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <Repeat className="size-4 text-ocean" aria-hidden /> Repeat every week
              </label>
              {repeat ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((label, i) => {
                      const d = i + 1;
                      const on = weekdays.includes(d);
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setWeekdays((cur) => (on ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d]))}
                          className={cn(
                            "size-11 rounded-full text-sm font-extrabold transition",
                            on ? "bg-ink text-white" : "bg-sea-50 text-ink-600 hover:bg-sea-100",
                          )}
                        >
                          {label.charAt(0)}
                          <span className="sr-only">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Field label="For how many weeks?" htmlFor="b-weeks" className="max-w-48">
                    <Select id="b-weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                      {[2, 3, 4, 6, 8, 10, 12, 16, 20, 26].map((n) => (
                        <option key={n} value={n}>
                          {n} weeks
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {perBooking.length ? (
          <Card className="space-y-4">
            <h2 className="flex items-center gap-3 font-display text-xl font-semibold">
              <ClipboardList className="size-6 text-ocean" aria-hidden /> {service?.name} questions
            </h2>
            <p className="text-sm text-ink-600">Asked on every booking of this service. Optional when you book for a client.</p>
            <form ref={answersRef} onSubmit={(e) => e.preventDefault()}>
              <DynamicFormFields key={serviceId} fields={perBooking.map((f) => ({ ...f, required: false }))} answers={{}} />
            </form>
          </Card>
        ) : null}

        <Card className="space-y-4">
          <StepTitle n={4} title="Anything else?" />
          <Field label={`${noun === "stay" ? "Stay" : "Visit"} notes (the client can see these)`} htmlFor="b-note">
            <Textarea id="b-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Key is with the neighbor this week" />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="size-5 accent-ocean" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Email the client a confirmation
            </label>
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="size-5 accent-ocean" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Allow overbooking
            </label>
          </div>
        </Card>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="space-y-4">
          <h2 className="font-display text-xl font-semibold">Summary</h2>
          <dl className="space-y-3 text-sm">
            <SummaryRow icon={<Users className="size-4" />} label="Client">
              {who || <span className="text-ink-400">Not picked yet</span>}
              {client && petIds.length ? (
                <span className="block text-ink-600">{client.pets.filter((p) => petIds.includes(p.id)).map((p) => p.name).join(" & ")}</span>
              ) : null}
            </SummaryRow>
            <SummaryRow icon={<PawPrint className="size-4" />} label="Service">
              {service?.name ?? "—"}
              {service && (hasLengthChoice(service) || handoff) ? (
                <span className="block text-ink-600">
                  {[hasLengthChoice(service) && length ? formatDuration(length) : null, handoff ? HANDOFF_META[handoff].team : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </SummaryRow>
            <SummaryRow icon={kind === "stay" ? <Moon className="size-4" /> : <Clock className="size-4" />} label={dates.length > 1 ? `${dates.length} ${noun}s` : "When"}>
              {kind === "stay" ? (
                isYmd(date) && nights > 0 ? (
                  <>
                    {shortDate(date)} → {shortDate(checkOut)}
                    <span className="block text-ink-600">
                      {nights} night{nights === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  "Pick check-in and check-out"
                )
              ) : dates.length ? (
                <span className="flex flex-wrap gap-1">
                  {dates.slice(0, 12).map((d) => (
                    <span key={d} className="rounded-full bg-sea-50 px-2 py-0.5 text-xs font-bold">
                      {shortDate(d)}
                    </span>
                  ))}
                  {dates.length > 12 ? <span className="text-xs font-bold text-ink-400">+{dates.length - 12} more</span> : null}
                </span>
              ) : (
                "Pick a date"
              )}
              {kind !== "stay" ? (
                <span className="mt-1 block text-ink-600">
                  {kind === "day" && service
                    ? serviceTiming(service)
                    : kind === "window" && timeMode === "window"
                      ? (() => {
                          const w = activeWindows.find((x) => x.id === windowId);
                          return w ? `${w.label} · ${windowRange(w)}` : "";
                        })()
                      : minute != null
                        ? minuteLabel(minute)
                        : ""}
                </span>
              ) : null}
            </SummaryRow>
          </dl>
          {date < today ? <Notice tone="warning">That date is in the past.</Notice> : null}
          {result?.error ? <Notice tone="error">{result.error}</Notice> : null}
          {needsPup ? <p className="text-center text-sm font-bold text-ink-600">Pick at least one pup.</p> : null}
          <Button className="w-full" size="lg" disabled={!canSubmit || pending} onClick={submit}>
            {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
            {dates.length > 1 ? `Book ${dates.length} ${noun}s` : `Book ${noun}`}
          </Button>
        </Card>
      </aside>
    </div>
  );
}

function ExactTime({
  value,
  onChange,
  minute,
  windows,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  minute: number | null;
  windows: BookingWindow[];
  label?: string;
}) {
  const w = minute != null ? windows.find((x) => minute >= x.start_minute && minute < x.end_minute) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input type="time" step={300} value={value} onChange={(e) => onChange(e.target.value)} className="w-40" aria-label={label ?? "Exact time"} />
      <p className="flex items-center gap-1.5 text-sm text-ink-600">
        <Clock className="size-4" aria-hidden />
        {w ? `Counts toward the ${w.label.toLowerCase()} window` : "Outside your arrival windows"}
      </p>
    </div>
  );
}

/** Spots left on each day (night) of a full-day booking or stay. */
function RangeSummary({
  service,
  date,
  checkOut,
  nights,
  rows,
}: {
  service: Service;
  date: Ymd;
  checkOut: Ymd;
  nights: number;
  rows: DayAvailability[] | null;
}) {
  if (!isYmd(date)) return null;
  const stay = service.kind === "stay";
  if (stay && nights <= 0) return <Notice tone="warning">Check-out has to be after check-in.</Notice>;
  const days = stay ? daysBetween(date, addDays(checkOut, -1)) : [date];
  const byDay = new Map((rows ?? []).map((r) => [r.service_date, r]));
  return (
    <div className="space-y-2 rounded-2xl bg-sea-50 p-4">
      <p className="font-bold">
        {stay
          ? `${nights} night${nights === 1 ? "" : "s"} · check-in ${minuteLabel(serviceStartMinute(service))}, check-out ${minuteLabel(serviceEndMinute(service))}`
          : `Drop-off ${minuteLabel(serviceStartMinute(service))} · pick-up ${minuteLabel(serviceEndMinute(service))}`}
      </p>
      {stay && (nights < service.min_nights || nights > service.max_nights) ? (
        <p className="text-sm font-bold text-amber-700">
          Clients can book {service.min_nights}–{service.max_nights} nights online. You can still book this.
        </p>
      ) : null}
      {rows === null ? (
        <p className="text-sm text-ink-600">Checking spots…</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {days.slice(0, 31).map((d) => {
            const r = byDay.get(d);
            const unlimited = r && r.capacity >= UNLIMITED;
            return (
              <li
                key={d}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  !r ? "bg-ink-100 text-ink-600" : r.remaining > 0 ? "bg-white text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700",
                )}
              >
                {shortDate(d)} · {!r ? "closed" : unlimited ? "open" : r.remaining > 0 ? `${r.remaining} of ${r.capacity} left` : "full"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-xl font-semibold">
      <span className="grid size-8 place-items-center rounded-full bg-sun text-base">{n}</span>
      {title}
    </h2>
  );
}

function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-ocean">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-extrabold tracking-wider text-ink-400 uppercase">{label}</dt>
        <dd className="font-bold text-ink">{children}</dd>
      </div>
    </div>
  );
}

function startLength(s: Service | undefined) {
  return s && hasLengthChoice(s) ? lengthOptions(s)[0].minutes : null;
}

function startHandoff(s: Service | undefined): Handoff | null {
  return s && s.handoff_options.length === 1 ? s.handoff_options[0] : null;
}
