import { CalendarDays, ClipboardList, Hourglass, Inbox, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminData } from "@/app/admin/_lib";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import { BookingList } from "@/components/portal/booking-list";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BOOKING_DETAIL_SELECT, normalizeBookings } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { getSiteSettings } from "@/lib/content";
import { addDays, longDate, todayIn } from "@/lib/dates";
import { isStripeConfigured } from "@/lib/stripe";

export default async function AdminHome() {
  const { admin, supabase, seeded } = await adminData();
  const config = await getBookingConfig(supabase);
  const tz = config.settings.timezone;
  const today = todayIn(tz);

  const [clients, intake, messages, todayRes, tomorrowRes, requestsRes, capacityRes, emailRes, settings] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client"),
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("service_date", today)
      .in("status", ["scheduled", "requested", "completed"])
      .order("start_time"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("service_date", addDays(today, 1))
      .in("status", ["scheduled", "requested"]),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("status", "requested")
      .gte("service_date", today)
      .order("start_time")
      .limit(6),
    supabase.from("walker_availability").select("walker_id", { count: "exact", head: true }).gt("capacity", 0),
    supabase.rpc("email_status"),
    getSiteSettings(),
  ]);

  const todays = normalizeBookings(todayRes.data);
  const requests = normalizeBookings(requestsRes.data);
  const calendarHref = (b: { id: string; service_date: string }) => `/admin/calendar?view=day&date=${b.service_date}&b=${b.id}`;

  const stats = [
    { label: "Visits today", value: todays.length, href: `/admin/calendar?view=day&date=${today}`, icon: <CalendarDays className="size-5" /> },
    { label: "Requests to confirm", value: requests.length, href: "/admin/calendar", icon: <Hourglass className="size-5" />, hot: requests.length > 0 },
    { label: "Clients", value: clients.count ?? 0, href: "/admin/clients", icon: <Users className="size-5" /> },
    { label: "New messages", value: messages.count ?? 0, href: "/admin/messages", icon: <Inbox className="size-5" /> },
  ];

  const setup = [
    { done: seeded, label: "Load your editable website content", href: "/admin" },
    { done: Boolean(settings.phone || settings.email), label: "Add your phone or email", href: "/admin/settings" },
    { done: (capacityRes.count ?? 0) > 0, label: "Set your walkers’ weekly availability", href: "/admin/schedule" },
    { done: Boolean(emailRes.data), label: "Booking emails connected", href: "/admin/schedule" },
    { done: isStripeConfigured(), label: "Connect Stripe for online payments", href: "/admin/integrations" },
  ];

  return (
    <>
      <PageTitle
        title={`Hi ${(admin.profile.full_name ?? "").split(" ")[0] || "there"}! 🐾`}
        description={`${longDate(today)} · ${todays.length ? `${todays.length} visit${todays.length === 1 ? "" : "s"} today` : "No visits today"}${tomorrowRes.count ? ` · ${tomorrowRes.count} tomorrow` : ""}`}
        actions={
          <>
            <ButtonLink href="/admin/calendar">Open calendar</ButtonLink>
            <ButtonLink href="/admin/calendar/new" variant="outline">
              New booking
            </ButtonLink>
          </>
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
            <Link
              href={s.href}
              className={
                s.hot
                  ? "block rounded-3xl border border-amber-300 bg-sun-100 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  : "block rounded-3xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              }
            >
              <span className="grid size-10 place-items-center rounded-2xl bg-sea-100 text-ocean">{s.icon}</span>
              <p className="mt-3 font-display text-3xl font-semibold">{s.value}</p>
              <p className="text-sm font-bold text-ink-600">{s.label}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <CalendarDays className="size-5 text-ocean" aria-hidden /> Today
              </h2>
              <Link href={`/admin/calendar?view=day&date=${today}`} className="text-sm font-bold text-ocean hover:underline">
                Day view
              </Link>
            </div>
            <BookingList
              bookings={todays}
              windows={config.windows}
              walkers={config.walkers}
              timeZone={tz}
              empty="Nothing on the schedule today. Enjoy the beach! 🌊"
              showClient
              hrefFor={calendarHref}
            />
          </Card>
          {requests.length ? (
            <Card className="border-amber-200">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <Hourglass className="size-5 text-amber-600" aria-hidden /> Waiting for you
                </h2>
                <Link href="/admin/calendar" className="text-sm font-bold text-ocean hover:underline">
                  Review
                </Link>
              </div>
              <BookingList
                bookings={requests}
                windows={config.windows}
                walkers={config.walkers}
                timeZone={tz}
                empty=""
                showClient
                hrefFor={(b) => `/admin/calendar?view=week&date=${b.service_date}&b=${b.id}`}
              />
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
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
          {(intake.count ?? 0) > 0 ? (
            <Card>
              <Link href="/admin/clients" className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-sun-100">
                  <ClipboardList className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold">
                    {intake.count} intake form{intake.count === 1 ? "" : "s"} to review
                  </span>
                  <span className="text-sm text-ink-600">Approve clients so they can book walks.</span>
                </span>
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Quick edits</h2>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/schedule" variant="outline" size="sm">Availability &amp; time off</ButtonLink>
          <ButtonLink href="/admin/pages" variant="outline" size="sm">Edit pages</ButtonLink>
          <ButtonLink href="/admin/gallery" variant="outline" size="sm">Upload photos</ButtonLink>
          <ButtonLink href="/admin/services" variant="outline" size="sm">Update prices</ButtonLink>
          <ButtonLink href="/admin/intake-form" variant="outline" size="sm">Edit intake form</ButtonLink>
          <ButtonLink href="/" variant="ghost" size="sm" target="_blank">View website</ButtonLink>
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
