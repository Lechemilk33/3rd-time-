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
      .gte("end_date", today)
      .order("start_time")
      .limit(200),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("user_id", user.id)
      .lt("end_date", today)
      .gte("service_date", addDays(today, -120))
      .order("start_time", { ascending: false })
      .limit(30),
  ]);

  const upcoming = normalizeBookings(upcomingRes.data);
  // Today's finished visits stay in the main list (marked Done); only canceled/declined move down.
  const active = upcoming.filter((b) => b.status !== "canceled" && b.status !== "declined");
  const inactive = upcoming.filter((b) => b.status === "canceled" || b.status === "declined");
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
        description={`Reschedule or cancel up to ${config.settings.cancel_cutoff_hours} hours before it starts.`}
        actions={<ButtonLink href="/portal/book">Make a booking</ButtonLink>}
      />
      <VisitList
        visits={active}
        {...common}
        empty={
          <EmptyState icon={<CalendarDays className="size-7" />} title="Nothing booked yet">
            <p>Your upcoming walks, visits and stays will show up here.</p>
            <ButtonLink href="/portal/book" className="mt-4">
              Make a booking
            </ButtonLink>
          </EmptyState>
        }
      />
      {inactive.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">Canceled or declined</h2>
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
