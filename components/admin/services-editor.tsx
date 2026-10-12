"use client";

import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { createService, deleteService, moveService, saveService } from "@/app/admin/_actions/catalog";
import { SaveBar } from "@/components/admin/save-bar";
import { IconButton } from "@/components/admin/schema-form";
import { ImageUpload } from "@/components/image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { formatDuration, formatPrice } from "@/lib/format";
import type { Service } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ServicesEditor({ initial, stripeReady }: { initial: Service[]; stripeReady: boolean }) {
  const [services, setServices] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string; services?: Service[] }>, openLast = false) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      if (res.services) {
        setServices(res.services);
        if (openLast) setOpenId(res.services[res.services.length - 1]?.id ?? null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {services.map((service, index) => (
        <ServiceCard
          key={service.id}
          service={service}
          open={openId === service.id}
          onToggle={() => setOpenId(openId === service.id ? null : service.id)}
          stripeReady={stripeReady}
          busy={pending}
          isFirst={index === 0}
          isLast={index === services.length - 1}
          onMove={(dir) => run(() => moveService(service.id, dir))}
          onDelete={() => {
            if (confirm(`Delete “${service.name}”?`)) run(() => deleteService(service.id));
          }}
          onSaved={(next) => setServices((all) => all.map((s) => (s.id === next.id ? next : s)))}
        />
      ))}
      <Button onClick={() => run(createService, true)} disabled={pending}>
        <Plus className="size-4" aria-hidden /> Add a service
      </Button>
    </div>
  );
}

function ServiceCard({
  service,
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

  function save() {
    start(async () => {
      const { id, position, ...input } = current;
      void position;
      const res = await saveService(id, input);
      if (res.ok) {
        onSaved(current);
        setResult({ message: res.message });
      } else setResult({ error: res.error });
    });
  }

  return (
    <div className={cn("rounded-3xl border bg-white shadow-sm", open ? "border-ocean/40" : "border-ink-100")}>
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{service.name}</span>
              {!service.active ? <Badge tone="gray">Hidden</Badge> : null}
              {service.bookable ? (
                <Badge tone="sea">{service.confirmation === "request" ? "Book on request" : "Book online"}</Badge>
              ) : null}
              {service.allow_online_payment ? <Badge tone="green">Pay online</Badge> : null}
            </span>
            <span className="block text-sm text-ink-600">
              {[formatPrice(service.price_cents, service.price_label), formatDuration(service.duration_minutes)]
                .filter(Boolean)
                .join(" · ")}
            </span>
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
        <div className="space-y-5 border-t border-ink-100 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor={`name-${service.id}`}>
              <Input id={`name-${service.id}`} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price ($)" htmlFor={`price-${service.id}`} help="Blank = no price shown, 0 = Free">
                <Input
                  id={`price-${service.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <Field label="Price label" htmlFor={`label-${service.id}`}>
                <Input
                  id={`label-${service.id}`}
                  value={draft.price_label ?? ""}
                  placeholder="per walk"
                  onChange={(e) => set("price_label", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Description" htmlFor={`desc-${service.id}`} className="sm:col-span-2">
              <Textarea
                id={`desc-${service.id}`}
                value={draft.description ?? ""}
                rows={3}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <Field label="Length (minutes)" htmlFor={`dur-${service.id}`}>
              <Input
                id={`dur-${service.id}`}
                type="number"
                min="0"
                value={draft.duration_minutes ?? ""}
                onChange={(e) => set("duration_minutes", e.target.value === "" ? null : Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Photo (optional)">
            <ImageUpload value={draft.image_url ?? ""} onChange={(url) => set("image_url", url)} folder="services" />
          </Field>
          <div className="space-y-4 rounded-2xl bg-sea-50 p-4">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="size-5 accent-ocean" checked={draft.bookable} onChange={(e) => set("bookable", e.target.checked)} />
              Clients can book this online
            </label>
            {draft.bookable ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Who can book it" htmlFor={`aud-${service.id}`}>
                  <Select id={`aud-${service.id}`} value={draft.audience} onChange={(e) => set("audience", e.target.value as Service["audience"])}>
                    <option value="approved">Approved clients</option>
                    <option value="everyone">Anyone with an account</option>
                  </Select>
                </Field>
                <Field label="Booking" htmlFor={`conf-${service.id}`}>
                  <Select id={`conf-${service.id}`} value={draft.confirmation} onChange={(e) => set("confirmation", e.target.value as Service["confirmation"])}>
                    <option value="instant">Booked instantly</option>
                    <option value="request">You confirm each request</option>
                  </Select>
                </Field>
                <Field label="Pups per visit" htmlFor={`pets-${service.id}`}>
                  <Input
                    id={`pets-${service.id}`}
                    type="number"
                    min={1}
                    max={10}
                    value={draft.max_pets}
                    onChange={(e) => set("max_pets", Number(e.target.value))}
                  />
                </Field>
              </div>
            ) : null}
            <p className="text-sm text-ink-600">
              Tip: new clients usually book a Meet &amp; Greet (anyone, you confirm) and unlock regular walks once you approve them.
            </p>
          </div>
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
