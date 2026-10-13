import { BookingWizard } from "@/components/booking/booking-wizard";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import type { BookingPet } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { getForm } from "@/lib/content";
import { longDate, todayIn, type Ymd } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { FormAnswers, Service } from "@/lib/types";

export default async function BookPage({ searchParams }: PageProps<"/portal/book">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const [config, servicesRes, petsRes, submissionRes, upcomingRes, form] = await Promise.all([
    getBookingConfig(supabase),
    supabase.from("services").select("*").eq("active", true).eq("bookable", true).order("position"),
    supabase.from("pets").select("id, name, breed, photo_url").eq("owner_id", user.id).order("created_at"),
    supabase.from("form_submissions").select("answers, service_ids").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("bookings")
      .select("service_id, service_date, window_id, status, pets:booking_pets(pet_id)")
      .eq("user_id", user.id)
      .in("status", ["requested", "scheduled"])
      .gte("service_date", todayIn("America/Los_Angeles")),
    getForm("intake"),
  ]);

  const today = todayIn(config.settings.timezone);
  const booked: Record<string, string[]> = {};
  for (const b of upcomingRes.data ?? []) {
    const key = `${b.service_date}:${b.window_id}`;
    booked[key] = [...(booked[key] ?? []), ...((b.pets as { pet_id: string }[] | null) ?? []).map((p) => p.pet_id)];
  }

  const services = (servicesRes.data ?? []) as Service[];
  const approved = user.isAdmin || user.profile.booking_approved;
  // A new client who already has their meet & greet booked is waiting on us, not on the wizard.
  const meetGreetIds = new Set(services.filter((s) => s.audience === "everyone").map((s) => s.id));
  const meetGreet = approved
    ? null
    : (upcomingRes.data ?? []).filter((b) => meetGreetIds.has(b.service_id as string)).sort((a, b) => (a.service_date < b.service_date ? -1 : 1))[0];

  return (
    <>
      <PageTitle title="Make a booking" description="Pick a service, your pup and a time that works. It only takes a minute." />
      {meetGreet ? (
        // Their next step is ours: nothing else to book until we've met.
        <Notice
          tone="success"
          title={
            meetGreet.status === "requested"
              ? `Your meet & greet is requested for ${longDate(meetGreet.service_date as Ymd)}`
              : `Your meet & greet is set for ${longDate(meetGreet.service_date as Ymd)} 🎉`
          }
        >
          {meetGreet.status === "requested" ? "We’ll confirm the time by email. " : ""}
          Once we’ve met your pup, we’ll approve your account and email you. Then you can book walks and everything else.
          <div className="mt-3">
            <ButtonLink href="/portal/visits" size="sm" variant="secondary">
              View my visits
            </ButtonLink>
          </div>
        </Notice>
      ) : !config.settings.booking_enabled && !user.isAdmin ? (
        <Notice tone="warning" title="Online booking is paused right now">
          Send us a message and we’ll get you on the schedule.
          <div className="mt-3">
            <ButtonLink href="/contact" size="sm">
              Message us
            </ButtonLink>
          </div>
        </Notice>
      ) : services.length === 0 ? (
        <Notice tone="info" title="Nothing to book online yet">
          We’re setting up online booking. Send us a message in the meantime!
        </Notice>
      ) : (
        <BookingWizard
          services={services}
          pets={(petsRes.data ?? []) as BookingPet[]}
          windows={config.windows.filter((w) => w.active)}
          settings={config.settings}
          today={today}
          approved={approved}
          intake={{
            fields: form?.fields ?? [],
            answers: (submissionRes.data?.answers as FormAnswers | undefined) ?? {},
            serviceIds: (submissionRes.data?.service_ids as string[] | undefined) ?? [],
          }}
          initialServiceId={typeof sp.service === "string" ? sp.service : null}
          booked={booked}
          details={
            user.isAdmin
              ? null
              : {
                  phone: user.profile.phone,
                  address: user.profile.address,
                  access_notes: user.profile.access_notes,
                  emergency_contact_name: user.profile.emergency_contact_name,
                  emergency_contact_phone: user.profile.emergency_contact_phone,
                  vet_care_ok: user.profile.vet_care_ok,
                }
          }
        />
      )}
    </>
  );
}
