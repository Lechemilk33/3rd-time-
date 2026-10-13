import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * Refunds card payments for these visits (whatever hasn't been refunded yet). Each refund is tagged
 * with its visit so the webhook can show it there, and keyed so a retry never refunds twice.
 * Returns the total refunded, in cents.
 */
export async function refundVisits(supabase: SupabaseClient, bookingIds: string[]): Promise<{ refunded: number; failed: number }> {
  if (!bookingIds.length || !isStripeConfigured()) return { refunded: 0, failed: 0 };
  const { data } = await supabase
    .from("bookings")
    .select("id, paid_cents, paid_via, refunded_cents, payment:payments (stripe_payment_intent_id)")
    .in("id", bookingIds)
    .eq("paid_via", "card");

  let refunded = 0;
  let failed = 0;
  for (const b of data ?? []) {
    const payment = Array.isArray(b.payment) ? b.payment[0] : b.payment;
    const intent = payment?.stripe_payment_intent_id as string | undefined;
    const amount = (b.paid_cents ?? 0) - (b.refunded_cents ?? 0);
    if (!intent || amount <= 0) continue;
    try {
      await getStripe().refunds.create(
        { payment_intent: intent, amount, reason: "requested_by_customer", metadata: { booking_id: b.id } },
        { idempotencyKey: `refund-${b.id}-${b.refunded_cents ?? 0}` },
      );
      refunded += amount;
    } catch (e) {
      console.error("Refund failed", b.id, e instanceof Error ? e.message : e);
      failed += 1;
    }
  }
  return { refunded, failed };
}
