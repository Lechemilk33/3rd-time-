"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasLengthChoice, lengthPrice } from "@/lib/booking";
import { formatDuration } from "@/lib/format";
import { TERMS_HREF } from "@/lib/legal";
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

  // Services with a choice of lengths are paid per length (a 60-minute walk costs more).
  const minutes = service && hasLengthChoice(service) ? Number(formString(formData, "minutes")) : null;
  const unitAmount = service ? lengthPrice(service, minutes) : null;
  if (!service || !service.allow_online_payment || !unitAmount) {
    redirect("/portal/payments?error=unavailable");
  }
  const name = minutes ? `${service.name} (${formatDuration(minutes)})` : service.name;

  const origin = await getOrigin();
  const metadata = {
    user_id: user.id,
    service_id: service.id,
    service_name: name.slice(0, 200),
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
          unit_amount: unitAmount,
          product_data: {
            name,
            ...(service.description ? { description: service.description.slice(0, 500) } : {}),
          },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    custom_text: {
      submit: {
        message: `By paying, you agree to our Terms of Service, including cancellations and refunds: ${origin}${TERMS_HREF}`,
      },
    },
    success_url: `${origin}/portal/payments?success=1`,
    cancel_url: `${origin}/portal/payments?canceled=1`,
  });

  if (!session.url) redirect("/portal/payments?error=stripe");
  redirect(session.url);
}
