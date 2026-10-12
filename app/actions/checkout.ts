"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Service } from "@/lib/types";
import { formString } from "@/lib/utils";

export async function startCheckout(formData: FormData) {
  const user = await requireUser();
  if (!isStripeConfigured()) redirect("/portal/payments?error=not-configured");

  const serviceId = formString(formData, "service_id");
  const quantity = Math.min(20, Math.max(1, Math.floor(Number(formString(formData, "quantity") ?? 1)) || 1));
  if (!serviceId) redirect("/portal/payments?error=unavailable");

  const supabase = await createClient();
  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("active", true)
    .maybeSingle<Service>();

  if (!service || !service.allow_online_payment || !service.price_cents) {
    redirect("/portal/payments?error=unavailable");
  }

  const origin = await getOrigin();
  const metadata = {
    user_id: user.id,
    service_id: service.id,
    service_name: service.name.slice(0, 200),
    quantity: String(quantity),
  };

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email || undefined,
    client_reference_id: user.id,
    line_items: [
      {
        quantity,
        price_data: {
          currency: "usd",
          unit_amount: service.price_cents,
          product_data: {
            name: service.name,
            ...(service.description ? { description: service.description.slice(0, 500) } : {}),
          },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/portal/payments?success=1`,
    cancel_url: `${origin}/portal/payments?canceled=1`,
  });

  if (!session.url) redirect("/portal/payments?error=stripe");
  redirect(session.url);
}
