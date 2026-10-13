"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { requireUser } from "@/lib/auth";
import { getBookingPolicy } from "@/lib/content";
import { BOOKING_DETAIL_SELECT, normalizeBookings, type BookingDetail } from "@/lib/booking";
import { shortDate } from "@/lib/dates";
import { formatDuration } from "@/lib/format";
import { TERMS_HREF } from "@/lib/legal";
import { getOrigin } from "@/lib/origin";
import { MAX_VISITS_PER_PAYMENT, payState, visitAmount, visitsMetadata } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Dog Walk · Tue, Oct 14 · Max & Bella" */
function visitName(b: BookingDetail) {
  const when = b.kind === "stay" && b.end_date !== b.service_date ? `${shortDate(b.service_date)} – ${shortDate(b.end_date)}` : shortDate(b.service_date);
  const pups = b.pets.map((p) => p.name).join(" & ");
  return [b.service?.name ?? b.title, when, pups].filter(Boolean).join(" · ").slice(0, 250);
}

/** The client's Stripe customer (found by email, or created), so cards they save show up next time. */
async function stripeCustomer(stripe: Stripe, user: { id: string; email: string; name: string | null; phone: string | null }) {
  if (!user.email) return undefined;
  const found = await stripe.customers.list({ email: user.email, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const created = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    phone: user.phone ?? undefined,
    metadata: { user_id: user.id },
  });
  return created.id;
}

/** Pays for the visits picked on the Payments page (`visit` inputs) with Stripe Checkout. */
export async function payForVisits(formData: FormData) {
  const user = await requireUser();
  if (!isStripeConfigured()) redirect("/portal/payments?error=not-configured");

  const ids = [...new Set(formData.getAll("visit").map(String))].filter((id) => UUID.test(id)).slice(0, MAX_VISITS_PER_PAYMENT);
  if (!ids.length) redirect("/portal/payments?error=none");

  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select(BOOKING_DETAIL_SELECT).in("id", ids).eq("user_id", user.id);
  // Prices are worked out here, never taken from the form.
  const visits = normalizeBookings(data)
    .filter((b) => payState(b) === "due")
    .sort((a, b) => a.service_date.localeCompare(b.service_date));
  if (!visits.length) redirect("/portal/payments?error=nothing-due");
  const items = visits.map((b) => ({ id: b.id, amount: visitAmount(b)!, name: visitName(b), b }));

  const [origin, policy] = await Promise.all([getOrigin(), getBookingPolicy()]);
  const description = items.length === 1 ? items[0].name : `${items.length} visits`;
  const metadata = { user_id: user.id, description: description.slice(0, 200), ...visitsMetadata(items) };

  let url: string | null = null;
  try {
    const stripe = getStripe();
    const customer = await stripeCustomer(stripe, {
      id: user.id,
      email: user.email,
      name: user.profile.full_name,
      phone: user.profile.phone,
    });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      ...(customer ? { saved_payment_method_options: { payment_method_save: "enabled" as const } } : {}),
      client_reference_id: user.id,
      line_items: items.map((i) => ({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: i.amount,
          product_data: {
            name: i.name,
            ...(i.b.duration_minutes && i.b.kind !== "stay" && i.b.kind !== "day"
              ? { description: formatDuration(i.b.duration_minutes) + (i.b.handoff === "pickup" ? " · with pick-up" : "") }
              : {}),
          },
        },
      })),
      metadata,
      payment_intent_data: {
        description,
        metadata,
        // Live payments email a receipt to this address whatever the Dashboard's email settings say.
        ...(user.email ? { receipt_email: user.email } : {}),
      },
      custom_text: {
        submit: {
          message: `Cancel online up to ${policy.cancel_cutoff_hours} hours before a visit and it’s refunded automatically. By paying, you agree to our Terms of Service: ${origin}${TERMS_HREF}`,
        },
      },
      success_url: `${origin}/portal/payments?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/portal/payments?canceled=1`,
    });
    url = session.url;
  } catch (e) {
    console.error("Checkout failed", e instanceof Error ? e.message : e);
  }
  if (!url) redirect("/portal/payments?error=stripe");
  redirect(url);
}
