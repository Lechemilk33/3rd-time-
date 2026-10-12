import Link from "next/link";
import type { ReactNode } from "react";
import { adminData } from "@/app/admin/_lib";
import { CopyField } from "@/components/admin/client-tools";
import { PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getSiteSettings } from "@/lib/content";
import { getOrigin } from "@/lib/origin";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe";

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <Badge tone={ok ? "green" : "gray"}>{ok ? "✓ " : ""}{children}</Badge>;
}

export default async function IntegrationsPage() {
  await adminData();
  const [origin, settings] = await Promise.all([getOrigin(), getSiteSettings()]);
  const calendlyLinked = /^https:\/\/calendly\.com\//.test(settings.bookingUrl);
  const calendlyWebhook = Boolean(process.env.CALENDLY_WEBHOOK_SIGNING_KEY);
  const stripe = isStripeConfigured();
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const serviceRole = isServiceRoleConfigured();

  return (
    <>
      <PageTitle title="Integrations" description="Booking with Calendly and payments with Stripe." />
      <div className="space-y-6">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xl font-semibold">📅 Calendly</h2>
            <Status ok={calendlyLinked}>{calendlyLinked ? "Scheduler linked" : "No link yet"}</Status>
            <Status ok={calendlyWebhook}>{calendlyWebhook ? "Bookings sync on" : "Sync off"}</Status>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-ink">
            <li>
              Paste your Calendly link in{" "}
              <Link href="/admin/settings" className="font-bold text-ocean underline">
                Settings → Booking
              </Link>
              . The scheduler appears on your Book page and in the client portal (pre-filled with the client’s name and email).
            </li>
            <li>
              Optional — to see bookings in your admin and in each client’s portal, create a Calendly webhook
              (needs a paid Calendly plan) for <code className="rounded bg-sea-50 px-1">invitee.created</code> and{" "}
              <code className="rounded bg-sea-50 px-1">invitee.canceled</code> pointing to the URL below, then add its
              signing key as <code className="rounded bg-sea-50 px-1">CALENDLY_WEBHOOK_SIGNING_KEY</code> in Vercel.
            </li>
          </ol>
          <div className="mt-4 max-w-xl">
            <CopyField label="Calendly webhook URL" value={`${origin}/api/webhooks/calendly`} />
          </div>
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
            Webhooks (Calendly and Stripe) and automatic admin access for the emails in{" "}
            <code className="rounded bg-sea-50 px-1">ADMIN_EMAILS</code> need the Supabase secret key saved as{" "}
            <code className="rounded bg-sea-50 px-1">SUPABASE_SECRET_KEY</code> in Vercel.
          </p>
        </Card>
      </div>
    </>
  );
}
