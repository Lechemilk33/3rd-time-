import { CalendarDays, ClipboardList, Inbox, PawPrint, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminData } from "@/app/admin/_lib";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import { BookingList } from "@/components/portal/booking-list";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSiteSettings } from "@/lib/content";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe";
import type { Booking } from "@/lib/types";

export default async function AdminHome() {
  const { admin, supabase, seeded } = await adminData();
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [clients, pets, intake, messages, upcoming, settings] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client"),
    supabase.from("pets").select("id", { count: "exact", head: true }),
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false),
    supabase
      .from("bookings")
      .select("*")
      .eq("status", "scheduled")
      .gte("start_time", now.toISOString())
      .lte("start_time", weekOut.toISOString())
      .order("start_time")
      .limit(8),
    getSiteSettings(),
  ]);

  const stats = [
    { label: "Clients", value: clients.count ?? 0, href: "/admin/clients", icon: <Users className="size-5" /> },
    { label: "Pups", value: pets.count ?? 0, href: "/admin/clients", icon: <PawPrint className="size-5" /> },
    { label: "Intake forms to review", value: intake.count ?? 0, href: "/admin/clients", icon: <ClipboardList className="size-5" /> },
    { label: "New messages", value: messages.count ?? 0, href: "/admin/messages", icon: <Inbox className="size-5" /> },
  ];

  const setup = [
    { done: seeded, label: "Load your editable website content", href: "/admin" },
    { done: Boolean(settings.phone || settings.email), label: "Add your phone or email", href: "/admin/settings" },
    { done: /^https:\/\/calendly\.com\//.test(settings.bookingUrl), label: "Connect your Calendly link", href: "/admin/settings" },
    { done: isStripeConfigured(), label: "Connect Stripe for online payments", href: "/admin/integrations" },
    { done: isServiceRoleConfigured(), label: "Add the Supabase secret key (for webhooks)", href: "/admin/integrations" },
  ];

  return (
    <>
      <PageTitle
        title={`Hi ${(admin.profile.full_name ?? "").split(" ")[0] || "there"}! 🐾`}
        description="Here’s what’s happening with Waiting for Paws."
        actions={
          <ButtonLink href="/" variant="outline" target="_blank">
            View website
          </ButtonLink>
        }
      />

      {!seeded ? (
        <div className="mb-8">
          <SeedPanel />
        </div>
      ) : null}

      <ul className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="block rounded-3xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="grid size-10 place-items-center rounded-2xl bg-sea-100 text-ocean">{s.icon}</span>
              <p className="mt-3 font-display text-3xl font-semibold">{s.value}</p>
              <p className="text-sm font-bold text-ink-600">{s.label}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <CalendarDays className="size-5 text-ocean" aria-hidden /> Next 7 days
            </h2>
            <Link href="/admin/bookings" className="text-sm font-bold text-ocean hover:underline">
              All bookings
            </Link>
          </div>
          <BookingList bookings={(upcoming.data ?? []) as Booking[]} empty="Nothing scheduled this week." />
        </Card>
        <Card>
          <h2 className="mb-3 text-xl font-semibold">Setup checklist</h2>
          <ul className="space-y-2">
            {setup.map((item) => (
              <SetupItem key={item.label} done={item.done} href={item.href}>
                {item.label}
              </SetupItem>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Quick edits</h2>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/pages" variant="outline" size="sm">Edit pages</ButtonLink>
          <ButtonLink href="/admin/gallery" variant="outline" size="sm">Upload photos</ButtonLink>
          <ButtonLink href="/admin/services" variant="outline" size="sm">Update prices</ButtonLink>
          <ButtonLink href="/admin/settings" variant="outline" size="sm">Change colors</ButtonLink>
          <ButtonLink href="/admin/intake-form" variant="outline" size="sm">Edit intake form</ButtonLink>
        </div>
      </Card>
    </>
  );
}

function SetupItem({ done, href, children }: { done: boolean; href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl p-2 hover:bg-sea-50">
        <span
          className={done ? "grid size-6 place-items-center rounded-full bg-emerald-500 text-xs text-white" : "size-6 rounded-full border-2 border-ink-200"}
          aria-label={done ? "Done" : "To do"}
        >
          {done ? "✓" : null}
        </span>
        <span className={done ? "text-ink-600 line-through" : "font-bold"}>{children}</span>
      </Link>
    </li>
  );
}
