import { Trash2 } from "lucide-react";
import Link from "next/link";
import { deleteBooking, setBookingStatus } from "@/app/admin/_actions/business";
import { adminData } from "@/app/admin/_lib";
import { ManualBookingForm } from "@/components/admin/client-tools";
import { PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { Booking, BookingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function BookingsPage() {
  const { supabase } = await adminData();
  const now = new Date();
  const [upcomingRes, pastRes, clientsRes, petsRes, servicesRes] = await Promise.all([
    supabase.from("bookings").select("*").gte("start_time", now.toISOString()).order("start_time").limit(100),
    supabase.from("bookings").select("*").lt("start_time", now.toISOString()).order("start_time", { ascending: false }).limit(30),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase.from("pets").select("id, name, owner_id").order("name"),
    supabase.from("services").select("id, name, duration_minutes").order("position"),
  ]);

  const clients = (clientsRes.data ?? []).map((c) => ({ id: c.id as string, label: (c.full_name || c.email) as string }));
  const clientName = new Map(clients.map((c) => [c.id, c.label]));

  return (
    <>
      <PageTitle
        title="Bookings"
        description="Calendly bookings appear here automatically once the webhook is connected. You can also add walks by hand."
      />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 text-xl font-semibold">Upcoming</h2>
          <BookingTable bookings={(upcomingRes.data ?? []) as Booking[]} clientName={clientName} empty="Nothing scheduled." />
        </Card>
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Add a booking</h2>
          <ManualBookingForm
            clients={clients}
            pets={(petsRes.data ?? []).map((p) => ({ id: p.id, label: p.name, ownerId: p.owner_id }))}
            services={(servicesRes.data ?? []).map((s) => ({ id: s.id, label: s.name, minutes: s.duration_minutes }))}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-xl font-semibold">Recent</h2>
          <BookingTable bookings={(pastRes.data ?? []) as Booking[]} clientName={clientName} empty="No past bookings." />
        </Card>
      </div>
    </>
  );
}

const TONES = { scheduled: "sea", completed: "green", canceled: "gray" } as const;

function BookingTable({
  bookings,
  clientName,
  empty,
}: {
  bookings: Booking[];
  clientName: Map<string, string>;
  empty: string;
}) {
  if (!bookings.length) return <p className="text-ink-600">{empty}</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {bookings.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {b.title}{" "}
              <span className="font-semibold text-ink-600">
                ·{" "}
                {b.user_id ? (
                  <Link href={`/admin/clients/${b.user_id}`} className="text-ocean hover:underline">
                    {clientName.get(b.user_id) ?? "Client"}
                  </Link>
                ) : (
                  b.invitee_name || b.invitee_email || "Guest"
                )}
              </span>
            </p>
            <p className="text-sm text-ink-600">
              {formatDateTime(b.start_time)} {b.source === "calendly" ? "· via Calendly" : ""}
            </p>
            {b.notes ? <p className="mt-1 text-sm whitespace-pre-wrap text-ink-600">{b.notes}</p> : null}
          </div>
          <Badge tone={TONES[b.status]}>{b.status}</Badge>
          <div className="flex gap-1">
            {(["scheduled", "completed", "canceled"] as BookingStatus[])
              .filter((s) => s !== b.status)
              .map((s) => (
                <form key={s} action={setBookingStatus.bind(null, b.id, s)}>
                  <button
                    type="submit"
                    className={cn("rounded-full bg-sea-50 px-3 py-1.5 text-xs font-bold text-ink-600 capitalize hover:bg-sea-100")}
                  >
                    Mark {s}
                  </button>
                </form>
              ))}
            {b.source === "manual" ? (
              <form action={deleteBooking.bind(null, b.id)}>
                <button type="submit" aria-label="Delete booking" className="grid size-8 place-items-center rounded-full text-red-700 hover:bg-red-50">
                  <Trash2 className="size-4" />
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
