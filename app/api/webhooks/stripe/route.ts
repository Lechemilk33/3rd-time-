import type Stripe from "stripe";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Records completed Stripe Checkout payments. Point a Stripe webhook at /api/webhooks/stripe. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured() || !isServiceRoleConfigured()) {
    return Response.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object;
    const meta = session.metadata ?? {};
    const userId = session.client_reference_id ?? meta.user_id ?? null;
    const row = {
      user_id: userId && UUID.test(userId) ? userId : null,
      service_id: meta.service_id && UUID.test(meta.service_id) ? meta.service_id : null,
      description: meta.service_name || "Online payment",
      quantity: Number(meta.quantity) || 1,
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      status: event.type === "checkout.session.async_payment_failed" ? "failed" : session.payment_status,
      customer_email: session.customer_details?.email ?? session.customer_email ?? null,
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
    };

    const supabase = createServiceClient();
    let { error } = await supabase.from("payments").upsert(row, { onConflict: "stripe_session_id" });
    if (error?.code === "23503") {
      // The client or service was deleted; keep the payment record anyway.
      ({ error } = await supabase
        .from("payments")
        .upsert({ ...row, user_id: null, service_id: null }, { onConflict: "stripe_session_id" }));
    }
    if (error) {
      console.error("Failed to record payment", error.message);
      return Response.json({ error: "Database error" }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
