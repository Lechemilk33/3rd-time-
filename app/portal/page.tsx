import { ArrowRight, CircleCheck, Circle, CreditCard, Gift, Hourglass, PawPrint, Star, Syringe } from "lucide-react";
import Link from "next/link";
import { BookingList } from "@/components/portal/booking-list";
import { ShareLink } from "@/components/portal/share-link";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Photo } from "@/components/ui/photo";
import { requireUser } from "@/lib/auth";
import { BOOKING_DETAIL_SELECT, KIND_META, normalizeBookings } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { getBookingPolicy, getSiteSettings } from "@/lib/content";
import { longDate, todayIn, type Ymd } from "@/lib/dates";
import { latestUploads, recordsState, shotDate, shotsDue } from "@/lib/records";
import { formatMoney } from "@/lib/format";
import { dueVisits } from "@/lib/payments";
import { siteUrl } from "@/lib/site-url";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Pet, Service } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function PortalHome() {
  const user = await requireUser();
  const supabase = await createClient();
  const config = await getBookingConfig(supabase);
  const today = todayIn(config.settings.timezone);

  const [petsRes, bookingsRes, anyBookingRes, servicesRes, recordsRes, unpaidRes] = await Promise.all([
    supabase.from("pets").select("*").eq("owner_id", user.id).order("created_at"),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("user_id", user.id)
      .gte("end_date", today)
      .in("status", ["scheduled", "requested"])
      .order("start_time")
      .limit(4),
    supabase
      .from("bookings")
      .select("service_id, status, service_date, meeting_place")
      .eq("user_id", user.id)
      .not("status", "in", "(canceled,declined)")
      .order("service_date")
      .limit(200),
    supabase.from("services").select("*").eq("active", true).order("position"),
    supabase.from("pet_records").select("pet_id, created_at").eq("owner_id", user.id),
    isStripeConfigured()
      ? supabase
          .from("bookings")
          .select(BOOKING_DETAIL_SELECT)
          .eq("user_id", user.id)
          .in("status", ["scheduled", "completed"])
          .is("paid_at", null)
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  // Visits they can pay for online, upcoming or done.
  const toPay = dueVisits(normalizeBookings(unpaidRes.data));
  const [policy, settings] = await Promise.all([getBookingPolicy(), getSiteSettings()]);
  const reviewUrl = policy.review_url;
  const visitsDone = (anyBookingRes.data ?? []).filter((b) => b.status === "completed").length;
  // Their personal invite link: sign-ups through it are saved as "friend-<their id>".
  const inviteUrl = `${siteUrl()}/?src=friend-${user.id.slice(0, 8)}`;

  const pets = (petsRes.data ?? []) as Pet[];
  const upcoming = normalizeBookings(bookingsRes.data);
  const services = (servicesRes.data ?? []) as Service[];
  // Shortcuts to the services they can book online (not the meet & greet, they've had it).
  const quickBook = services.filter((s) => s.bookable && s.audience !== "everyone");
  const approved = user.isAdmin || user.profile.booking_approved;
  const meetGreet = services.find((s) => s.audience === "everyone" && s.bookable);
  // Booked their meet & greet but not approved yet: the next step is ours, so say so.
  const everyoneIds = new Set(services.filter((s) => s.audience === "everyone").map((s) => s.id));
  const meetGreetBooking = approved ? undefined : (anyBookingRes.data ?? []).find((b) => everyoneIds.has(b.service_id as string));
  const firstName = (user.profile.full_name ?? "").split(" ")[0] || "friend";
  const pupName = pets.length === 1 ? pets[0].name : "your pup";
  const meetGreetHref = meetGreet ? `/portal/book?service=${meetGreet.id}` : "/portal/book";

  // New clients: just two steps. Everything else is asked when a booking needs it.
  const steps = [
    {
      done: pets.length > 0,
      title: "Tell us about your pup",
      body: "Name and a photo is plenty to start.",
      // Straight on to picking a time afterwards.
      href: `/portal/pets/new?next=${encodeURIComponent(meetGreetHref)}`,
    },
    { done: Boolean(meetGreetBooking), title: "Book a free meet & greet", body: "Pick a time and we’ll meet you at a spot nearby.", href: meetGreetHref },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  // Shot records: anything that ran out or runs out soon (once the team has checked them).
  const latest = latestUploads(recordsRes.data);
  const due = pets.flatMap((p) => (recordsState(p, latest.get(p.id)) === "checked" ? shotsDue(p, today).map((v) => ({ pet: p, ...v })) : []));

  return (
    <>
      <PageTitle
        title={`Hi, ${firstName}! 👋`}
        description="Everything for your pup, all in one place."
        actions={<ButtonLink href="/portal/book">Make a booking</ButtonLink>}
      />

      {meetGreetBooking ? (
        <Card className="mb-6 flex items-start gap-4 border-sea-200 bg-sea-50">
          <Hourglass className="mt-1 size-6 shrink-0 text-ocean" aria-hidden />
          <div>
            <h2 className="text-xl font-semibold">We can’t wait to meet {pupName}!</h2>
            <p className="mt-1 text-ink-600">
              {meetGreetBooking.service_date >= today
                ? `Your meet & greet is on ${longDate(meetGreetBooking.service_date as Ymd)}. ${
                    meetGreetBooking.meeting_place
                      ? `We’ll meet at ${meetGreetBooking.meeting_place}. `
                      : "We’ll pick a public spot nearby and let you know where. "
                  }`
                : ""}
              Afterwards we’ll approve your account and email you, and then you can book walks and everything else.
            </p>
          </div>
        </Card>
      ) : null}

      {due.length ? (
        <Card className="mb-6 flex flex-wrap items-start gap-4 border-amber-300 bg-sun-100/60">
          <Syringe className="mt-1 size-6 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">Time to update {due[0].pet.name}’s shots</h2>
            <p className="mt-1 text-ink-600">
              {due.map((d) => `${d.pet.name}: ${d.name} (${d.expired ? "ran out" : "due"} ${shotDate(d.until)})`).join(" · ")}. Once your vet
              updates them, add a photo of the new record.
            </p>
          </div>
          <ButtonLink href={`/portal/pets/${due[0].pet.id}#records`} size="sm" variant="secondary">
            Add the new record
          </ButtonLink>
        </Card>
      ) : null}

      {toPay.due.length ? (
        <Card className="mb-6 flex flex-wrap items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun-100">
            <CreditCard className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">
              {toPay.due.length} visit{toPay.due.length === 1 ? "" : "s"} to pay · {formatMoney(toPay.total)}
            </h2>
            <p className="text-sm text-ink-600">Pay securely online, all at once or one at a time.</p>
          </div>
          <ButtonLink href="/portal/payments" variant="secondary">
            Pay now
          </ButtonLink>
        </Card>
      ) : null}

      {!approved && doneCount < steps.length ? (
        <Card className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Let’s meet!</h2>
              <p className="text-sm text-ink-600">Two quick steps, then we’ll take it from there.</p>
            </div>
            <span className="text-sm font-bold text-ink-600">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-sea-50">
            <div className="h-full rounded-full bg-sun transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
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
            <h2 className="text-xl font-semibold">Coming up</h2>
            <Link href="/portal/visits" className="text-sm font-bold text-ocean hover:underline">
              All visits <ArrowRight className="inline size-4" aria-hidden />
            </Link>
          </div>
          <BookingList
            bookings={upcoming}
            windows={config.windows}
            walkers={config.walkers}
            timeZone={config.settings.timezone}
            empty="Nothing on the calendar yet."
            hrefFor={() => "/portal/visits"}
          />
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your pups</h2>
            <Link href={approved || meetGreetBooking ? "/portal/pets/new" : steps[0].href} className="text-sm font-bold text-ocean hover:underline">
              Add a pup
            </Link>
          </div>
          {pets.length ? (
            <ul className="flex flex-wrap gap-4">
              {pets.map((pet) => {
                const state = recordsState(pet, latest.get(pet.id));
                const shots = state === "checked" && shotsDue(pet, today).length ? "due" : state;
                return (
                  <li key={pet.id}>
                    <Link href={`/portal/pets/${pet.id}${shots === "none" || shots === "due" ? "#records" : ""}`} className="group block w-28 text-center">
                      <span className="mx-auto block size-20 overflow-hidden rounded-full border-4 border-sea-100 bg-sea-50 transition group-hover:border-sun">
                        {pet.photo_url ? (
                          <Photo src={pet.photo_url} alt="" className="h-full w-full" />
                        ) : (
                          <PawPrint className="m-auto mt-5 size-8 text-sea-300" aria-hidden />
                        )}
                      </span>
                      <span className="mt-2 block truncate font-bold">{pet.name}</span>
                      <span
                        className={cn(
                          "block text-xs font-bold",
                          shots === "checked"
                            ? "text-emerald-700"
                            : shots === "due"
                              ? "text-amber-700"
                              : shots === "checking"
                                ? "text-ink-600"
                                : "text-ocean group-hover:underline",
                        )}
                      >
                        {shots === "checked"
                          ? "Shots on file ✓"
                          : shots === "due"
                            ? "Shots due"
                            : shots === "checking"
                              ? "Checking shots"
                              : "+ Shot records"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-600">Tell us about your best buddy so we can give them the best walks.</p>
          )}
        </Card>
      </div>

      {approved && quickBook.length ? (
        <Card className="mt-6">
          <h2 className="mb-1 text-xl font-semibold">Book again</h2>
          <p className="mb-4 text-sm text-ink-600">Jump straight to a service.</p>
          <div className="flex flex-wrap gap-2">
            {quickBook.map((s) => (
              <Link
                key={s.id}
                href={`/portal/book?service=${s.id}`}
                className="inline-flex items-center gap-2 rounded-full border-2 border-ink-100 px-4 py-2 font-bold transition hover:border-ocean hover:text-ocean"
              >
                <span aria-hidden>{KIND_META[s.kind].emoji}</span> {s.name}
                <ArrowRight className="size-4 text-ink-400" aria-hidden />
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {approved || reviewUrl ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {approved ? (
            <Card className="space-y-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-sun-100">
                <Gift className="size-5" aria-hidden />
              </span>
              <h2 className="text-xl font-semibold">Know a pup who’d love us?</h2>
              <p className="text-ink-600">
                Share your link with neighbors and friends. When they sign up through it, we’ll know you sent them.
              </p>
              <ShareLink url={inviteUrl} text={`We love our dog walker, ${settings.businessName}! Check them out:`} />
            </Card>
          ) : null}
          {reviewUrl && visitsDone > 0 ? (
            <Card className="space-y-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-sea-100 text-ocean">
                <Star className="size-5" aria-hidden />
              </span>
              <h2 className="text-xl font-semibold">Enjoying the walks?</h2>
              <p className="text-ink-600">
                A quick Google review helps other dog owners nearby find us. It takes about 30 seconds.
              </p>
              <ButtonLink href={reviewUrl} target="_blank" rel="noreferrer" size="sm" variant="secondary">
                Leave a review
              </ButtonLink>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
