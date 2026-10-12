import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeTestMode() {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
