import { CalendlyEmbed } from "@/components/calendly-embed";
import { PageTitle } from "@/components/dashboard/shell";
import { BookingList } from "@/components/portal/booking-list";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { getServices, getSiteSettings } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";
import { safeHref } from "@/lib/utils";

export default async function BookPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [settings, services, bookingsRes] = await Promise.all([
    getSiteSettings(),
    getServices(),
    supabase.from("bookings").select("*").eq("user_id", user.id).order("start_time", { ascending: false }).limit(50),
  ]);

  const now = new Date().getTime();
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const upcoming = bookings
    .filter((b) => new Date(b.start_time).getTime() >= now && b.status === "scheduled")
    .reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));
  const calendlyUrl = /^https:\/\/calendly\.com\//i.test(settings.bookingUrl) ? settings.bookingUrl : "";
  const serviceLinks = services.filter((s) => s.booking_url);

  return (
    <>
      <PageTitle title="Book a walk" description="Pick a time that works for you and your pup." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {serviceLinks.length ? (
            <Card>
              <h2 className="mb-3 font-semibold">Book a specific service</h2>
              <div className="flex flex-wrap gap-2">
                {serviceLinks.map((s) => (
                  <ButtonLink key={s.id} href={safeHref(s.booking_url)} target="_blank" rel="noreferrer" variant="outline" size="sm">
                    {s.name}
                  </ButtonLink>
                ))}
              </div>
            </Card>
          ) : null}
          {calendlyUrl ? (
            <CalendlyEmbed url={calendlyUrl} name={user.profile.full_name ?? ""} email={user.email} />
          ) : (
            <Notice tone="info" title="Online booking is coming soon">
              In the meantime, send us a message or reach out on Instagram and we’ll get you on the schedule.
            </Notice>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-xl font-semibold">Upcoming</h2>
            <BookingList bookings={upcoming} empty="No upcoming walks yet." />
          </Card>
          {past.length ? (
            <Card>
              <h2 className="mb-3 text-xl font-semibold">Past & canceled</h2>
              <BookingList bookings={past.slice(0, 10)} empty="" />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
