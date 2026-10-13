import { adminData } from "@/app/admin/_lib";
import { HoursEditor } from "@/components/admin/hours-editor";
import {
  CalendarSyncCard,
  EmailCard,
  RulesEditor,
  TimeOffEditor,
  WindowsEditor,
} from "@/components/admin/schedule-editor";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HoursBlock } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { todayIn } from "@/lib/dates";
import { getOrigin } from "@/lib/origin";

export default async function SchedulePage() {
  const { supabase, admin } = await adminData();
  const config = await getBookingConfig(supabase);
  const today = todayIn(config.settings.timezone);
  const [hoursRes, servicesRes, timeOffRes, feedRes, emailRes, origin] = await Promise.all([
    supabase
      .from("walker_hours")
      .select("id, walker_id, weekday, start_minute, end_minute, dogs, label, service_ids")
      .order("weekday")
      .order("start_minute"),
    supabase.from("services").select("id, name").in("kind", ["window", "time"]).eq("bookable", true).order("position"),
    supabase.from("time_off").select("*").gte("end_date", today).order("start_date"),
    supabase.from("calendar_feeds").select("token").eq("profile_id", admin.id).maybeSingle(),
    supabase.rpc("email_status"),
    getOrigin(),
  ]);

  return (
    <>
      <PageTitle
        title="Schedule"
        description="When you work, how many dogs you take at once, and days off. Clients can only book inside these hours."
        actions={
          <ButtonLink href="/admin/calendar" variant="outline">
            Open calendar
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Weekly hours</h2>
            <p className="text-sm text-ink-600">
              Drag down a day to add hours. Click a block to change the times, set how many dogs can come along at once (great
              for park trips), or copy it to other days.
            </p>
          </div>
          <HoursEditor walkers={config.walkers} initial={(hoursRes.data ?? []) as HoursBlock[]} services={servicesRes.data ?? []} />
        </Card>
        <TimeOffEditor
          entries={timeOffRes.data ?? []}
          walkers={config.walkers}
          windows={config.windows.filter((w) => w.active)}
          today={today}
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <RulesEditor settings={config.settings} />
          <WindowsEditor windows={config.windows} />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <CalendarSyncCard origin={origin} token={feedRes.data?.token ?? null} />
          <EmailCard configured={Boolean(emailRes.data)} email={admin.email} />
        </div>
      </div>
    </>
  );
}
