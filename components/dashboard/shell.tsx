import { cache, Suspense, type ReactNode } from "react";
import { Logo } from "@/components/site/logo";
import { MobileTabs, SidebarNav } from "@/components/dashboard/nav";
import { MobileUserMenu, UserMenu } from "@/components/dashboard/user-menu";
import { EmailConfirmed } from "@/components/portal/email-confirmed";
import { getSiteSettings } from "@/lib/content";
import { isSupabaseConfigured } from "@/lib/env";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/** Things waiting on the team, shown as badges in the admin nav. RLS limits these to admins. */
const adminCounts = cache(async (): Promise<Record<string, number>> => {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const [requests, messages] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false),
  ]);
  return { "/admin/calendar": requests.count ?? 0, "/admin/messages": messages.count ?? 0 };
});

/** Portal links that don't apply yet: Payments, until there's a way to pay or a payment to show. */
const portalHidden = cache(async (): Promise<string[]> => {
  if (!isSupabaseConfigured() || isStripeConfigured()) return [];
  const supabase = await createClient();
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true });
  return count ? [] : ["/portal/payments"];
});

async function Sidebar({ area }: { area: "portal" | "admin" }) {
  return area === "admin" ? (
    <SidebarNav area={area} counts={await adminCounts()} />
  ) : (
    <SidebarNav area={area} hidden={await portalHidden()} />
  );
}

async function Tabs({ area }: { area: "portal" | "admin" }) {
  return area === "admin" ? (
    <MobileTabs area={area} counts={await adminCounts()} />
  ) : (
    <MobileTabs area={area} hidden={await portalHidden()} />
  );
}

export async function DashboardShell({ area, children }: { area: "portal" | "admin"; children: ReactNode }) {
  const settings = await getSiteSettings();
  const home = area === "admin" ? "/admin" : "/portal";

  return (
    <div className="flex-1 bg-sand/60 lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh self-start flex-col overflow-y-auto border-r border-ink-100 bg-white p-5 lg:flex">
        <Logo name={settings.businessName} logoUrl={settings.logoUrl} href={home} />
        {/* Clients just see their space; the team gets a reminder they're behind the scenes. */}
        {area === "admin" ? (
          <p className="mt-3 mb-6 inline-flex w-max rounded-full bg-sun-100 px-3 py-1 text-xs font-extrabold tracking-wide text-ink uppercase">
            Admin
          </p>
        ) : (
          <div className="mb-6" />
        )}
        <Suspense fallback={null}>
          <Sidebar area={area} />
        </Suspense>
        <div className="mt-auto pt-6">
          <Suspense fallback={null}>
            <UserMenu area={area} />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 px-4 pt-3 backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Logo name={settings.businessName} logoUrl={settings.logoUrl} href={home} />
            <Suspense fallback={<span className="size-10" />}>
              <MobileUserMenu area={area} />
            </Suspense>
          </div>
          <Suspense fallback={<div className="h-12" />}>
            <Tabs area={area} />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
          {area === "portal" ? (
            <Suspense fallback={null}>
              <EmailConfirmed />
            </Suspense>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
        {description ? <div className="mt-2 max-w-2xl text-ink-600">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function LoadingPanel() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-64 animate-pulse rounded-2xl bg-ink-100" />
      <div className="h-5 w-96 max-w-full animate-pulse rounded-xl bg-ink-100" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-3xl bg-white" />
        <div className="h-40 animate-pulse rounded-3xl bg-white" />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-sea-200 bg-white px-6 py-12 text-center">
      {icon ? <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-sea-100 text-ocean">{icon}</div> : null}
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-md text-ink-600">{children}</div> : null}
    </div>
  );
}
