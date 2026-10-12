import Link from "next/link";
import type { ReactNode } from "react";
import { adminData } from "@/app/admin/_lib";
import { CopyField } from "@/components/admin/client-tools";
import { PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getOrigin } from "@/lib/origin";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe";

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <Badge tone={ok ? "green" : "gray"}>{ok ? "✓ " : ""}{children}</Badge>;
}

export default async function IntegrationsPage() {
  const { supabase } = await adminData();
  const [origin, emailRes] = await Promise.all([getOrigin(), supabase.rpc("email_status")]);
  const stripe = isStripeConfigured();
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const serviceRole = isServiceRoleConfigured();

  return (
    <>
      <PageTitle title="Integrations" description="Booking, payments and the connections behind them." />
      <div className="space-y-6">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xl font-semibold">📅 Booking &amp; calendar</h2>
            <Status ok>Built in</Status>
            <Status ok={Boolean(emailRes.data)}>{emailRes.data ? "Emails on" : "Emails off"}</Status>
          </div>
          <p className="text-ink">
            Clients book from their portal, and every visit shows up on your{" "}
            <Link href="/admin/calendar" className="font-bold text-ocean underline">
              calendar
            </Link>
            . Set walkers’ hours, time windows, time off and reminders in{" "}
            <Link href="/admin/schedule" className="font-bold text-ocean underline">
              Schedule &amp; availability
            </Link>
            , where you can also subscribe to your bookings from Google or Apple Calendar.
          </p>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xl font-semibold">💳 Stripe</h2>
            <Status ok={stripe}>{stripe ? (isStripeTestMode() ? "Connected (test mode)" : "Connected (live)") : "Not connected"}</Status>
            <Status ok={stripeWebhook}>{stripeWebhook ? "Payment sync on" : "Sync off"}</Status>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-ink">
            <li>
              Add your Stripe secret key as <code className="rounded bg-sea-50 px-1">STRIPE_SECRET_KEY</code> in Vercel
              (start with a test key that begins with <code>sk_test_</code>).
            </li>
            <li>
              In Stripe → Developers → Webhooks, add an endpoint for{" "}
              <code className="rounded bg-sea-50 px-1">checkout.session.completed</code> using the URL below, then save
              its signing secret as <code className="rounded bg-sea-50 px-1">STRIPE_WEBHOOK_SECRET</code>.
            </li>
            <li>
              Turn on “Clients can pay online” for any service in{" "}
              <Link href="/admin/services" className="font-bold text-ocean underline">
                Services
              </Link>
              .
            </li>
          </ol>
          <div className="mt-4 max-w-xl">
            <CopyField label="Stripe webhook URL" value={`${origin}/api/webhooks/stripe`} />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xl font-semibold">🗄️ Supabase</h2>
            <Status ok>Connected</Status>
            <Status ok={serviceRole}>{serviceRole ? "Secret key set" : "Secret key missing"}</Status>
          </div>
          <p className="text-ink">
            The Stripe webhook and automatic admin access for the emails in{" "}
            <code className="rounded bg-sea-50 px-1">ADMIN_EMAILS</code> need the Supabase secret key saved as{" "}
            <code className="rounded bg-sea-50 px-1">SUPABASE_SECRET_KEY</code> in Vercel.
          </p>
        </Card>
      </div>
    </>
  );
}
