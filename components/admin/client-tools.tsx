"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { createBooking, saveClientNotes, setClientRole } from "@/app/admin/_actions/business";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

export function ClientNotesForm({ userId, notes }: { userId: string; notes: string }) {
  const [state, action] = useActionState(saveClientNotes.bind(null, userId), null);
  return (
    <form action={action} className="space-y-3">
      <Textarea
        name="notes"
        rows={6}
        defaultValue={notes}
        aria-label="Private notes"
        placeholder="Private notes only admins can see — quirks, keys, preferences…"
      />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
        Save notes
      </SubmitButton>
    </form>
  );
}

export function RoleToggle({ userId, role }: { userId: string; role: "client" | "admin" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = role === "admin" ? "client" : "admin";
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant={role === "admin" ? "danger" : "outline"}
        disabled={pending}
        onClick={() => {
          const msg =
            next === "admin"
              ? "Give this person full admin access (edit the website, see every client)?"
              : "Remove admin access for this person?";
          if (!confirm(msg)) return;
          start(async () => {
            const res = await setClientRole(userId, next);
            if (!res.ok) setError(res.error ?? "Couldn’t update role.");
          });
        }}
      >
        {role === "admin" ? "Remove admin access" : "Make admin"}
      </Button>
      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

type Option = { id: string; label: string };

export function ManualBookingForm({
  clients,
  pets,
  services,
}: {
  clients: Option[];
  pets: (Option & { ownerId: string })[];
  services: (Option & { minutes: number | null })[];
}) {
  const [userId, setUserId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const clientPets = pets.filter((p) => p.ownerId === userId);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const local = String(form.get("start") ?? "");
        // datetime-local is in the admin's own timezone; convert to an absolute time here.
        const startIso = local ? new Date(local).toISOString() : "";
        const target = e.currentTarget;
        start(async () => {
          const res = await createBooking({
            user_id: userId,
            pet_id: String(form.get("pet_id") ?? ""),
            service_id: serviceId,
            title: String(form.get("title") ?? ""),
            start_time: startIso,
            duration_minutes: minutes,
            notes: String(form.get("notes") ?? ""),
          });
          setResult(res);
          if (res.ok) target.reset();
        });
      }}
    >
      <Field label="Client" htmlFor="b-client">
        <Select id="b-client" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— No client account —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Pup" htmlFor="b-pet">
        <Select id="b-pet" name="pet_id" disabled={!clientPets.length}>
          <option value="">—</option>
          {clientPets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Service" htmlFor="b-service">
        <Select
          id="b-service"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            const s = services.find((x) => x.id === e.target.value);
            if (s?.minutes) setMinutes(s.minutes);
          }}
        >
          <option value="">—</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title (optional)" htmlFor="b-title" help="Defaults to the service name.">
        <Input id="b-title" name="title" />
      </Field>
      <Field label="Date & time" htmlFor="b-start">
        <Input id="b-start" name="start" type="datetime-local" required />
      </Field>
      <Field label="Length (minutes)" htmlFor="b-minutes">
        <Input
          id="b-minutes"
          type="number"
          min={5}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </Field>
      <Field label="Notes" htmlFor="b-notes" className="sm:col-span-2">
        <Textarea id="b-notes" name="notes" rows={2} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add booking"}
        </Button>
        {result?.error ? <span className="text-sm font-bold text-red-700">{result.error}</span> : null}
        {result?.ok ? <span className="text-sm font-bold text-emerald-700">{result.message}</span> : null}
      </div>
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-sm font-bold">{label}</p>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-sm" onFocus={(e) => e.target.select()} />
        <Button
          variant="outline"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
