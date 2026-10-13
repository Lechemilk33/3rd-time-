"use client";

import {
  CalendarCheck2,
  CalendarPlus,
  Check,
  ClipboardList,
  Hourglass,
  LoaderCircle,
  Lock,
  PawPrint,
  Pencil,
  Repeat,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { addService, bookVisits, getAvailability, getServiceDays, type BookResult } from "@/app/portal/booking-actions";
import { PetAvatar } from "@/components/calendar/event-bits";
import { DynamicFormFields } from "@/components/forms/dynamic-form-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  estimateTotal,
  icsForVisits,
  KIND_META,
  serviceEndMinute,
  servicePrice,
  serviceStartMinute,
  serviceTiming,
  SKIP_REASONS,
  windowRange,
  type Availability,
  type BookingPet,
  type BookingSettings,
  type BookingWindow,
  type DayAvailability,
} from "@/lib/booking";
import { addDays, diffDays, isoWeekday, longDate, minuteLabel, shortDate, startOfWeek, zonedToDate, type Ymd } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { bookingQuestions, fieldsForService, unansweredForService } from "@/lib/intake";
import type { ActionResult, FormAnswers, FormField, Service } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { DateWindowPicker } from "./date-window-picker";
import { DaysPicker, StayPicker, TimeSlotPicker } from "./day-pickers";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FORM_ID = "booking-details";

export type WizardIntake = { fields: FormField[]; answers: FormAnswers; serviceIds: string[] };

/** What the client picked, whatever the kind of service. */
type When = {
  date: Ymd | null;
  windowId: string | null;
  minute: number | null;
  days: Ymd[];
  checkOut: Ymd | null;
};

const EMPTY: When = { date: null, windowId: null, minute: null, days: [], checkOut: null };

export function BookingWizard({
  services,
  pets,
  windows,
  settings,
  today,
  approved,
  intake,
  initialServiceId,
  booked,
}: {
  services: Service[];
  pets: BookingPet[];
  windows: BookingWindow[];
  settings: BookingSettings;
  today: Ymd;
  approved: boolean;
  intake: WizardIntake;
  initialServiceId: string | null;
  /** Upcoming window visits: "date:windowId" -> pet ids, to avoid double-booking a pup. */
  booked: Record<string, string[]>;
}) {
  const bookable = services.filter((s) => s.bookable);
  const canBook = (s: Service) => approved || s.audience === "everyone";
  const [serviceId, setServiceId] = useState<string | null>(() => {
    const s = bookable.find((x) => x.id === initialServiceId);
    return s && canBook(s) ? s.id : null;
  });
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const [petIds, setPetIds] = useState<string[]>(() => (pets.length === 1 ? [pets[0].id] : []));
  const [when, setWhen] = useState<When>(EMPTY);
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [serviceDays, setServiceDays] = useState<{ id: string; rows: DayAvailability[] } | null>(null);
  const [result, setResult] = useState<BookResult | null>(null);
  const [pending, start] = useTransition();
  const [reload, setReload] = useState(0);

  const service = bookable.find((s) => s.id === serviceId) ?? null;
  const kind = service?.kind ?? "window";
  const windowsById = useMemo(() => new Map(windows.map((w) => [w.id, w])), [windows]);
  const lastStart = addDays(today, settings.max_days_ahead);
  const ranged = kind === "day" || kind === "stay";

  useEffect(() => {
    let cancelled = false;
    getAvailability(today, lastStart).then((rows) => {
      if (!cancelled) setAvailability(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [today, lastStart, reload]);

  const rangedId = service && (service.kind === "day" || service.kind === "stay") ? service.id : null;
  const rangeTo = service?.kind === "stay" ? addDays(lastStart, service.max_nights) : lastStart;
  useEffect(() => {
    if (!rangedId) return;
    let cancelled = false;
    getServiceDays(rangedId, today, rangeTo).then((rows) => {
      if (!cancelled) setServiceDays({ id: rangedId, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [rangedId, today, rangeTo, reload]);
  const days = serviceDays && serviceDays.id === rangedId ? serviceDays.rows : null;

  // Intake questions for this service the client still needs to answer (asked once).
  const questions = service ? fieldsForService(intake.fields, service.id) : [];
  const needsQuestions =
    Boolean(service) &&
    !answered.has(service!.id) &&
    questions.some((f) => f.type !== "heading") &&
    (!intake.serviceIds.includes(service!.id) ||
      unansweredForService(intake.fields, intake.answers, service!.id).some((f) => f.required));
  // Questions asked on every booking of this service.
  const perBooking = service ? bookingQuestions(intake.fields, service.id) : [];

  const blocked = useMemo(() => {
    const set = new Set<string>();
    for (const [slot, ids] of Object.entries(booked)) if (ids.some((id) => petIds.includes(id))) set.add(slot);
    return set;
  }, [booked, petIds]);

  const openDays = useMemo(() => {
    const set = new Set<Ymd>();
    for (const a of availability ?? []) if (a.remaining > 0) set.add(a.service_date);
    return set;
  }, [availability]);

  const canRepeat = Boolean(service && service.confirmation === "instant" && (kind === "window" || kind === "time"));
  const repeated = useMemo(() => {
    const date = when.date;
    if (!date) return [];
    if (!repeat || !canRepeat) return [date];
    const picked = weekdays.length ? weekdays : [isoWeekday(date)];
    const monday = startOfWeek(date);
    const out: Ymd[] = [];
    for (let w = 0; w < weeks; w++) {
      for (const d of [...picked].sort()) {
        const day = addDays(monday, w * 7 + d - 1);
        if (day >= date) out.push(day);
      }
    }
    return out;
  }, [when.date, repeat, canRepeat, weekdays, weeks]);

  const slotState = (d: Ymd): "open" | "full" | "closed" | "booked" => {
    if (kind === "time") return openDays.has(d) ? "open" : "closed";
    if (!when.windowId) return "closed";
    if (blocked.has(`${d}:${when.windowId}`)) return "booked";
    const a = availability?.find((r) => r.service_date === d && r.window_id === when.windowId);
    if (!a) return "closed";
    return a.remaining > 0 ? "open" : "full";
  };

  // The dates that will be sent, and whether the "when" step is complete.
  const dates: Ymd[] =
    kind === "day" ? [...when.days].sort() : kind === "stay" ? (when.date ? [when.date] : []) : repeated.filter((d) => slotState(d) === "open");
  const picked =
    kind === "window"
      ? Boolean(when.date && when.windowId)
      : kind === "time"
        ? Boolean(when.date && when.minute != null)
        : kind === "day"
          ? when.days.length > 0
          : Boolean(when.date && when.checkOut);
  const nights = kind === "stay" && when.date && when.checkOut ? diffDays(when.checkOut, when.date) : 0;
  const ready = Boolean(
    service && !needsQuestions && petIds.length && petIds.length <= service.max_pets && picked && dates.length,
  );

  function pickService(id: string | null) {
    setServiceId(id);
    setWhen(EMPTY);
    setRepeat(false);
    setResult(null);
    // Keep the pups that still fit the new service.
    const next = bookable.find((s) => s.id === id);
    if (next) setPetIds((ids) => ids.slice(0, next.max_pets));
  }

  function reset() {
    setResult(null);
    setWhen(EMPTY);
    setRepeat(false);
    setNote("");
    setReload((n) => n + 1);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !ready) return;
    const answers = new FormData(e.currentTarget);
    start(async () => {
      const res = await bookVisits(
        {
          serviceId: service.id,
          petIds,
          dates,
          windowId: kind === "window" ? when.windowId : null,
          arrivalMinute: kind === "time" ? when.minute : null,
          endDate: kind === "stay" ? when.checkOut : null,
          note,
        },
        answers,
      );
      setResult(res);
      if (res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
      else setReload((n) => n + 1);
    });
  }

  if (result?.ok && service) {
    return (
      <BookedCard
        result={result}
        service={service}
        when={when}
        window={when.windowId ? windowsById.get(when.windowId) : undefined}
        pets={pets.filter((p) => petIds.includes(p.id))}
        timeZone={settings.timezone}
        onAnother={reset}
      />
    );
  }

  // Why "Book it" is greyed out, in plain words.
  const hint = !service
    ? "Pick a service to start."
    : needsQuestions
      ? "Answer a few quick questions first."
      : !petIds.length
        ? pets.length
          ? "Pick your pup."
          : "Add your pup first."
        : petIds.length > service.max_pets
          ? `Pick up to ${plural(service.max_pets, "pup")}.`
          : !picked
            ? kind === "stay"
              ? "Pick your check-in and check-out days."
              : kind === "day"
                ? "Pick at least one day."
                : "Pick a day and time."
            : !dates.length
              ? "None of those dates are open — try other days."
              : null;

  let n = 1;
  const total = service ? estimateTotal(service, { nights, days: dates.length, visits: dates.length }) : null;
  const whenTitle = kind === "stay" ? "Pick your dates" : kind === "day" ? "Pick your days" : kind === "time" ? "Pick a day and time" : "Pick a day and time";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
      <div className="space-y-5">
        {/* Service */}
        <Step n={n++} title="What do you need?" done={Boolean(service)} summary={service?.name} onEdit={() => pickService(null)}>
          {!approved ? (
            <Notice tone="info" className="mb-4" title="New here? Start with a meet & greet.">
              We’ll come say hi, meet your pup and learn the routine. Once we’ve met, we’ll approve your account and
              email you — then everything else unlocks.
            </Notice>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {bookable.map((s) => {
              const locked = !canBook(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={locked}
                  onClick={() => pickService(s.id)}
                  className={cn(
                    "group relative rounded-2xl border-2 p-4 text-left transition",
                    locked ? "cursor-not-allowed border-dashed border-ink-100 bg-ink-100/20" : "border-ink-100 bg-white hover:-translate-y-0.5 hover:border-ocean hover:shadow-md",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-display text-lg font-semibold">
                      <span className="mr-1.5" aria-hidden>
                        {KIND_META[s.kind].emoji}
                      </span>
                      {s.name}
                    </span>
                    {locked ? <Lock className="size-4 shrink-0 text-ink-400" aria-label="Locked" /> : null}
                    {!locked && s.confirmation === "request" ? (
                      <span className="shrink-0 rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-extrabold">We confirm</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-sm font-bold text-ocean">{[servicePrice(s), serviceTiming(s)].filter(Boolean).join(" · ")}</span>
                  {s.description ? <span className="mt-2 line-clamp-2 block text-sm text-ink-600">{s.description}</span> : null}
                  {locked ? <span className="mt-2 block text-xs font-bold text-ink-400">Unlocks after your meet &amp; greet</span> : null}
                </button>
              );
            })}
          </div>
        </Step>

        {/* Service questions (asked once) */}
        {service && needsQuestions ? (
          <Step n={n++} title={`A few questions about ${service.name}`} done={false}>
            <ServiceQuestions
              key={service.id}
              service={service}
              fields={questions}
              answers={intake.answers}
              onDone={() => setAnswered((s) => new Set(s).add(service.id))}
            />
          </Step>
        ) : null}

        {/* Pups */}
        {service && !needsQuestions ? (
          <Step n={n++} title={kind === "stay" ? "Who’s staying?" : "Who’s coming along?"} done={false}>
            {pets.length ? (
              <>
                <div className="flex flex-wrap gap-3">
                  {pets.map((p) => {
                    const on = petIds.includes(p.id);
                    const full = !on && petIds.length >= service.max_pets;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        disabled={full}
                        onClick={() => setPetIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                        className={cn(
                          "flex items-center gap-3 rounded-full border-2 py-1.5 pr-5 pl-1.5 text-lg font-bold transition",
                          on ? "border-ocean bg-sea-50" : "border-ink-100 bg-white hover:border-ink-200",
                          full && "opacity-40",
                        )}
                      >
                        <PetAvatar pet={p} size={44} ring={false} />
                        {p.name}
                        {on ? <Check className="size-5 text-ocean" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
                {service.max_pets < pets.length ? (
                  <p className="mt-3 text-sm text-ink-600">
                    Up to {plural(service.max_pets, "pup")} per {ranged ? "booking" : "visit"}.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-sea-200 bg-sea-50 p-5 text-center">
                <PawPrint className="mx-auto size-8 text-sea-300" aria-hidden />
                <p className="mt-2 font-bold">Add your pup first</p>
                <p className="text-sm text-ink-600">So we know who we’re caring for!</p>
                <ButtonLink href={`/portal/pets/new?next=${encodeURIComponent(`/portal/book?service=${service.id}`)}`} size="sm" className="mt-3">
                  Add a pup
                </ButtonLink>
              </div>
            )}
          </Step>
        ) : null}

        {/* When */}
        {service && !needsQuestions && petIds.length ? (
          <Step n={n++} title={whenTitle} done={false}>
            {kind === "window" ? (
              <DateWindowPicker
                availability={availability ?? []}
                loading={availability === null}
                windows={windows}
                today={today}
                date={when.date}
                windowId={when.windowId}
                blocked={blocked}
                onChange={(d, w) => {
                  setWhen({ ...EMPTY, date: d, windowId: w });
                  setWeekdays([isoWeekday(d)]);
                }}
              />
            ) : kind === "time" ? (
              <TimeSlotPicker
                key={reload}
                serviceId={service.id}
                openDays={openDays}
                today={today}
                lastDay={lastStart}
                loading={availability === null}
                date={when.date}
                minute={when.minute}
                onChange={(d, m) => {
                  setWhen({ ...EMPTY, date: d, minute: m });
                  setWeekdays([isoWeekday(d)]);
                }}
              />
            ) : kind === "day" ? (
              <DaysPicker
                service={service}
                days={days ?? []}
                loading={days === null}
                today={today}
                lastStart={lastStart}
                selected={when.days}
                onChange={(list) => setWhen({ ...EMPTY, days: list })}
              />
            ) : (
              <StayPicker
                service={service}
                days={days ?? []}
                loading={days === null}
                today={today}
                lastStart={lastStart}
                checkIn={when.date}
                checkOut={when.checkOut}
                onChange={(ci, co) => setWhen({ ...EMPTY, date: ci, checkOut: co })}
              />
            )}
          </Step>
        ) : null}

        {/* Details (kept mounted while the time is re-picked, so typed answers aren't lost) */}
        {service && !needsQuestions && petIds.length ? (
          <Step n={n++} title={canRepeat ? "Make it a regular thing?" : "Anything else?"} done={false} hidden={!picked}>
            <form id={FORM_ID} onSubmit={submit} className="space-y-5">
              {canRepeat ? (
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink-100 p-4 has-[:checked]:border-ocean has-[:checked]:bg-sea-50">
                    <input type="checkbox" className="size-5 accent-ocean" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                    <Repeat className="size-5 text-ocean" aria-hidden />
                    <span>
                      <span className="block font-extrabold">Repeat every week</span>
                      <span className="block text-sm text-ink-600">Same time, on the days you pick. Cancel any single visit later.</span>
                    </span>
                  </label>
                  {repeat ? (
                    <div className="space-y-4 rounded-2xl bg-sea-50/60 p-4">
                      <div>
                        <p className="mb-2 text-sm font-bold">On these days</p>
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
                                className={cn("h-11 min-w-12 rounded-full px-3 text-sm font-extrabold transition", on ? "bg-ink text-white" : "bg-white text-ink-600 hover:bg-sea-100")}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <Field label="For" htmlFor="wk" className="max-w-48">
                        <Select id="wk" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                          {[2, 4, 6, 8, 12].map((w) => (
                            <option key={w} value={w}>
                              {w} weeks
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <ul className="flex flex-wrap gap-1.5">
                        {repeated.map((d) => {
                          const st = slotState(d);
                          return (
                            <li
                              key={d}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-xs font-bold",
                                st === "open" ? "bg-white text-ink ring-1 ring-ocean/30" : "bg-ink-100/60 text-ink-400 line-through",
                              )}
                              title={st === "open" ? "Open" : st === "booked" ? "Already booked" : st === "full" ? "Full" : "Not available"}
                            >
                              {shortDate(d)}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="text-sm text-ink-600">
                        {dates.length === 0
                          ? "None of these dates are open — try other days or fewer weeks."
                          : kind === "time"
                          ? "If that time is taken on a date, we’ll skip it and let you know."
                          : dates.length < repeated.length
                            ? "Crossed-out dates are full or unavailable and will be skipped."
                            : "All of these are open."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : service.confirmation === "request" ? (
                <p className="text-ink-600">We’ll confirm this with you by email.</p>
              ) : null}

              {perBooking.length ? (
                <div className="space-y-4 rounded-2xl border border-ink-100 p-4 sm:p-5">
                  <p className="flex items-start gap-2 font-bold">
                    <ClipboardList className="mt-0.5 size-5 shrink-0 text-ocean" aria-hidden />
                    {kind === "stay" ? "For this stay" : dates.length > 1 ? "For these visits" : "For this booking"}
                  </p>
                  <DynamicFormFields key={service.id} fields={perBooking} answers={{}} />
                </div>
              ) : null}

              <Field label={kind === "stay" ? "Anything else we should know for this stay?" : "Anything we should know?"} htmlFor="note">
                <Textarea
                  id="note"
                  rows={3}
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={kind === "stay" ? "Bedtime routine, favorite toy, who to call…" : "Gate code changed, extra treats, leash is by the door…"}
                />
              </Field>
            </form>
          </Step>
        ) : null}
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="space-y-4">
          <h2 className="font-display text-xl font-semibold">Your booking</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Service">{service ? service.name : <span className="text-ink-400">—</span>}</Row>
            <Row label="Pups">
              {petIds.length ? pets.filter((p) => petIds.includes(p.id)).map((p) => p.name).join(" & ") : <span className="text-ink-400">—</span>}
            </Row>
            <Row label={kind === "stay" ? "Dates" : dates.length > 1 ? `${dates.length} ${kind === "day" ? "days" : "visits"}` : "When"}>
              {service && picked ? <WhenSummary service={service} when={when} dates={dates} nights={nights} windowsById={windowsById} /> : <span className="text-ink-400">—</span>}
            </Row>
            {service?.price_cents != null && picked && dates.length ? (
              <Row label="Price">
                {servicePrice(service)}
                {total != null && total !== service.price_cents ? (
                  <span className="block font-semibold text-ink-600">
                    About {formatMoney(total)} for{" "}
                    {kind === "stay" ? plural(nights, "night") : plural(dates.length, kind === "day" ? "day" : "visit")}
                  </span>
                ) : null}
              </Row>
            ) : null}
          </dl>
          {result?.error ? <Notice tone="error">{result.error}</Notice> : null}
          <Button type="submit" form={FORM_ID} className="w-full" size="lg" disabled={!ready || pending}>
            {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
            {service?.confirmation === "request"
              ? "Send request"
              : kind === "stay"
                ? "Book the stay"
                : dates.length > 1
                  ? `Book ${dates.length} ${kind === "day" ? "days" : "visits"}`
                  : "Book it"}
          </Button>
          {!ready && hint ? <p className="-mt-1 text-center text-sm font-bold text-ink-600">{hint}</p> : null}
          <p className="text-center text-xs text-ink-400">
            Free to cancel up to {settings.cancel_cutoff_hours} hours before. Nothing to pay today.
          </p>
        </Card>
      </aside>
    </div>
  );
}

function WhenSummary({
  service,
  when,
  dates,
  nights,
  windowsById,
}: {
  service: Service;
  when: When;
  dates: Ymd[];
  nights: number;
  windowsById: Map<string, BookingWindow>;
}) {
  if (service.kind === "stay" && when.date && when.checkOut) {
    return (
      <>
        {shortDate(when.date)} → {shortDate(when.checkOut)}
        <span className="block font-semibold text-ink-600">
          {nights} night{nights === 1 ? "" : "s"} · in {minuteLabel(serviceStartMinute(service))}, out {minuteLabel(serviceEndMinute(service))}
        </span>
      </>
    );
  }
  if (service.kind === "day") {
    return (
      <>
        {dates.length > 3 ? `${dates.slice(0, 3).map(shortDate).join(", ")} +${dates.length - 3}` : dates.map(shortDate).join(", ")}
        <span className="block font-semibold text-ink-600">{serviceTiming(service)}</span>
      </>
    );
  }
  if (!when.date) return null;
  const w = when.windowId ? windowsById.get(when.windowId) : undefined;
  return (
    <>
      {dates.length > 1 ? `Starting ${shortDate(dates[0])}` : longDate(when.date)}
      <span className="block font-semibold text-ink-600">
        {service.kind === "time" && when.minute != null ? minuteLabel(when.minute) : w ? `${w.label} · ${windowRange(w)}` : null}
      </span>
    </>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Step({
  n,
  title,
  done,
  summary,
  onEdit,
  hidden,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  summary?: ReactNode;
  onEdit?: () => void;
  hidden?: boolean;
  children: ReactNode;
}) {
  if (done && summary) {
    return (
      <Card className="flex items-center gap-4 py-4 sm:py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold tracking-wider text-ink-400 uppercase">{title}</p>
          <p className="truncate font-extrabold">{summary}</p>
        </div>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-ocean hover:bg-sea-50">
            <Pencil className="size-3.5" aria-hidden /> Change
          </button>
        ) : null}
      </Card>
    );
  }
  return (
    <Card className="motion-safe:animate-[rise_200ms_ease-out]" hidden={hidden}>
      <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-semibold">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sun text-base">{n}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-extrabold tracking-wider text-ink-400 uppercase">{label}</dt>
      <dd className="font-bold text-ink">{children}</dd>
    </div>
  );
}

function ServiceQuestions({
  service,
  fields,
  answers,
  onDone,
}: {
  service: Service;
  fields: FormField[];
  answers: FormAnswers;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(async (prev: ActionResult | null, formData: FormData) => {
    const res = await addService(service.id, prev, formData);
    if (res.ok) onDone();
    return res;
  });
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="flex items-start gap-2 text-ink-600">
        <ClipboardList className="mt-0.5 size-5 shrink-0 text-ocean" aria-hidden />
        These help us take great care of your pup. We’ll save them to your intake form so you only answer once.
      </p>
      <DynamicFormFields fields={fields} answers={answers} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton pendingText="Saving…" pending={pending}>
        Save &amp; continue
      </SubmitButton>
    </form>
  );
}

function BookedCard({
  result,
  service,
  when,
  window: w,
  pets,
  timeZone,
  onAnother,
}: {
  result: BookResult;
  service: Service;
  when: When;
  window?: BookingWindow;
  pets: BookingPet[];
  timeZone: string;
  onAnother: () => void;
}) {
  const requested = result.status === "requested";
  const created = result.created ?? [];
  const kind = service.kind;
  const nights = kind === "stay" && when.date && when.checkOut ? diffDays(when.checkOut, when.date) : 0;

  const span = (date: Ymd, endDate: Ymd) => {
    if (kind === "day" || kind === "stay") {
      return {
        start: zonedToDate(date, serviceStartMinute(service), timeZone),
        end: zonedToDate(endDate, serviceEndMinute(service), timeZone),
        description: kind === "stay" ? `Check-in from ${minuteLabel(serviceStartMinute(service))}, check-out by ${minuteLabel(serviceEndMinute(service))}.` : `Drop-off ${serviceTiming(service)}.`,
      };
    }
    if (kind === "time" && when.minute != null) {
      const start = zonedToDate(date, when.minute, timeZone);
      return { start, end: new Date(start.getTime() + (service.duration_minutes ?? 30) * 60_000), description: undefined };
    }
    return {
      start: zonedToDate(date, w?.start_minute ?? 540, timeZone),
      end: zonedToDate(date, w?.end_minute ?? 600, timeZone),
      description: w ? `Waiting for Paws will arrive between ${windowRange(w)}.` : undefined,
    };
  };

  function downloadIcs() {
    const ics = icsForVisits(
      created.map((c) => ({
        id: c.id,
        title: `🐾 ${service.name} · ${pets.map((p) => p.name).join(" & ")}`,
        ...span(c.date, c.end_date ?? c.date),
      })),
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "waiting-for-paws.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  const detail =
    kind === "stay" && when.date && when.checkOut
      ? `${shortDate(when.date)} → ${shortDate(when.checkOut)} · ${nights} night${nights === 1 ? "" : "s"}`
      : kind === "day"
        ? serviceTiming(service)
        : kind === "time" && when.minute != null
          ? `at ${minuteLabel(when.minute)}`
          : w
            ? `${w.label}, ${windowRange(w)}`
            : "";
  const noun = kind === "stay" ? "stay" : kind === "day" ? "day" : "visit";

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden p-0 text-center sm:p-0">
      <div className={cn("px-6 pt-10 pb-8", requested ? "bg-sun-100" : "bg-sea-100")}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-white shadow-sm">
          {requested ? <Hourglass className="size-8 text-amber-600" aria-hidden /> : <CalendarCheck2 className="size-8 text-emerald-600" aria-hidden />}
        </span>
        <h2 className="mt-4 font-display text-3xl font-semibold">{requested ? "Request sent!" : "You’re booked! 🐾"}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-600">
          {requested
            ? "We’ll confirm by email shortly. You can see it under My visits in the meantime."
            : `${created.length === 1 ? `Your ${noun} is` : `${created.length} ${noun}s are`} on the calendar. A confirmation is on its way to your inbox.`}
        </p>
      </div>
      <div className="space-y-5 p-6">
        {kind !== "stay" ? (
          <ul className="flex flex-wrap justify-center gap-2">
            {created.slice(0, 16).map((c) => (
              <li key={c.id} className="rounded-full bg-sea-50 px-3 py-1 text-sm font-bold">
                {shortDate(c.date)}
              </li>
            ))}
            {created.length > 16 ? <li className="px-2 py-1 text-sm font-bold text-ink-400">+{created.length - 16} more</li> : null}
          </ul>
        ) : null}
        <p className="font-bold">
          {service.name}
          {detail ? ` · ${detail}` : ""}
        </p>
        {result.skipped?.length ? (
          <Notice tone="warning" className="text-left" title="Some dates were skipped">
            {result.skipped.map((s) => `${shortDate(s.date)} (${SKIP_REASONS[s.reason] ?? s.reason})`).join(" · ")}
          </Notice>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/portal/visits">View my visits</ButtonLink>
          <Button variant="outline" onClick={downloadIcs}>
            <CalendarPlus className="size-4" aria-hidden /> Add to my calendar
          </Button>
          <Button variant="ghost" onClick={onAnother}>
            <Sparkles className="size-4" aria-hidden /> Book another
          </Button>
        </div>
        <p className="text-sm text-ink-600">
          Need to change something? <Link href="/portal/visits" className="font-bold text-ocean hover:underline">Reschedule or cancel</Link> anytime before the cutoff.
        </p>
      </div>
    </Card>
  );
}
