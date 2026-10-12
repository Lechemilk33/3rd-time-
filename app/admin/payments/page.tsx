import { CreditCard } from "lucide-react";
import Link from "next/link";
import { adminData } from "@/app/admin/_lib";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { formatDateTime, formatMoney } from "@/lib/format";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe";
import type { Payment } from "@/lib/types";

export default async function AdminPaymentsPage() {
  const { supabase } = await adminData();
  const [{ data }, clientsRes] = await Promise.all([
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const payments = (data ?? []) as Payment[];
  const names = new Map((clientsRes.data ?? []).map((c) => [c.id as string, (c.full_name || c.email) as string]));
  const paid = payments.filter((p) => p.status === "paid");
  const total = paid.reduce((sum, p) => sum + p.amount_cents, 0);
  const dashboard = isStripeTestMode() ? "https://dashboard.stripe.com/test/payments" : "https://dashboard.stripe.com/payments";

  return (
    <>
      <PageTitle
        title="Payments"
        description="Online payments made through the client portal."
        actions={
          isStripeConfigured() ? (
            <ButtonLink href={dashboard} target="_blank" rel="noreferrer" variant="outline">
              Open Stripe
            </ButtonLink>
          ) : null
        }
      />
      {!isStripeConfigured() ? (
        <Notice tone="warning" title="Stripe isn’t connected yet" className="mb-6">
          See <Link href="/admin/integrations" className="font-bold underline">Integrations</Link> to turn on online payments.
        </Notice>
      ) : isStripeTestMode() ? (
        <Notice tone="info" title="Test mode" className="mb-6">
          Stripe is in test mode — use card 4242 4242 4242 4242 to try a payment. No real money moves.
        </Notice>
      ) : null}
      {payments.length === 0 ? (
        <EmptyState icon={<CreditCard className="size-7" />} title="No payments yet" />
      ) : (
        <>
          <p className="mb-4 font-bold text-ink-600">
            {paid.length} paid · <span className="text-ink">{formatMoney(total)}</span> total
          </p>
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-ink-100">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {p.description}
                      {p.quantity > 1 ? ` × ${p.quantity}` : ""}
                    </p>
                    <p className="text-sm text-ink-600">
                      {p.user_id ? (
                        <Link href={`/admin/clients/${p.user_id}`} className="text-ocean hover:underline">
                          {names.get(p.user_id) ?? p.customer_email}
                        </Link>
                      ) : (
                        p.customer_email
                      )}{" "}
                      · {formatDateTime(p.created_at)}
                    </p>
                  </div>
                  <Badge tone={p.status === "paid" ? "green" : p.status === "failed" ? "red" : "gray"}>{p.status}</Badge>
                  <span className="font-bold">{formatMoney(p.amount_cents, p.currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
