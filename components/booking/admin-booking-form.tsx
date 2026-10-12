"use client";

import { ArrowRight, CalendarCheck2, Clock, LoaderCircle, PawPrint, Repeat, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createBookings, getAdminAvailability, type CreateBookingsResult } from "@/app/admin/_actions/bookings";
import { ClientPicker, type PickerClient, type PickerPet } from "@/components/booking/client-picker";
import { PetAvatar } from "@/components/calendar/event-bits";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SKIP_REASONS, windowRange, type Availability, type BookingWindow, type Walker } from "@/lib/booking";
import {
  addDays,
  isoWeekday,
  isYmd,
  minutesToTimeInput,
  shortDate,
  startOfWeek,
  timeToMinutes,
  type Ymd,
} from "@/lib/dates";
import { formatDuration, formatPrice } from "@/lib/format";
import type { Service } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AdminBookingForm({
  clients,
  services,
  windows,
  walkers,
  today,
  initial,
}: {
  clients: PickerClient[];
  services: Service[];
  windows: BookingWindow[];
  walkers: Walker[];
  today: Ymd;
  initial: { date: Ymd; minute: number | null; walkerId: string | null; clientId: string | null };
}) {
  const activeWindows = windows.filter((w) => w.active);
  const [client, setClient] = useState<PickerClient | null>(() => clients.find((c) => c.id === initial.clientId) ?? null);
  const [guest, setGuest] = useState<{ name: string; email: string } | null>(null);
  const [petIds, setPetIds] = useState<string[]>(() => {
    const c = clients.find((x) => x.id === initial.clientId);
    return c && c.pets.length === 1 ? [c.pets[0].id] : [];
  });
  const [serviceId, setServiceId] = useState(services.find((s) => s.audience === "approved")?.id ?? services[0]?.id ?? "");
  const [date, setDate] = useState<Ymd>(initial.date);
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
  const [availability, setAvailability] = useState<{ date: Ymd; rows: Availability[] } | null>(null);
  const [result, setResult] = useState<CreateBookingsResult | null>(null);
  const [pending, start] = useTransition();

  const service = services.find((s) => s.id === serviceId);
  const minute = timeMode === "exact" ? timeToMinutes(`${exactTime}:00`) : null;

  // Open spots for the chosen day.
  useEffect(() => {
    if (!isYmd(date)) return;
    let cancelled = false;
    getAdminAvailability(date, date).then((rows) => {
      if (!cancelled) setAvailability({ date, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const dates = useMemo(() => {
    if (!isYmd(date)) return [];
    if (!repeat) return [date];
    const monday = startOfWeek(date);
    const out: Ymd[] = [];
    for (let w = 0; w < weeks; w++) {
      for (const d of [...weekdays].sort()) {
        const day = addDays(monday, w * 7 + d - 1);
        if (day >= date) out.push(day);
      }
    }
    return out;
  }, [date, repeat, weekdays, weeks]);

  const who = client ? (client.full_name || client.email || "client") : guest?.name;
  const canSubmit = Boolean(serviceId && dates.length && (client || guest?.name.trim()) && (timeMode === "window" ? windowId : minute != null));

  function submit() {
    start(async () => {
      const res = await createBookings({
        clientId: client?.id ?? null,
        guestName: guest?.name,
        guestEmail: guest?.email,
        serviceId,
        petIds: client ? petIds : [],
        dates,
        windowId: timeMode === "window" ? windowId : null,
        arrivalMinute: minute,
        walkerId: walkerId || null,
        note,
        force,
        notify,
      });
      setResult(res);
      if (res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
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
          {result.created?.length === 1 ? "Visit booked!" : `${result.created?.length} visits booked!`}
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
            <p className="mt-2">Tick “Allow overbooking” to book them anyway.</p>
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

  const availFor = (wId: string) => (availability?.date === date ? availability.rows.find((r) => r.window_id === wId) : undefined);

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
                onClick={() => setServiceId(s.id)}
                className={cn(
                  "rounded-2xl border-2 p-3 text-left transition",
                  s.id === serviceId ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                )}
              >
                <span className="block font-extrabold">{s.name}</span>
                <span className="text-sm text-ink-600">
                  {[formatDuration(s.duration_minutes), formatPrice(s.price_cents, s.price_label)].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* When */}
        <Card className="space-y-5">
          <StepTitle n={3} title="When?" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="b-date">
              <Input
                id="b-date"
                type="date"
                value={date}
                onChange={(e) => {
                  const d = e.target.value;
                  setDate(d);
                  if (isYmd(d) && !repeat) setWeekdays([isoWeekday(d)]);
                }}
              />
            </Field>
            <Field label="Walker" htmlFor="b-walker">
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
                        {availability?.date !== date ? "Checking…" : !a ? "Closed" : a.remaining > 0 ? `${a.remaining} of ${a.capacity} open` : "Full"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Input type="time" step={300} value={exactTime} onChange={(e) => setExactTime(e.target.value)} className="w-40" aria-label="Exact time" />
                <p className="flex items-center gap-1.5 text-sm text-ink-600">
                  <Clock className="size-4" aria-hidden />
                  {(() => {
                    const w = minute != null ? activeWindows.find((x) => minute >= x.start_minute && minute < x.end_minute) : undefined;
                    return w ? `Counts toward the ${w.label.toLowerCase()} window` : "Outside your arrival windows";
                  })()}
                </p>
              </div>
            )}
          </div>

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
        </Card>

        <Card className="space-y-4">
          <StepTitle n={4} title="Anything else?" />
          <Field label="Visit notes (the client can see these)" htmlFor="b-note">
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
            </SummaryRow>
            <SummaryRow icon={<Clock className="size-4" />} label={dates.length > 1 ? `${dates.length} visits` : "When"}>
              {dates.length ? (
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
              <span className="mt-1 block text-ink-600">
                {timeMode === "window"
                  ? (() => {
                      const w = activeWindows.find((x) => x.id === windowId);
                      return w ? `${w.label} · ${windowRange(w)}` : "";
                    })()
                  : exactTime}
              </span>
            </SummaryRow>
          </dl>
          {date < today ? <Notice tone="warning">That date is in the past.</Notice> : null}
          {result?.error ? <Notice tone="error">{result.error}</Notice> : null}
          <Button className="w-full" size="lg" disabled={!canSubmit || pending} onClick={submit}>
            {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
            {dates.length > 1 ? `Book ${dates.length} visits` : "Book visit"}
          </Button>
        </Card>
      </aside>
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
