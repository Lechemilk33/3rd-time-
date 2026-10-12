import { adminData } from "@/app/admin/_lib";
import { AdminCalendar } from "@/components/calendar/admin-calendar";
import { BOOKING_DETAIL_SELECT, normalizeBookings } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { isCalendarView, viewRange } from "@/lib/calendar";
import { isYmd, minutesNowIn, todayIn } from "@/lib/dates";

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const [{ supabase }, sp] = await Promise.all([adminData(), searchParams]);
  const config = await getBookingConfig(supabase);
  const tz = config.settings.timezone;
  const today = todayIn(tz);

  const view = isCalendarView(sp.view) ? sp.view : "week";
  const date = isYmd(sp.date) ? sp.date : today;
  const focusId = typeof sp.b === "string" && /^[0-9a-f-]{36}$/i.test(sp.b) ? sp.b : null;
  const { from, to } = viewRange(view, date);

  const [bookingsRes, requestsRes, focusRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .gte("service_date", from)
      .lte("service_date", to)
      .order("start_time")
      .limit(3000),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("status", "requested")
      .gte("service_date", today)
      .order("start_time")
      .limit(50),
    focusId ? supabase.from("bookings").select(BOOKING_DETAIL_SELECT).eq("id", focusId).maybeSingle() : null,
  ]);

  return (
    <AdminCalendar
      view={view}
      date={date}
      from={from}
      to={to}
      today={today}
      nowMinute={minutesNowIn(tz)}
      explicitView={isCalendarView(sp.view)}
      bookings={normalizeBookings(bookingsRes.data)}
      requests={normalizeBookings(requestsRes.data)}
      focus={focusRes?.data ? normalizeBookings([focusRes.data])[0] : null}
      windows={config.windows}
      walkers={config.walkers}
      timeZone={tz}
      initialOpenId={focusId}
    />
  );
}
