import { ArrowRight, CircleCheck, Circle, PawPrint } from "lucide-react";
import Link from "next/link";
import { BookingList } from "@/components/portal/booking-list";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Photo } from "@/components/ui/photo";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Pet } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function PortalHome() {
  const user = await requireUser();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [petsRes, intakeRes, bookingsRes] = await Promise.all([
    supabase.from("pets").select("*").eq("owner_id", user.id).order("created_at"),
    supabase.from("form_submissions").select("status").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_time", now)
      .eq("status", "scheduled")
      .order("start_time")
      .limit(3),
  ]);

  const pets = (petsRes.data ?? []) as Pet[];
  const upcoming = (bookingsRes.data ?? []) as Booking[];
  const firstName = (user.profile.full_name ?? "").split(" ")[0] || "friend";

  const steps = [
    {
      done: Boolean(user.profile.phone && user.profile.address),
      title: "Complete your profile",
      body: "Phone, address and how to get in.",
      href: "/portal/profile",
    },
    { done: pets.length > 0, title: "Add your pup", body: "Photos, quirks and vet info.", href: "/portal/pets/new" },
    {
      done: Boolean(intakeRes.data),
      title: "Fill out the intake form",
      body: "Routines, access and emergencies.",
      href: "/portal/intake",
    },
    { done: upcoming.length > 0, title: "Book a meet & greet", body: "Pick a time that works for you.", href: "/portal/book" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <PageTitle
        title={`Hi, ${firstName}! 👋`}
        description="Everything for your pup, all in one place."
        actions={<ButtonLink href="/portal/book">Book a walk</ButtonLink>}
      />

      {doneCount < steps.length ? (
        <Card className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Getting started</h2>
            <span className="text-sm font-bold text-ink-600">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-sea-50">
            <div className="h-full rounded-full bg-sun" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((step) => (
              <li key={step.title}>
                <Link
                  href={step.href}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border-2 p-4 transition",
                    step.done ? "border-transparent bg-sea-50" : "border-ink-100 hover:border-ocean",
                  )}
                >
                  {step.done ? (
                    <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Done" />
                  ) : (
                    <Circle className="mt-0.5 size-5 shrink-0 text-ink-200" aria-label="To do" />
                  )}
                  <span>
                    <span className={cn("block font-bold", step.done && "text-ink-600 line-through")}>{step.title}</span>
                    <span className="text-sm text-ink-600">{step.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Upcoming</h2>
            <Link href="/portal/book" className="text-sm font-bold text-ocean hover:underline">
              Book <ArrowRight className="inline size-4" aria-hidden />
            </Link>
          </div>
          <BookingList bookings={upcoming} empty="Nothing on the calendar yet." />
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your pups</h2>
            <Link href="/portal/pets/new" className="text-sm font-bold text-ocean hover:underline">
              Add a pup
            </Link>
          </div>
          {pets.length ? (
            <ul className="flex flex-wrap gap-4">
              {pets.map((pet) => (
                <li key={pet.id}>
                  <Link href={`/portal/pets/${pet.id}`} className="group block w-24 text-center">
                    <span className="mx-auto block size-20 overflow-hidden rounded-full border-4 border-sea-100 bg-sea-50 transition group-hover:border-sun">
                      {pet.photo_url ? (
                        <Photo src={pet.photo_url} alt="" className="h-full w-full" />
                      ) : (
                        <PawPrint className="m-auto mt-5 size-8 text-sea-300" aria-hidden />
                      )}
                    </span>
                    <span className="mt-2 block truncate font-bold">{pet.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-600">Tell us about your best buddy so we can give them the best walks.</p>
          )}
        </Card>
      </div>
    </>
  );
}
