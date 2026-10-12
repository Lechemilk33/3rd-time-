import { adminData } from "@/app/admin/_lib";
import {
  CalendarSyncCard,
  EmailCard,
  RulesEditor,
  TimeOffEditor,
  WalkersEditor,
  WindowsEditor,
} from "@/components/admin/schedule-editor";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { getBookingConfig } from "@/lib/booking-server";
import { todayIn } from "@/lib/dates";
import { getOrigin } from "@/lib/origin";

export default async function SchedulePage() {
  const { supabase, admin } = await adminData();
  const config = await getBookingConfig(supabase);
  const today = todayIn(config.settings.timezone);
  const [availabilityRes, timeOffRes, feedRes, emailRes, origin] = await Promise.all([
    supabase.from("walker_availability").select("walker_id, weekday, window_id, capacity"),
    supabase.from("time_off").select("*").gte("end_date", today).order("start_date"),
    supabase.from("calendar_feeds").select("token").eq("profile_id", admin.id).maybeSingle(),
    supabase.rpc("email_status"),
    getOrigin(),
  ]);

  return (
    <>
      <PageTitle
        title="Schedule & availability"
        description="When clients can book, how many visits each walker takes, and days off."
        actions={
          <ButtonLink href="/admin/calendar" variant="outline">
            Open calendar
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        <WalkersEditor walkers={config.walkers} windows={config.windows} availability={availabilityRes.data ?? []} />
        <div className="grid gap-6 xl:grid-cols-2">
          <WindowsEditor windows={config.windows} />
          <RulesEditor settings={config.settings} />
        </div>
        <TimeOffEditor entries={timeOffRes.data ?? []} walkers={config.walkers} windows={config.windows.filter((w) => w.active)} today={today} />
        <div className="grid gap-6 xl:grid-cols-2">
          <CalendarSyncCard origin={origin} token={feedRes.data?.token ?? null} />
          <EmailCard configured={Boolean(emailRes.data)} email={admin.email} />
        </div>
      </div>
    </>
  );
}
