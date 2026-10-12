import { CalendarDays } from "lucide-react";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { VisitList } from "@/components/portal/visit-list";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { BOOKING_DETAIL_SELECT, normalizeBookings } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { addDays, todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export default async function VisitsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const config = await getBookingConfig(supabase);
  const today = todayIn(config.settings.timezone);
  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("user_id", user.id)
      .gte("service_date", today)
      .order("start_time")
      .limit(200),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("user_id", user.id)
      .lt("service_date", today)
      .gte("service_date", addDays(today, -120))
      .order("start_time", { ascending: false })
      .limit(30),
  ]);

  const upcoming = normalizeBookings(upcomingRes.data);
  const active = upcoming.filter((b) => b.status === "scheduled" || b.status === "requested");
  const inactive = upcoming.filter((b) => !active.includes(b));
  const past = normalizeBookings(pastRes.data);
  const walkers = Object.fromEntries(config.walkers.map((w) => [w.profile_id, { display_name: w.display_name, color: w.color }]));
  const common = {
    windows: config.windows,
    walkers,
    timeZone: config.settings.timezone,
    cutoffHours: config.settings.cancel_cutoff_hours,
    maxDaysAhead: config.settings.max_days_ahead,
    today,
    now: new Date().getTime(),
  };

  return (
    <>
      <PageTitle
        title="My visits"
        description={`Reschedule or cancel up to ${config.settings.cancel_cutoff_hours} hours before a visit.`}
        actions={<ButtonLink href="/portal/book">Book a visit</ButtonLink>}
      />
      {active.length ? (
        <VisitList visits={active} {...common} />
      ) : (
        <EmptyState icon={<CalendarDays className="size-7" />} title="Nothing booked yet">
          <p>Your upcoming walks and visits will show up here.</p>
          <ButtonLink href="/portal/book" className="mt-4">
            Book a visit
          </ButtonLink>
        </EmptyState>
      )}
      {inactive.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">Canceled</h2>
          <VisitList visits={inactive} {...common} past />
        </section>
      ) : null}
      {past.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">Past visits</h2>
          <VisitList visits={past} {...common} past />
        </section>
      ) : null}
    </>
  );
}
