import Link from "next/link";
import type { ReactNode } from "react";
import { connectInstagram, disconnectInstagram } from "@/app/admin/_actions/instagram";
import { adminData } from "@/app/admin/_lib";
import { CopyField } from "@/components/admin/client-tools";
import { InstagramTokenForm } from "@/components/admin/instagram-token-form";
import { PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { InstagramIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Photo } from "@/components/ui/photo";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/format";
import { getInstagramFeed, isInstagramLoginConfigured } from "@/lib/instagram";
import { getOrigin } from "@/lib/origin";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe";

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <Badge tone={ok ? "green" : "gray"}>{ok ? "✓ " : ""}{children}</Badge>;
}

export default async function IntegrationsPage({ searchParams }: PageProps<"/admin/integrations">) {
  const [{ supabase }, sp] = await Promise.all([adminData(), searchParams]);
  const [origin, emailRes, instagramRes] = await Promise.all([
    getOrigin(),
    supabase.rpc("email_status"),
    supabase.rpc("instagram_status"),
  ]);
  const stripe = isStripeConfigured();
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const serviceRole = isServiceRoleConfigured();

  return (
    <>
      <PageTitle
        title="Integrations"
        description="Booking, payments, Instagram and the connections behind them. The setup steps below are one-time technical tasks — if someone built the site for you, send them this page."
      />
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
          <p className="text-ink">
            {stripe
              ? "Clients can pay online for any service where you’ve turned it on."
              : "Not set up yet — clients pay you the way they do today. Online payments are optional."}
          </p>
          <details className="mt-3" open={!stripe}>
            <summary className="cursor-pointer text-sm font-bold text-ocean">Setup steps (for whoever manages the website)</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink">
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
          </details>
        </Card>

        <InstagramCard
          status={instagramRes.data}
          missingMigration={instagramRes.error?.code === "PGRST202"}
          serviceRole={serviceRole}
          redirectUri={`${origin}/api/instagram/callback`}
          result={typeof sp.instagram === "string" ? sp.instagram : null}
        />

        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-xl font-semibold">🗄️ Supabase</h2>
            <Status ok>Connected</Status>
            <Status ok={serviceRole}>{serviceRole ? "Secret key set" : "Secret key missing"}</Status>
          </div>
          <p className="text-ink">
            {serviceRole ? "Everything’s connected — nothing to do here." : "One technical step is missing (for whoever manages the website):"}
          </p>
          <p className="mt-2 text-sm text-ink-600">
            The Stripe webhook, the Instagram feed and automatic admin access for the emails in{" "}
            <code className="rounded bg-sea-50 px-1">ADMIN_EMAILS</code> need the Supabase secret key saved as{" "}
            <code className="rounded bg-sea-50 px-1">SUPABASE_SECRET_KEY</code> in Vercel.
          </p>
        </Card>
      </div>
    </>
  );
}

const CONNECT_RESULTS: Record<string, { tone: "success" | "info" | "warning" | "error"; text: string }> = {
  connected: { tone: "success", text: "Instagram is connected! Your latest posts are on the site now." },
  canceled: { tone: "info", text: "Instagram wasn’t connected — the request was canceled on Instagram." },
  expired: { tone: "warning", text: "That connection attempt timed out. Click “Connect Instagram” to try again." },
  failed: {
    tone: "error",
    text: "Instagram didn’t finish connecting. Check that the account is a professional account and has accepted the tester invite (steps 1 and 5 below), then try again.",
  },
  "not-set-up": { tone: "error", text: "Run the Instagram database update first (step 2 below), then connect again." },
};

type InstagramStatus = {
  connected?: boolean;
  username?: string;
  expires_at?: string | null;
  refreshed_at?: string;
} | null;

async function InstagramCard({
  status,
  missingMigration,
  serviceRole,
  redirectUri,
  result,
}: {
  status: InstagramStatus;
  missingMigration: boolean;
  serviceRole: boolean;
  redirectUri: string;
  result: string | null;
}) {
  const connected = Boolean(status?.connected);
  const canConnect = isInstagramLoginConfigured() && serviceRole && !missingMigration;
  const feed = connected ? await getInstagramFeed() : null;
  const notice = result ? CONNECT_RESULTS[result] : undefined;
  const code = "rounded bg-sea-50 px-1";

  return (
    <Card id="instagram" className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-xl font-semibold">📸 Instagram feed</h2>
        <Status ok={connected}>{connected ? `Connected as @${status?.username}` : "Not connected"}</Status>
      </div>
      {notice ? (
        <Notice tone={notice.tone} className="mb-3">
          {notice.text}
        </Notice>
      ) : null}
      <p className="text-ink">
        {connected
          ? "Your latest posts show in the “Instagram feed” section of your website and update about every hour. The connection renews itself, so there’s nothing to do."
          : "The “Instagram feed” section on your home page shows a “Follow us on Instagram” card until your account is connected. Once it is, your latest posts appear there automatically."}
      </p>

      {feed?.status === "ok" && feed.posts.length ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Latest posts on your site">
          {feed.posts.slice(0, 8).map((post) => (
            <li key={post.id}>
              <Photo src={post.image} alt="" className="size-14 rounded-xl bg-sea-100" />
            </li>
          ))}
        </ul>
      ) : null}
      {feed?.status === "ok" && !feed.posts.length ? (
        <Notice className="mt-4">Connected, but there are no posts to show yet. Visitors see the “Follow us” card until there are.</Notice>
      ) : null}
      {feed?.status === "error" ? (
        <Notice tone="warning" className="mt-4" title="Couldn’t load your posts just now">
          Instagram said: “{feed.message}” Visitors see the “Follow us” card meanwhile. If this keeps happening, reconnect below.
        </Notice>
      ) : null}
      {!serviceRole || missingMigration ? (
        <Notice tone="warning" className="mt-4" title="One technical step first (for whoever manages the website)">
          {!serviceRole ? (
            <>
              Save the Supabase secret key as <code className={code}>SUPABASE_SECRET_KEY</code> in Vercel.{" "}
            </>
          ) : null}
          {missingMigration ? (
            <>
              Run <code className={code}>supabase/migrations/20261013100000_instagram_feed.sql</code> in the Supabase SQL editor.
            </>
          ) : null}
        </Notice>
      ) : null}

      {connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canConnect ? (
            <form action={connectInstagram}>
              <SubmitButton size="sm" variant="outline" pendingText="Opening Instagram…">
                Reconnect
              </SubmitButton>
            </form>
          ) : null}
          <form action={disconnectInstagram}>
            <ConfirmSubmit
              message="Disconnect Instagram? Your website will show a “Follow us on Instagram” card instead of your posts."
              className={buttonClass("danger", "sm")}
            >
              Disconnect
            </ConfirmSubmit>
          </form>
          {status?.refreshed_at ? (
            <span className="text-sm text-ink-600">
              Renewed {formatDate(status.refreshed_at)}
              {status.expires_at ? ` · good until ${formatDate(status.expires_at)}` : ""}
            </span>
          ) : null}
        </div>
      ) : canConnect ? (
        <div className="mt-4">
          <form action={connectInstagram}>
            <SubmitButton pendingText="Opening Instagram…">
              <InstagramIcon className="size-5" />
              Connect Instagram
            </SubmitButton>
          </form>
          <p className="mt-2 text-sm text-ink-600">You’ll log in to Instagram and tap “Allow”. That’s it.</p>
        </div>
      ) : null}

      <details className="mt-4" open={!connected && !canConnect}>
        <summary className="cursor-pointer text-sm font-bold text-ocean">Setup steps (for whoever manages the website)</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink">
          <li>
            The Instagram account must be a professional account (business or creator; it’s free). In the Instagram app:
            Settings → Account type and tools → Switch to professional account.
          </li>
          <li>
            Run <code className={code}>supabase/migrations/20261013100000_instagram_feed.sql</code> in the Supabase SQL
            editor and make sure <code className={code}>SUPABASE_SECRET_KEY</code> is set in Vercel.
          </li>
          <li>
            At{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="font-bold text-ocean underline">
              developers.facebook.com
            </a>
            , create an app with the use case “Manage messaging &amp; content on Instagram”. Under Instagram → API setup
            with Instagram login, copy the Instagram app ID and app secret into Vercel as{" "}
            <code className={code}>INSTAGRAM_APP_ID</code> and <code className={code}>INSTAGRAM_APP_SECRET</code>, then
            redeploy.
          </li>
          <li>On the same page, under “Set up Instagram business login”, add the redirect URL below.</li>
          <li>
            In App roles → Roles, add the Instagram account as an Instagram Tester. Then, logged in as that account, accept
            the invite in Instagram under{" "}
            <a
              href="https://www.instagram.com/accounts/manage_access/"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-ocean underline"
            >
              Settings → Apps and websites → Tester invites
            </a>
            .
          </li>
          <li>Click “Connect Instagram” above. The connection renews itself from then on.</li>
        </ol>
        <div className="mt-4 max-w-xl">
          <CopyField label="Instagram redirect URL" value={redirectUri} />
        </div>
        {serviceRole && !missingMigration ? (
          <div className="mt-6 border-t border-ink-100 pt-5">
            <p className="mb-3 text-sm text-ink-600">
              <span className="font-bold text-ink">Rather not put the app secret in Vercel?</span> Create the app (step 3)
              and add the tester (step 5), then generate a token on the app’s “API setup with Instagram login” page
              (Generate access tokens → Add account) and paste it here instead of clicking “Connect Instagram”.
            </p>
            <InstagramTokenForm />
          </div>
        ) : null}
      </details>
    </Card>
  );
}
