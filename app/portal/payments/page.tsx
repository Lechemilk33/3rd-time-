import { CreditCard } from "lucide-react";
import { startCheckout } from "@/app/actions/checkout";
import { PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { hasLengthChoice, lengthOptions, servicePrice } from "@/lib/booking";
import { getServices } from "@/lib/content";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Payment } from "@/lib/types";

const ERRORS: Record<string, string> = {
  "not-configured": "Online payments aren’t switched on yet.",
  unavailable: "That service can’t be paid for online right now.",
  stripe: "We couldn’t start checkout. Please try again.",
};

export default async function PaymentsPage({ searchParams }: PageProps<"/portal/payments">) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const [services, paymentsRes] = await Promise.all([
    getServices(),
    supabase.from("payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const payments = (paymentsRes.data ?? []) as Payment[];
  const payable = services.filter(
    (s) =>
      s.allow_online_payment &&
      !s.id.startsWith("default-") &&
      (hasLengthChoice(s) ? s.duration_options.some((o) => o.price_cents) : s.price_cents),
  );
  const stripeReady = isStripeConfigured();
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageTitle title="Payments" description="Pay for walks and visits securely with Stripe." />
      <div className="space-y-4">
        {params.success ? (
          <Notice tone="success" title="Payment received — thank you! 🐾">
            Your receipt is on its way to your inbox. It can take a moment to show up below.
          </Notice>
        ) : null}
        {params.canceled ? <Notice>Checkout was canceled. No charge was made.</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      <section className="mt-6">
        <h2 className="mb-4 text-xl font-semibold">Pay for a service</h2>
        {!stripeReady || payable.length === 0 ? (
          <Notice tone="info" title="Online payments are coming soon">
            We’ll let you know when you can pay right here in the portal.
          </Notice>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {payable.map((service) => (
              <li key={service.id}>
                <Card className="flex h-full flex-col">
                  <h3 className="text-lg font-semibold">{service.name}</h3>
                  <p className="mt-1 font-display text-2xl font-semibold text-ocean">
                    {hasLengthChoice(service) ? servicePrice({ ...service, price_label: null, price_unit: "flat" }) : formatMoney(service.price_cents)}{" "}
                    <span className="font-sans text-sm font-bold text-ink-600">{service.price_label}</span>
                  </p>
                  {service.duration_minutes && !hasLengthChoice(service) ? (
                    <p className="text-sm text-ink-600">{formatDuration(service.duration_minutes)}</p>
                  ) : null}
                  <form action={startCheckout} className="mt-auto flex flex-wrap items-end gap-2 pt-5">
                    <input type="hidden" name="service_id" value={service.id} />
                    {hasLengthChoice(service) ? (
                      <label className="w-full">
                        <span className="mb-1 block text-xs font-bold text-ink-600">Length</span>
                        <Select name="minutes">
                          {lengthOptions(service)
                            .filter((o) => o.price_cents)
                            .map((o) => (
                              <option key={o.minutes} value={o.minutes}>
                                {formatDuration(o.minutes)} · {formatMoney(o.price_cents)}
                              </option>
                            ))}
                        </Select>
                      </label>
                    ) : null}
                    <label className="w-20">
                      <span className="mb-1 block text-xs font-bold text-ink-600">Qty</span>
                      <Select name="quantity" defaultValue="1">
                        {Array.from({ length: 10 }, (_, i) => (
                          <option key={i + 1}>{i + 1}</option>
                        ))}
                      </Select>
                    </label>
                    <SubmitButton className="flex-1" pendingText="Opening…">
                      <CreditCard className="size-4" aria-hidden /> Pay
                    </SubmitButton>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">Payment history</h2>
        <Card className="p-0 sm:p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-ink-600">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {p.description}
                      {p.quantity > 1 ? ` × ${p.quantity}` : ""}
                    </p>
                    <p className="text-sm text-ink-600">{formatDate(p.created_at)}</p>
                  </div>
                  <Badge tone={p.status === "paid" ? "green" : p.status === "failed" ? "red" : "gray"}>{p.status}</Badge>
                  <span className="font-bold">{formatMoney(p.amount_cents, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
