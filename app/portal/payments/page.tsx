import { PartyPopper } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/components/dashboard/shell";
import { PayVisits, type PayableVisit } from "@/components/portal/pay-visits";
import { PaymentBadge } from "@/components/portal/payment-badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { BOOKING_DETAIL_SELECT, dateSpanLabel, normalizeBookings } from "@/lib/booking";
import { getBookingPolicy } from "@/lib/content";
import { todayIn } from "@/lib/dates";
import { BUSINESS_TIMEZONE } from "@/lib/env";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";
import { TERMS_HREF } from "@/lib/legal";
import { MAX_VISITS_PER_PAYMENT, payState, visitAmount, visitIdsFromMetadata } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Payment } from "@/lib/types";

const ERRORS: Record<string, string> = {
  "not-configured": "Online payments aren’t switched on yet.",
  none: "Pick at least one visit to pay for.",
  "nothing-due": "Those visits are already paid, or can’t be paid online.",
  stripe: "We couldn’t open checkout. Please try again in a moment.",
};

/** Back from Stripe: what was just paid, straight from Stripe (the webhook may still be on its way). */
async function checkoutResult(sessionId: string, userId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !isStripeConfigured()) return null;
  try {
    const s = await getStripe().checkout.sessions.retrieve(sessionId);
    if (s.client_reference_id !== userId) return null;
    return {
      status: s.payment_status,
      amount: s.amount_total ?? 0,
      email: s.customer_details?.email ?? null,
      visitIds: visitIdsFromMetadata(s.metadata),
    };
  } catch {
    return null;
  }
}

export default async function PaymentsPage({ searchParams }: PageProps<"/portal/payments">) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const [bookingsRes, paymentsRes, policy, result] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("user_id", user.id)
      .in("status", ["scheduled", "completed"])
      .is("paid_at", null)
      .order("service_date")
      .limit(200),
    supabase.from("payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    getBookingPolicy(),
    typeof params.paid === "string" ? checkoutResult(params.paid, user.id) : Promise.resolve(null),
  ]);
  const today = todayIn(BUSINESS_TIMEZONE);
  const justPaid = new Set(result?.status === "paid" ? result.visitIds : []);
  const payments = (paymentsRes.data ?? []) as Payment[];
  const unpaid = normalizeBookings(bookingsRes.data).filter((b) => !justPaid.has(b.id));
  const due: PayableVisit[] = unpaid
    .filter((b) => payState(b) === "due")
    .map((b) => ({
      id: b.id,
      title: [b.service?.name ?? b.title, b.pets.map((p) => p.name).join(" & ")].filter(Boolean).join(" · "),
      detail: [
        dateSpanLabel(b),
        b.kind === "window" || b.kind === "time" ? formatDuration(b.duration_minutes) : "",
        b.handoff === "pickup" ? "with pick-up" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      amount: visitAmount(b) ?? 0,
      past: b.end_date < today,
    }));
  const offline = unpaid.filter((b) => payState(b) === "offline").length;
  const stripeReady = isStripeConfigured();
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageTitle title="Payments" description="Pay for your visits securely online." />
      <div className="space-y-4">
        {result?.status === "paid" ? (
          <Notice tone="success" title={`Payment received: ${formatMoney(result.amount)}. Thank you! 🐾`}>
            {result.visitIds.length === 1 ? "Your visit is" : `${result.visitIds.length} visits are`} paid.
            {result.email ? ` Your receipt is on its way to ${result.email}.` : ""}
          </Notice>
        ) : result ? (
          <Notice tone="info" title="Your payment is processing">
            Some payment methods take a few days to clear. We’ll mark your visits paid as soon as it does.
          </Notice>
        ) : null}
        {params.canceled ? <Notice>Checkout was canceled. Nothing was charged.</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 text-xl font-semibold">To pay</h2>
        {!stripeReady ? (
          <p className="text-ink-600">Online payments aren’t switched on yet. Pay us directly for now and we’ll keep track.</p>
        ) : due.length ? (
          <>
            <p className="mb-4 text-sm text-ink-600">
              Pay for upcoming visits now or after they happen, whichever you like. Cancel online up to{" "}
              {policy.cancel_cutoff_hours} hours before a visit and it’s refunded automatically (see our{" "}
              <Link href={TERMS_HREF} className="font-bold text-ocean underline">
                Terms
              </Link>
              ).
            </p>
            <PayVisits visits={due} max={MAX_VISITS_PER_PAYMENT} />
          </>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <PartyPopper className="size-5" aria-hidden />
            </span>
            <p className="font-bold">You’re all paid up!</p>
          </div>
        )}
        {offline ? (
          <p className="mt-4 text-sm text-ink-600">
            {offline} visit{offline === 1 ? " is" : "s are"} paid to us directly rather than online.
          </p>
        ) : null}
      </Card>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Payment history</h2>
        <Card className="p-0 sm:p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-ink-600">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{p.description}</p>
                    <p className="text-sm text-ink-600">
                      {formatDate(p.created_at)}
                      {p.refunded_cents ? ` · ${formatMoney(p.refunded_cents, p.currency)} refunded` : ""}
                    </p>
                  </div>
                  <PaymentBadge status={p.status} />
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

