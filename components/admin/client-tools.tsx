"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { saveClientNotes, setBookingApproval, setClientRole } from "@/app/admin/_actions/business";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";

export function ClientNotesForm({ userId, notes }: { userId: string; notes: string }) {
  const [state, onSubmit, pending] = useFormAction(saveClientNotes.bind(null, userId));
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Textarea
        name="notes"
        rows={6}
        defaultValue={notes}
        aria-label="Private notes"
        placeholder="Private notes only admins can see — quirks, keys, preferences…"
      />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="sm" variant="secondary" pendingText="Saving…" pending={pending}>
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

export function ApprovalToggle({ userId, approved }: { userId: string; approved: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={approved}
          disabled={pending}
          onChange={(e) => start(async () => setResult(await setBookingApproval(userId, e.target.checked)))}
        />
        <span
          aria-hidden
          className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink-200 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-4 peer-focus-visible:ring-sea-100 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
        />
        <span>
          <span className="block font-bold">{approved ? "Approved for regular visits" : "Not approved yet"}</span>
          <span className="block text-sm text-ink-600">
            {approved ? "They can book every service online." : "They can only book a meet & greet until you approve them."}
          </span>
        </span>
      </label>
      {result?.error ? <p className="text-sm font-bold text-red-700">{result.error}</p> : null}
    </div>
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
