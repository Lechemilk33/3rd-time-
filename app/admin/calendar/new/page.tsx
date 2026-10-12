import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { adminData } from "@/app/admin/_lib";
import { AdminBookingForm } from "@/components/booking/admin-booking-form";
import type { PickerClient } from "@/components/booking/client-picker";
import { PageTitle } from "@/components/dashboard/shell";
import { getBookingConfig } from "@/lib/booking-server";
import { getForm } from "@/lib/content";
import { isYmd, todayIn } from "@/lib/dates";
import type { Service } from "@/lib/types";

export default async function NewBookingPage({ searchParams }: PageProps<"/admin/calendar/new">) {
  const [{ supabase }, sp] = await Promise.all([adminData(), searchParams]);
  const [config, profilesRes, petsRes, servicesRes, form] = await Promise.all([
    getBookingConfig(supabase),
    supabase.from("profiles").select("id, full_name, email, phone, address, booking_approved, role").order("full_name"),
    supabase.from("pets").select("id, owner_id, name, breed, photo_url").order("name"),
    supabase.from("services").select("*").order("position"),
    getForm("intake"),
  ]);

  const petsByOwner = new Map<string, PickerClient["pets"]>();
  for (const p of petsRes.data ?? []) {
    petsByOwner.set(p.owner_id, [...(petsByOwner.get(p.owner_id) ?? []), { id: p.id, name: p.name, breed: p.breed, photo_url: p.photo_url }]);
  }
  const clients: PickerClient[] = (profilesRes.data ?? []).map((p) => ({ ...p, pets: petsByOwner.get(p.id) ?? [] }));

  const today = todayIn(config.settings.timezone);
  const minute = Number(sp.time);
  const walker = typeof sp.walker === "string" && config.walkers.some((w) => w.profile_id === sp.walker) ? sp.walker : null;
  const client = typeof sp.client === "string" && clients.some((c) => c.id === sp.client) ? sp.client : null;

  return (
    <>
      <Link href="/admin/calendar" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ocean hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Calendar
      </Link>
      <PageTitle title="New booking" description="Book a walk, appointment, day or stay for a client. Search by pup, owner, phone, email or address." />
      <AdminBookingForm
        clients={clients}
        services={((servicesRes.data ?? []) as Service[]).filter((s) => s.active || s.bookable)}
        windows={config.windows}
        walkers={config.walkers.filter((w) => w.active)}
        today={today}
        initial={{
          date: isYmd(sp.date) ? sp.date : today,
          minute: Number.isInteger(minute) && minute >= 0 && minute < 1440 ? minute : null,
          walkerId: walker,
          clientId: client,
          serviceId: typeof sp.service === "string" ? sp.service : null,
        }}
        intakeFields={form?.fields ?? []}
      />
    </>
  );
}
