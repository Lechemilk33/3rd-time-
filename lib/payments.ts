/**
 * Paying for visits.
 *
 * Clients pay for any of their confirmed visits (upcoming or done) online with Stripe Checkout,
 * several at once if they like. Stripe tells the site through a signed webhook, and the database
 * (public.stripe_webhook) marks those visits paid. The team can also mark a visit paid in cash or
 * another way, and refund card payments from the calendar. When a client cancels a visit they paid
 * for online (only possible inside the free-cancellation window), it's refunded automatically.
 */

import { estimateTotal, type BookingDetail } from "@/lib/booking";
import { diffDays } from "@/lib/dates";
import { formatMoney } from "@/lib/format";

type Priced = Pick<BookingDetail, "kind" | "service_date" | "end_date" | "duration_minutes" | "handoff" | "service">;

/** What one booking costs: its length's price (per night for stays) plus any pick-up fee. Null if it has no set price. */
export function visitAmount(b: Priced): number | null {
  if (!b.service) return null;
  const nights = b.kind === "stay" ? Math.max(1, diffDays(b.end_date, b.service_date)) : undefined;
  return estimateTotal(b.service, { nights, days: 1, visits: 1 }, { minutes: b.duration_minutes, handoff: b.handoff });
}

export type PayState =
  /** Paid online or marked paid by the team. */
  | "paid"
  /** Paid, then refunded in full. */
  | "refunded"
  /** Can be paid online now. */
  | "due"
  /** Has a price, but this service isn't paid online (pay the team directly). */
  | "offline"
  /** Free, or no set price. */
  | "free"
  /** Not confirmed yet, or canceled: nothing to pay. */
  | "none";

type Payable = Priced & Pick<BookingDetail, "status" | "paid_at" | "paid_cents" | "paid_via" | "refunded_cents"> & {
  service: (Priced["service"] & { allow_online_payment?: boolean }) | null;
};

export function payState(b: Payable): PayState {
  if (b.paid_at) return (b.paid_cents ?? 0) > 0 && b.refunded_cents >= (b.paid_cents ?? 0) ? "refunded" : "paid";
  if (b.status !== "scheduled" && b.status !== "completed") return "none";
  const amount = visitAmount(b);
  if (!amount) return "free";
  return b.service?.allow_online_payment ? "due" : "offline";
}

/** Visits a client can pay for online, and their total. */
export function dueVisits<T extends Payable>(visits: T[]) {
  const due = visits.filter((b) => payState(b) === "due");
  return { due, total: due.reduce((sum, b) => sum + (visitAmount(b) ?? 0), 0) };
}

/** "Paid $25 by card" / "Paid $25 · cash" / "Refunded $25" / "$25 due". */
export function payLabel(b: Payable): string {
  const state = payState(b);
  const paid = formatMoney(b.paid_cents ?? 0);
  switch (state) {
    case "refunded":
      return `Refunded ${paid}`;
    case "paid":
      return b.refunded_cents > 0
        ? `Paid ${paid} · ${formatMoney(b.refunded_cents)} refunded`
        : `Paid ${paid}${b.paid_via === "card" ? " by card" : b.paid_via === "cash" ? " in cash" : ""}`;
    case "due":
      return `${formatMoney(visitAmount(b))} to pay`;
    case "offline":
      return `${formatMoney(visitAmount(b))} · pay us directly`;
    default:
      return "";
  }
}

// Stripe metadata values are capped at 500 characters: visit ids and amounts go in chunks.
const PER_CHUNK = 11;
export const MAX_VISITS_PER_PAYMENT = 44;

/** { visits_1: "<id>:<cents>,...", visits_2: ... } for the webhook to mark visits paid. */
export function visitsMetadata(items: { id: string; amount: number }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < items.length; i += PER_CHUNK) {
    out[`visits_${i / PER_CHUNK + 1}`] = items
      .slice(i, i + PER_CHUNK)
      .map((v) => `${v.id}:${v.amount}`)
      .join(",");
  }
  return out;
}

/** Booking ids from a Checkout Session's metadata (to show them as paid before the webhook lands). */
export function visitIdsFromMetadata(metadata: Record<string, string> | null | undefined): string[] {
  return Object.entries(metadata ?? {})
    .filter(([k]) => /^visits_\d+$/.test(k))
    .flatMap(([, v]) => v.split(","))
    .map((pair) => pair.split(":")[0])
    .filter((id) => /^[0-9a-f-]{36}$/.test(id));
}
