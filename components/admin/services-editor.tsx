"use client";

import { ArrowDown, ArrowUp, ChevronDown, ListChecks, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { createService, deleteService, moveService, saveService } from "@/app/admin/_actions/catalog";
import { SaveBar } from "@/components/admin/save-bar";
import { IconButton } from "@/components/admin/schema-form";
import { ImageUpload } from "@/components/image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { HANDOFF_META, hasLengthChoice, KIND_META, PRICE_UNITS, serviceEndMinute, servicePrice, serviceStartMinute, serviceTiming } from "@/lib/booking";
import { minuteLabel, minutesToTimeInput, timeToMinutes } from "@/lib/dates";
import { formatDuration } from "@/lib/format";
import type { DurationOption, Handoff, PriceUnit, Service, ServiceKind } from "@/lib/types";
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
            const q = questions[service.id];
            const n = q ? q.once + q.each : 0;
            if (confirm(`Delete “${service.name}”? Past bookings keep their details.${n ? ` Questions asked only for it will be removed too.` : ""}`))
              run(() => deleteService(service.id));
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
  if (s.kind === "window" || s.kind === "time") parts.push(serviceTiming(s));
  if (s.handoff_options.length) parts.push(s.handoff_options.map((h) => HANDOFF_META[h].label).join(" or "));
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
  const [price, setPrice] = useState(dollars(service.price_cents));
  const [fee, setFee] = useState(dollars(service.pickup_fee_cents));
  // Bumped on "Discard changes" so the lengths list (which keeps its own typing) starts over.
  const [resetKey, setResetKey] = useState(0);
  const [saving, start] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);

  const current = { ...draft, price_cents: cents(price), pickup_fee_cents: cents(fee) };
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
              {hasLengthChoice(draft) ? (
                <Field label="Price" htmlFor={id("unit")} help="Set for each length below.">
                  <p className="flex h-11 items-center font-bold text-ink-600">{servicePrice({ ...draft, price_label: null }) || "—"}</p>
                </Field>
              ) : (
                <Field label="Price ($)" htmlFor={id("price")} help="Blank = not shown, 0 = Free">
                  <Input id={id("price")} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
              )}
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
              {(kind === "window" || kind === "time") && !hasLengthChoice(draft) ? (
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

            {kind === "window" || kind === "time" ? (
              <LengthsEditor
                key={`${service.id}-${resetKey}`}
                service={draft}
                basePrice={cents(price)}
                onChange={(options) => set("duration_options", options)}
              />
            ) : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-lg font-semibold">Getting there</legend>
            <p className="text-sm text-ink-600">
              Leave both off when it happens at the client’s home (walks, drop-ins). Tick both and clients choose when they book.
            </p>
            <HandoffRow
              checked={draft.handoff_options.includes("pickup")}
              onCheck={(on) => set("handoff_options", toggle(draft.handoff_options, "pickup", on))}
              title="We pick the pup up from home"
            >
              <Field label="Pick-up fee ($, optional)" htmlFor={id("fee")} className="max-w-48">
                <Input id={id("fee")} type="number" min="0" step="0.01" value={fee} placeholder="0" onChange={(e) => setFee(e.target.value)} />
              </Field>
            </HandoffRow>
            <HandoffRow
              checked={draft.handoff_options.includes("bring")}
              onCheck={(on) => set("handoff_options", toggle(draft.handoff_options, "bring", on))}
              title="Clients can drop their pup off"
            >
              <Field label="Where and when (shown to clients)" htmlFor={id("bring")}>
                <Input
                  id={id("bring")}
                  value={draft.bring_details ?? ""}
                  maxLength={300}
                  placeholder="e.g. Meet us at the Dusty Rhodes Park gate"
                  onChange={(e) => set("bring_details", e.target.value)}
                />
              </Field>
            </HandoffRow>
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
                setPrice(dollars(service.price_cents));
                setFee(dollars(service.pickup_fee_cents));
                setResetKey((k) => k + 1);
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

const dollars = (c: number | null) => (c == null ? "" : String(c / 100));

function cents(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Math.round(Number(text) * 100);
  return Number.isFinite(n) ? n : null;
}

function toggle(list: Handoff[], item: Handoff, on: boolean): Handoff[] {
  return on ? (["pickup", "bring"] as Handoff[]).filter((h) => h === item || list.includes(h)) : list.filter((h) => h !== item);
}

const LENGTHS = [15, 20, 30, 45, 60, 75, 90, 120];
/** What "Add a length" offers next: the usual walk lengths first. */
const SUGGESTED = [30, 60, 45, 15, 90, 120, 20, 75];

/**
 * "Clients choose how long": a list of lengths, each with its own price. Prices are typed as text
 * (so "25." doesn't snap back to "25") and reported up as cents.
 */
function LengthsEditor({
  service,
  basePrice,
  onChange,
}: {
  service: Service;
  basePrice: number | null;
  onChange: (options: DurationOption[]) => void;
}) {
  const [rows, setRows] = useState(() =>
    hasLengthChoice(service)
      ? service.duration_options.map((o) => ({ minutes: o.minutes, price: dollars(o.price_cents) }))
      : [],
  );
  const on = rows.length > 1;

  function update(next: { minutes: number; price: string }[]) {
    setRows(next);
    onChange(next.length > 1 ? next.map((r) => ({ minutes: r.minutes, price_cents: cents(r.price) })) : []);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink-100 p-4">
      <label className="flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          className="size-5 accent-ocean"
          checked={on}
          onChange={(e) => {
            const base = service.duration_minutes ?? 30;
            update(
              e.target.checked
                ? [
                    { minutes: base, price: dollars(basePrice) },
                    { minutes: base < 60 ? 60 : base + 30, price: "" },
                  ]
                : [],
            );
          }}
        />
        Clients choose how long
      </label>
      {on ? (
        <>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <Field label={i === 0 ? "Length" : undefined} htmlFor={`len-${service.id}-${i}`}>
                  <Select
                    id={`len-${service.id}-${i}`}
                    value={r.minutes}
                    className="w-32"
                    onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)))}
                  >
                    {[...new Set([...LENGTHS, r.minutes])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        {formatDuration(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={i === 0 ? "Price ($)" : undefined} htmlFor={`lenp-${service.id}-${i}`}>
                  <Input
                    id={`lenp-${service.id}-${i}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.price}
                    placeholder="Ask"
                    className="w-32"
                    onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  />
                </Field>
                <IconButton label="Remove this length" onClick={() => update(rows.filter((_, j) => j !== i))} disabled={rows.length <= 2}>
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          {new Set(rows.map((r) => r.minutes)).size < rows.length ? (
            <p className="text-sm font-bold text-coral">Two lengths are the same — only the first is kept.</p>
          ) : null}
          {rows.length < 8 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = SUGGESTED.find((m) => !rows.some((r) => r.minutes === m)) ?? rows[rows.length - 1].minutes + 15;
                update([...rows, { minutes: next, price: "" }]);
              }}
            >
              <Plus className="size-4" aria-hidden /> Add a length
            </Button>
          ) : null}
          <p className="text-sm text-ink-600">Clients pick one when they book. Leave a price blank to show “Ask”.</p>
        </>
      ) : null}
    </div>
  );
}

function HandoffRow({
  checked,
  onCheck,
  title,
  children,
}: {
  checked: boolean;
  onCheck: (on: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border-2 p-3 transition", checked ? "border-ocean bg-sea-50" : "border-ink-100")}>
      <label className="flex items-center gap-2 font-bold">
        <input type="checkbox" className="size-5 accent-ocean" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        {title}
      </label>
      {checked ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
