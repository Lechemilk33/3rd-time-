import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Stripe webhook (Stripe Dashboard → Developers → Webhooks → https://<site>/api/webhooks/stripe).
 * The raw body and signature go straight to the database, which checks the signature with the
 * signing secret kept in Vault and records payments and refunds (public.stripe_webhook).
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!signature || payload.length > 500_000) return Response.json({ error: "Bad request" }, { status: 400 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("stripe_webhook", { p_payload: payload, p_signature: signature });
  if (error) {
    console.error("Stripe webhook failed", error.message);
    // Stripe retries on errors, for up to three days.
    return Response.json({ error: "Could not record the event" }, { status: 500 });
  }

  switch (data) {
    case "ok":
    case "ignored":
      return Response.json({ received: true });
    case "not configured":
      return Response.json({ error: "Webhook signing secret isn't set up" }, { status: 503 });
    default:
      return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
}
