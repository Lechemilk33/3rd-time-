"use client";

import { ArrowDown, ArrowUp, ChevronDown, ListChecks, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createService, deleteService, moveService, saveService } from "@/app/admin/_actions/catalog";
import { SaveBar } from "@/components/admin/save-bar";
import { IconButton } from "@/components/admin/schema-form";
import { ImageUpload } from "@/components/image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { KIND_META, PRICE_UNITS, serviceEndMinute, servicePrice, serviceStartMinute } from "@/lib/booking";
import { minuteLabel, minutesToTimeInput, timeToMinutes } from "@/lib/dates";
import { formatDuration } from "@/lib/format";
import type { PriceUnit, Service, ServiceKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS = Object.keys(KIND_META) as ServiceKind[];

/** Questions tied to each service: asked once on the intake form, or on every booking. */
export type ServiceQuestionCounts = Record<string, { once: number; each: number }>;

export function ServicesEditor({
  initial,
  stripeReady,
  questions,
}: {
  initial: Service[];
  stripeReady: boolean;
  questions: ServiceQuestionCounts;
}) {
  const [services, setServices] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string; services?: Service[]; id?: string }>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      if (res.services) setServices(res.services);
      if (res.id) setOpenId(res.id);
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {services.map((service, index) => (
        <ServiceCard
          key={service.id}
          service={service}
          questions={questions[service.id] ?? { once: 0, each: 0 }}
          open={openId === service.id}
          onToggle={() => setOpenId(openId === service.id ? null : service.id)}
          stripeReady={stripeReady}
          busy={pending}
          isFirst={index === 0}
          isLast={index === services.length - 1}
          onMove={(dir) => run(() => moveService(service.id, dir))}
          onDelete={() => {
            if (confirm(`Delete “${service.name}”? Past bookings keep their details.`)) run(() => deleteService(service.id));
          }}
          onSaved={(next) => setServices((all) => all.map((s) => (s.id === next.id ? next : s)))}
        />
      ))}
      {picking ? (
        <div className="animate-[rise_.2s_ease-out] rounded-3xl border-2 border-dashed border-ocean/40 bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">What kind of service?</h2>
              <p className="text-ink-600">This decides how clients pick a time. You can change it later.</p>
            </div>
            <IconButton label="Cancel" onClick={() => setPicking(false)}>
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={pending}
                onClick={() => {
                  setPicking(false);
                  run(() => createService(kind));
                }}
                className="flex items-start gap-3 rounded-2xl border-2 border-ink-100 p-4 text-left transition hover:border-ocean hover:bg-sea-50 disabled:opacity-60"
              >
                <span className="text-2xl" aria-hidden>
                  {KIND_META[kind].emoji}
                </span>
                <span>
                  <span className="block font-bold">{KIND_META[kind].label}</span>
                  <span className="block text-sm text-ink-600">{KIND_META[kind].hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button onClick={() => setPicking(true)} disabled={pending}>
          <Plus className="size-4" aria-hidden /> Add a service
        </Button>
      )}
    </div>
  );
}

function summary(s: Service) {
  const parts = [servicePrice(s)];
  if (s.kind === "window" || s.kind === "time") parts.push(formatDuration(s.duration_minutes));
  if (s.kind === "day") parts.push(`${minuteLabel(serviceStartMinute(s))} – ${minuteLabel(serviceEndMinute(s))}`);
  if (s.kind === "stay") {
    parts.push(`check-in ${minuteLabel(serviceStartMinute(s))}, check-out ${minuteLabel(serviceEndMinute(s))}`);
  }
  if ((s.kind === "day" || s.kind === "stay") && s.daily_capacity) {
    parts.push(`${s.daily_capacity} spot${s.daily_capacity === 1 ? "" : "s"} per ${s.kind === "stay" ? "night" : "day"}`);
  }
  return parts.filter(Boolean).join(" · ");
}

function ServiceCard({
  service,
  questions,
  open,
  onToggle,
  stripeReady,
  busy,
  isFirst,
  isLast,
  onMove,
  onDelete,
  onSaved,
}: {
  service: Service;
  questions: { once: number; each: number };
  open: boolean;
  onToggle: () => void;
  stripeReady: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
  onSaved: (service: Service) => void;
}) {
  const [draft, setDraft] = useState(service);
  const [price, setPrice] = useState(service.price_cents == null ? "" : String(service.price_cents / 100));
  const [saving, start] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);

  const priceCents = price.trim() === "" ? null : Math.round(Number(price) * 100);
  const current = { ...draft, price_cents: Number.isFinite(priceCents) ? priceCents : null };
  const dirty = JSON.stringify(current) !== JSON.stringify(service);
  const set = <K extends keyof Service>(key: K, value: Service[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const id = (name: string) => `${name}-${service.id}`;
  const kind = draft.kind;
  const ranged = kind === "day" || kind === "stay";

  function changeKind(next: ServiceKind) {
    setDraft((d) => ({
      ...d,
      kind: next,
      // Suggest the matching price unit when it still has the old kind's default.
      price_unit:
        next === "stay" && (d.price_unit === "visit" || d.price_unit === "day")
          ? "night"
          : next === "day" && (d.price_unit === "visit" || d.price_unit === "night")
            ? "day"
            : (next === "window" || next === "time") && (d.price_unit === "day" || d.price_unit === "night")
              ? "visit"
              : d.price_unit,
      duration_minutes: next === "window" || next === "time" ? (d.duration_minutes ?? 30) : d.duration_minutes,
    }));
  }

  function save() {
    start(async () => {
      const { id: serviceId, position, ...input } = current;
      void position;
      const res = await saveService(serviceId, input);
      if (res.ok) {
        const saved = res.service ?? current;
        setDraft(saved);
        onSaved(saved);
        setResult({ message: res.message });
      } else setResult({ error: res.error });
    });
  }

  return (
    <div className={cn("rounded-3xl border bg-white shadow-sm", open ? "border-ocean/40" : "border-ink-100")}>
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sea-50 text-xl" aria-hidden>
            {KIND_META[service.kind].emoji}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{service.name}</span>
              <Badge tone="gray">{KIND_META[service.kind].short}</Badge>
              {!service.active ? <Badge tone="gray">Hidden</Badge> : null}
              {service.bookable ? (
                <Badge tone="sea">{service.confirmation === "request" ? "Book on request" : "Book online"}</Badge>
              ) : null}
              {service.allow_online_payment ? <Badge tone="green">Pay online</Badge> : null}
            </span>
            <span className="block text-sm text-ink-600">{summary(service)}</span>
          </span>
          <ChevronDown className={cn("ml-auto size-5 shrink-0 text-ink-400 transition", open && "rotate-180")} aria-hidden />
        </button>
        <IconButton label="Move up" onClick={() => onMove("up")} disabled={busy || isFirst}>
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton label="Move down" onClick={() => onMove("down")} disabled={busy || isLast}>
          <ArrowDown className="size-4" />
        </IconButton>
      </div>
      {open ? (
        <div className="space-y-6 border-t border-ink-100 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor={id("name")}>
              <Input id={id("name")} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-[1fr_1.2fr] gap-3">
              <Field label="Price ($)" htmlFor={id("price")} help="Blank = not shown, 0 = Free">
                <Input id={id("price")} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <Field label="Charged" htmlFor={id("unit")}>
                <Select id={id("unit")} value={draft.price_unit} onChange={(e) => set("price_unit", e.target.value as PriceUnit)}>
                  {(Object.keys(PRICE_UNITS) as PriceUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {PRICE_UNITS[u]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor={id("desc")} className="sm:col-span-2">
              <Textarea id={id("desc")} value={draft.description ?? ""} rows={3} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field
              label="Price wording (optional)"
              htmlFor={id("label")}
              help="Replaces “per night” etc., e.g. “per pup per night”."
              className="sm:col-span-2"
            >
              <Input id={id("label")} value={draft.price_label ?? ""} placeholder={PRICE_UNITS[draft.price_unit]} onChange={(e) => set("price_label", e.target.value)} />
            </Field>
          </div>

          <fieldset className="space-y-4">
            <legend className="mb-2 font-display text-lg font-semibold">How is it booked?</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => changeKind(k)}
                  className={cn(
                    "rounded-2xl border-2 p-3 text-left transition",
                    kind === k ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                  )}
                >
                  <span className="mr-1.5" aria-hidden>
                    {KIND_META[k].emoji}
                  </span>
                  <span className="font-bold">{KIND_META[k].label}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-ink-600">{KIND_META[kind].hint}</p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kind === "window" || kind === "time" ? (
                <Field
                  label={kind === "time" ? "Appointment length (min)" : "Visit length (min)"}
                  htmlFor={id("dur")}
                  help={kind === "time" ? "Start times are offered every 30 min inside your windows." : "Clients pick a window; you choose the exact time."}
                >
                  <Input
                    id={id("dur")}
                    type="number"
                    min="5"
                    max="720"
                    step="5"
                    value={draft.duration_minutes ?? ""}
                    onChange={(e) => set("duration_minutes", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </Field>
              ) : null}
              {ranged ? (
                <>
                  <TimeField
                    id={id("start")}
                    label={kind === "stay" ? "Check-in from" : "Drop-off"}
                    value={serviceStartMinute(draft)}
                    onChange={(m) => set("start_minute", m)}
                  />
                  <TimeField
                    id={id("end")}
                    label={kind === "stay" ? "Check-out by" : "Pick-up"}
                    value={serviceEndMinute(draft)}
                    onChange={(m) => set("end_minute", m)}
                  />
                  <Field
                    label={kind === "stay" ? "Spots per night" : "Spots per day"}
                    htmlFor={id("cap")}
                    help="Blank = no limit"
                  >
                    <Input
                      id={id("cap")}
                      type="number"
                      min="1"
                      max="100"
                      value={draft.daily_capacity ?? ""}
                      placeholder="No limit"
                      onChange={(e) => set("daily_capacity", e.target.value === "" ? null : Number(e.target.value))}
                    />
                  </Field>
                </>
              ) : null}
              <Field label={ranged ? "Pups per booking" : "Pups per visit"} htmlFor={id("pets")}>
                <Input id={id("pets")} type="number" min={1} max={10} value={draft.max_pets} onChange={(e) => set("max_pets", Number(e.target.value))} />
              </Field>
              {kind === "stay" ? (
                <>
                  <Field label="Shortest stay (nights)" htmlFor={id("minn")}>
                    <Input id={id("minn")} type="number" min={1} max={60} value={draft.min_nights} onChange={(e) => set("min_nights", Number(e.target.value))} />
                  </Field>
                  <Field label="Longest stay (nights)" htmlFor={id("maxn")}>
                    <Input id={id("maxn")} type="number" min={1} max={90} value={draft.max_nights} onChange={(e) => set("max_nights", Number(e.target.value))} />
                  </Field>
                </>
              ) : null}
            </div>
          </fieldset>

          <div className="space-y-4 rounded-2xl bg-sea-50 p-4">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="size-5 accent-ocean" checked={draft.bookable} onChange={(e) => set("bookable", e.target.checked)} />
              Clients can book this online
            </label>
            {draft.bookable ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Who can book it" htmlFor={id("aud")}>
                  <Select id={id("aud")} value={draft.audience} onChange={(e) => set("audience", e.target.value as Service["audience"])}>
                    <option value="approved">Approved clients</option>
                    <option value="everyone">Anyone with an account</option>
                  </Select>
                </Field>
                <Field label="Booking" htmlFor={id("conf")}>
                  <Select id={id("conf")} value={draft.confirmation} onChange={(e) => set("confirmation", e.target.value as Service["confirmation"])}>
                    <option value="instant">Booked instantly</option>
                    <option value="request">You confirm each request</option>
                  </Select>
                </Field>
              </div>
            ) : null}
            <p className="text-sm text-ink-600">
              Tip: new clients usually book a Meet &amp; Greet (anyone, you confirm) and unlock everything else once you approve them.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-100 p-4">
            <div className="flex items-start gap-3">
              <ListChecks className="mt-0.5 size-5 shrink-0 text-ocean" aria-hidden />
              <div>
                <p className="font-bold">Questions for this service</p>
                <p className="text-sm text-ink-600">
                  {questions.once || questions.each
                    ? [
                        questions.once ? `${questions.once} on the intake form` : null,
                        questions.each ? `${questions.each} asked every booking` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "None yet — add questions only people booking this are asked."}
                </p>
              </div>
            </div>
            <Link href={`/admin/intake-form?service=${service.id}`} className="font-bold text-ocean hover:underline">
              Edit questions →
            </Link>
          </div>

          <Field label="Photo (optional)">
            <ImageUpload value={draft.image_url ?? ""} onChange={(url) => set("image_url", url)} folder="services" />
          </Field>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="size-5 accent-ocean" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
              Show on website
            </label>
            <label className="flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                className="size-5 accent-ocean"
                checked={draft.allow_online_payment}
                onChange={(e) => set("allow_online_payment", e.target.checked)}
              />
              Clients can pay online{stripeReady ? "" : " (once Stripe is connected)"}
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
            <SaveBar
              dirty={dirty}
              pending={saving}
              onSave={save}
              onReset={() => {
                setDraft(service);
                setPrice(service.price_cents == null ? "" : String(service.price_cents / 100));
              }}
              message={result?.message}
              error={result?.error}
            />
            <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimeField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (minute: number) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="time"
        step={900}
        value={minutesToTimeInput(value)}
        onChange={(e) => {
          const m = timeToMinutes(e.target.value);
          if (m != null) onChange(m);
        }}
      />
    </Field>
  );
}
