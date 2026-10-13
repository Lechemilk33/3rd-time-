import { CreditCard, ExternalLink } from "lucide-react";
import Link from "next/link";
import { adminData } from "@/app/admin/_lib";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { PaymentBadge } from "@/components/portal/payment-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { BOOKING_DETAIL_SELECT, clientName, dateSpanLabel, normalizeBookings } from "@/lib/booking";
import { todayIn } from "@/lib/dates";
import { BUSINESS_TIMEZONE } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { payState, visitAmount } from "@/lib/payments";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe";
import type { Payment } from "@/lib/types";

export default async function AdminPaymentsPage() {
  const { supabase } = await adminData();
  const today = todayIn(BUSINESS_TIMEZONE);
  const [{ data }, clientsRes, unpaidRes] = await Promise.all([
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("id, full_name, email"),
    // Visits that have happened and haven't been paid yet.
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .in("status", ["scheduled", "completed"])
      .is("paid_at", null)
      .lt("service_date", today)
      .order("service_date")
      .limit(300),
  ]);
  const payments = (data ?? []) as Payment[];
  const names = new Map((clientsRes.data ?? []).map((c) => [c.id as string, (c.full_name || c.email) as string]));
  const received = payments.filter((p) => p.status === "paid" || p.status === "partially refunded" || p.status === "refunded");
  const total = received.reduce((sum, p) => sum + p.amount_cents - p.refunded_cents, 0);
  const test = isStripeTestMode();
  const dashboard = test ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";

  // Who owes for past visits, biggest first.
  const owed = new Map<string, { name: string; visits: number; cents: number; oldest: string }>();
  for (const b of normalizeBookings(unpaidRes.data)) {
    const state = payState(b);
    if ((state !== "due" && state !== "offline") || !b.user_id) continue;
    const row = owed.get(b.user_id) ?? { name: clientName(b), visits: 0, cents: 0, oldest: dateSpanLabel(b) };
    row.visits += 1;
    row.cents += visitAmount(b) ?? 0;
    owed.set(b.user_id, row);
  }
  const owing = [...owed.entries()].sort((a, b) => b[1].cents - a[1].cents);
  const owingTotal = owing.reduce((sum, [, r]) => sum + r.cents, 0);

  return (
    <>
      <PageTitle
        title="Payments"
        description="What clients have paid online, and what’s still owed for past visits."
        actions={
          isStripeConfigured() ? (
            <ButtonLink href={`${dashboard}/payments`} target="_blank" rel="noreferrer" variant="outline">
              Open Stripe <ExternalLink className="size-4" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />
      {!isStripeConfigured() ? (
        <Notice tone="warning" title="Online payments aren’t on yet" className="mb-6">
          See <Link href="/admin/integrations" className="font-bold underline">Integrations</Link> to connect Stripe.
        </Notice>
      ) : test ? (
        <Notice tone="info" title="Test mode" className="mb-6">
          Stripe is in test mode: use card 4242 4242 4242 4242 to try a payment. No real money moves.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Online payments</h2>
          {payments.length === 0 ? (
            <EmptyState icon={<CreditCard className="size-7" />} title="No payments yet">
              When clients pay from their portal, they show up here.
            </EmptyState>
          ) : (
            <>
              <p className="mb-3 font-bold text-ink-600">
                {received.length} payment{received.length === 1 ? "" : "s"} · <span className="text-ink">{formatMoney(total)}</span> after refunds
              </p>
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-ink-100">
                  {payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{p.description}</p>
                        <p className="text-sm text-ink-600">
                          {p.user_id ? (
                            <Link href={`/admin/clients/${p.user_id}`} className="text-ocean hover:underline">
                              {names.get(p.user_id) ?? p.customer_email}
                            </Link>
                          ) : (
                            p.customer_email
                          )}{" "}
                          · {formatDateTime(p.created_at)}
                          {p.refunded_cents ? ` · ${formatMoney(p.refunded_cents, p.currency)} refunded` : ""}
                        </p>
                      </div>
                      <PaymentBadge status={p.status} />
                      <span className="font-bold">{formatMoney(p.amount_cents, p.currency)}</span>
                      {p.stripe_payment_intent_id ? (
                        <a
                          href={`${dashboard}/payments/${p.stripe_payment_intent_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="grid size-9 place-items-center rounded-full text-ink-400 hover:bg-sea-50 hover:text-ocean"
                          aria-label="Open in Stripe"
                        >
                          <ExternalLink className="size-4" aria-hidden />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">Still owed</h2>
          <Card>
            {owing.length ? (
              <>
                <p className="mb-3 text-sm text-ink-600">
                  {formatMoney(owingTotal)} for past visits. Clients can pay online from their portal, or mark cash payments in
                  the calendar.
                </p>
                <ul className="divide-y divide-ink-100">
                  {owing.map(([id, r]) => (
                    <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <Link href={`/admin/clients/${id}`} className="block truncate font-bold text-ocean hover:underline">
                          {r.name}
                        </Link>
                        <span className="text-sm text-ink-600">
                          {r.visits} visit{r.visits === 1 ? "" : "s"} · since {r.oldest}
                        </span>
                      </span>
                      <span className="font-bold">{formatMoney(r.cents)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-ink-600">Nothing owed for past visits. 🎉</p>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
