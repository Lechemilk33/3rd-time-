"use client";

import { CreditCard, Lock } from "lucide-react";
import { useState } from "react";
import { payForVisits } from "@/app/actions/checkout";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PayableVisit = { id: string; title: string; detail: string; amount: number; past: boolean };

/** Unpaid visits with a checkbox each (all picked to start) and one button to pay for the picked ones. */
export function PayVisits({ visits, max }: { visits: PayableVisit[]; max: number }) {
  const [picked, setPicked] = useState<string[]>(() => visits.slice(0, max).map((v) => v.id));
  const total = visits.filter((v) => picked.includes(v.id)).reduce((sum, v) => sum + v.amount, 0);
  const all = picked.length === Math.min(visits.length, max);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p));

  return (
    <form action={payForVisits} className="space-y-4">
      {visits.length > 1 ? (
        <button
          type="button"
          onClick={() => setPicked(all ? [] : visits.slice(0, max).map((v) => v.id))}
          className="text-sm font-bold text-ocean hover:underline"
        >
          {all ? "Clear all" : "Pick all"}
        </button>
      ) : null}
      <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
        {visits.map((v) => {
          const on = picked.includes(v.id);
          return (
            <li key={v.id}>
              <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-3 transition", on ? "bg-sea-50/60" : "hover:bg-sand/40")}>
                <input
                  type="checkbox"
                  name="visit"
                  value={v.id}
                  checked={on}
                  onChange={() => toggle(v.id)}
                  className="size-5 shrink-0 accent-ocean"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{v.title}</span>
                  <span className="block text-sm text-ink-600">
                    {v.detail}
                    {v.past ? " · done" : ""}
                  </span>
                </span>
                <span className="font-bold">{formatMoney(v.amount)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sand/60 p-4">
        <div>
          <p className="text-sm font-bold text-ink-600">
            {picked.length} visit{picked.length === 1 ? "" : "s"}
          </p>
          <p className="font-display text-2xl font-semibold">{formatMoney(total)}</p>
        </div>
        <SubmitButton size="lg" pendingText="Opening secure checkout…" disabled={!picked.length}>
          <CreditCard className="size-5" aria-hidden /> Pay {picked.length ? formatMoney(total) : ""}
        </SubmitButton>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-600">
        <Lock className="size-3.5" aria-hidden /> Secure checkout by Stripe. Card, Apple Pay and Google Pay accepted; we never see your card number.
      </p>
    </form>
  );
}
