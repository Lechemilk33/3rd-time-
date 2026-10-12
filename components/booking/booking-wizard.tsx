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
import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { addService, bookVisits, getAvailability, type BookResult } from "@/app/portal/booking-actions";
import { PetAvatar } from "@/components/calendar/event-bits";
import { DynamicFormFields } from "@/components/forms/dynamic-form-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  icsForVisits,
  SKIP_REASONS,
  windowRange,
  type Availability,
  type BookingPet,
  type BookingSettings,
  type BookingWindow,
} from "@/lib/booking";
import { addDays, isoWeekday, longDate, shortDate, startOfWeek, zonedToDate, type Ymd } from "@/lib/dates";
import { formatDuration, formatPrice } from "@/lib/format";
import { fieldsForService, unansweredForService } from "@/lib/intake";
import type { ActionResult, FormAnswers, FormField, Service } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DateWindowPicker } from "./date-window-picker";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type WizardIntake = { fields: FormField[]; answers: FormAnswers; serviceIds: string[] };

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
  /** Upcoming visits: "date:windowId" -> pet ids, to avoid double-booking a pup. */
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
  const [date, setDate] = useState<Ymd | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [result, setResult] = useState<BookResult | null>(null);
  const [pending, start] = useTransition();
  const [reload, setReload] = useState(0);

  const service = bookable.find((s) => s.id === serviceId) ?? null;
  const windowsById = useMemo(() => new Map(windows.map((w) => [w.id, w])), [windows]);

  useEffect(() => {
    let cancelled = false;
    getAvailability(today, addDays(today, settings.max_days_ahead)).then((rows) => {
      if (!cancelled) setAvailability(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [today, settings.max_days_ahead, reload]);

  // Intake questions for this service the client still needs to answer.
  const questions = service ? fieldsForService(intake.fields, service.id) : [];
  const needsQuestions =
    Boolean(service) &&
    !answered.has(service!.id) &&
    questions.some((f) => f.type !== "heading") &&
    (!intake.serviceIds.includes(service!.id) ||
      unansweredForService(intake.fields, intake.answers, service!.id).some((f) => f.required));

  const blocked = useMemo(() => {
    const set = new Set<string>();
    for (const [slot, ids] of Object.entries(booked)) if (ids.some((id) => petIds.includes(id))) set.add(slot);
    return set;
  }, [booked, petIds]);

  const dates = useMemo(() => {
    if (!date) return [];
    if (!repeat) return [date];
    const days = weekdays.length ? weekdays : [isoWeekday(date)];
    const monday = startOfWeek(date);
    const out: Ymd[] = [];
    for (let w = 0; w < weeks; w++) {
      for (const d of [...days].sort()) {
        const day = addDays(monday, w * 7 + d - 1);
        if (day >= date) out.push(day);
      }
    }
    return out;
  }, [date, repeat, weekdays, weeks]);

  const slotState = (d: Ymd): "open" | "full" | "closed" | "booked" => {
    if (!windowId) return "closed";
    if (blocked.has(`${d}:${windowId}`)) return "booked";
    const a = availability?.find((r) => r.service_date === d && r.window_id === windowId);
    if (!a) return "closed";
    return a.remaining > 0 ? "open" : "full";
  };
  const openDates = dates.filter((d) => slotState(d) === "open");

  const step = !service ? 1 : needsQuestions ? 2 : !petIds.length ? 3 : !date || !windowId ? 4 : 5;

  function reset(keepService = true) {
    setResult(null);
    setDate(null);
    setWindowId(null);
    setRepeat(false);
    setNote("");
    if (!keepService) setServiceId(null);
    setReload((n) => n + 1);
  }

  function submit() {
    if (!service || !windowId) return;
    start(async () => {
      const res = await bookVisits({ serviceId: service.id, petIds, dates: openDates, windowId, note });
      setResult(res);
      if (res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (result?.ok && service && windowId) {
    return (
      <BookedCard
        result={result}
        service={service}
        window={windowsById.get(windowId)!}
        pets={pets.filter((p) => petIds.includes(p.id))}
        timeZone={settings.timezone}
        onAnother={() => reset()}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
      <div className="space-y-5">
        {/* 1. Service */}
        <Step n={1} title="What do you need?" done={Boolean(service)} summary={service?.name} onEdit={() => setServiceId(null)}>
          {!approved ? (
            <Notice tone="info" className="mb-4" title="New here? Start with a meet & greet.">
              We’ll come say hi, meet your pup and learn the routine. Regular walks unlock right after.
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
                  onClick={() => setServiceId(s.id)}
                  className={cn(
                    "group relative rounded-2xl border-2 p-4 text-left transition",
                    locked ? "cursor-not-allowed border-dashed border-ink-100 bg-ink-100/20" : "border-ink-100 bg-white hover:-translate-y-0.5 hover:border-ocean hover:shadow-md",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-display text-lg font-semibold">{s.name}</span>
                    {locked ? <Lock className="size-4 shrink-0 text-ink-400" aria-label="Locked" /> : null}
                    {!locked && s.confirmation === "request" ? (
                      <span className="shrink-0 rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-extrabold">We confirm</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-sm font-bold text-ocean">
                    {[formatPrice(s.price_cents, s.price_label), formatDuration(s.duration_minutes)].filter(Boolean).join(" · ")}
                  </span>
                  {s.description ? <span className="mt-2 line-clamp-2 block text-sm text-ink-600">{s.description}</span> : null}
                  {locked ? <span className="mt-2 block text-xs font-bold text-ink-400">Unlocks after your meet &amp; greet</span> : null}
                </button>
              );
            })}
          </div>
        </Step>

        {/* 2. Service questions */}
        {service && needsQuestions ? (
          <Step n={2} title={`A few questions about ${service.name}`} done={false}>
            <ServiceQuestions
              key={service.id}
              service={service}
              fields={questions}
              answers={intake.answers}
              onDone={() => setAnswered((s) => new Set(s).add(service.id))}
            />
          </Step>
        ) : null}

        {/* 3. Pups */}
        {service && !needsQuestions ? (
          <Step n={2} title="Who’s coming along?" done={false}>
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
                  <p className="mt-3 text-sm text-ink-600">Up to {service.max_pets} pups per visit.</p>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-sea-200 bg-sea-50 p-5 text-center">
                <PawPrint className="mx-auto size-8 text-sea-300" aria-hidden />
                <p className="mt-2 font-bold">Add your pup first</p>
                <p className="text-sm text-ink-600">So we know who we’re walking!</p>
                <ButtonLink href="/portal/pets/new" size="sm" className="mt-3">
                  Add a pup
                </ButtonLink>
              </div>
            )}
          </Step>
        ) : null}

        {/* 4. Day & time */}
        {service && !needsQuestions && petIds.length ? (
          <Step n={3} title="Pick a day and time" done={false}>
            <DateWindowPicker
              availability={availability ?? []}
              loading={availability === null}
              windows={windows}
              today={today}
              date={date}
              windowId={windowId}
              blocked={blocked}
              onChange={(d, w) => {
                setDate(d);
                setWindowId(w);
                setWeekdays([isoWeekday(d)]);
              }}
            />
          </Step>
        ) : null}

        {/* 5. Repeat + notes */}
        {step === 5 && service ? (
          <Step n={4} title="Make it a regular thing?" done={false}>
            {service.confirmation === "instant" ? (
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
                        {[2, 4, 6, 8, 12].map((n) => (
                          <option key={n} value={n}>
                            {n} weeks
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <ul className="flex flex-wrap gap-1.5">
                      {dates.map((d) => {
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
                    {openDates.length < dates.length ? (
                      <p className="text-sm text-ink-600">Crossed-out dates are full or unavailable and will be skipped.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-ink-600">This one’s a single visit — we’ll confirm it with you.</p>
            )}
            <Field label="Anything we should know for this visit?" htmlFor="note" className="mt-5">
              <Textarea
                id="note"
                rows={3}
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Gate code changed, extra treats, leash is by the door…"
              />
            </Field>
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
            <Row label={openDates.length > 1 ? `${openDates.length} visits` : "When"}>
              {date && windowId ? (
                <>
                  {openDates.length > 1 ? `Starting ${shortDate(openDates[0])}` : longDate(date)}
                  <span className="block font-semibold text-ink-600">
                    {windowsById.get(windowId)?.label} · {windowRange(windowsById.get(windowId)!)}
                  </span>
                </>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </Row>
            {service?.price_cents != null && openDates.length ? (
              <Row label="Price">
                {formatPrice(service.price_cents, service.price_label)}
                {openDates.length > 1 && service.price_cents ? (
                  <span className="block font-semibold text-ink-600">
                    About {formatPrice(service.price_cents * openDates.length, null)} for {openDates.length} visits
                  </span>
                ) : null}
              </Row>
            ) : null}
          </dl>
          {result?.error ? <Notice tone="error">{result.error}</Notice> : null}
          <Button className="w-full" size="lg" disabled={step < 5 || !openDates.length || pending} onClick={submit}>
            {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
            {service?.confirmation === "request" ? "Send request" : openDates.length > 1 ? `Book ${openDates.length} visits` : "Book it"}
          </Button>
          <p className="text-center text-xs text-ink-400">
            Free to cancel up to {settings.cancel_cutoff_hours} hours before. Payment is handled after your visit.
          </p>
        </Card>
      </aside>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  summary,
  onEdit,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  summary?: ReactNode;
  onEdit?: () => void;
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
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-ocean hover:bg-sea-50">
            <Pencil className="size-3.5" aria-hidden /> Change
          </button>
        ) : null}
      </Card>
    );
  }
  return (
    <Card className="motion-safe:animate-[rise_200ms_ease-out]">
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
  const [state, action] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const res = await addService(service.id, prev, formData);
    if (res.ok) onDone();
    return res;
  }, null);
  return (
    <form action={action} className="space-y-5">
      <p className="flex items-start gap-2 text-ink-600">
        <ClipboardList className="mt-0.5 size-5 shrink-0 text-ocean" aria-hidden />
        These help your walker take great care of your pup. We’ll save them to your intake form.
      </p>
      <DynamicFormFields fields={fields} answers={answers} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton pendingText="Saving…">Save &amp; continue</SubmitButton>
    </form>
  );
}

function BookedCard({
  result,
  service,
  window: w,
  pets,
  timeZone,
  onAnother,
}: {
  result: BookResult;
  service: Service;
  window: BookingWindow;
  pets: BookingPet[];
  timeZone: string;
  onAnother: () => void;
}) {
  const requested = result.status === "requested";
  const created = result.created ?? [];

  function downloadIcs() {
    const ics = icsForVisits(
      created.map((c) => ({
        id: c.id,
        title: `🐾 ${service.name} · ${pets.map((p) => p.name).join(" & ")}`,
        start: zonedToDate(c.date, w.start_minute, timeZone),
        end: zonedToDate(c.date, w.end_minute, timeZone),
        description: `Waiting for Paws will arrive between ${windowRange(w)}.`,
      })),
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "waiting-for-paws.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

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
            : `${created.length === 1 ? "Your visit is" : `${created.length} visits are`} on the calendar. A confirmation is on its way to your inbox.`}
        </p>
      </div>
      <div className="space-y-5 p-6">
        <ul className="flex flex-wrap justify-center gap-2">
          {created.slice(0, 16).map((c) => (
            <li key={c.id} className="rounded-full bg-sea-50 px-3 py-1 text-sm font-bold">
              {shortDate(c.date)}
            </li>
          ))}
          {created.length > 16 ? <li className="px-2 py-1 text-sm font-bold text-ink-400">+{created.length - 16} more</li> : null}
        </ul>
        <p className="font-bold">
          {service.name} · {w.label}, {windowRange(w)}
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
