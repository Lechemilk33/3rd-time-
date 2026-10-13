import { ArrowRight, CircleCheck, Circle, ClipboardList, Gift, Hourglass, PawPrint, Plus, Star } from "lucide-react";
import Link from "next/link";
import { BookingList } from "@/components/portal/booking-list";
import { ShareLink } from "@/components/portal/share-link";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Photo } from "@/components/ui/photo";
import { requireUser } from "@/lib/auth";
import { BOOKING_DETAIL_SELECT, normalizeBookings } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { getBookingPolicy, getForm, getSiteSettings } from "@/lib/content";
import { todayIn } from "@/lib/dates";
import { missingRequired, unansweredForService } from "@/lib/intake";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { FormAnswers, Pet, Service } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function PortalHome() {
  const user = await requireUser();
  const supabase = await createClient();
  const config = await getBookingConfig(supabase);
  const today = todayIn(config.settings.timezone);

  const [petsRes, intakeRes, bookingsRes, anyBookingRes, servicesRes, form] = await Promise.all([
    supabase.from("pets").select("*").eq("owner_id", user.id).order("created_at"),
    supabase.from("form_submissions").select("status, answers, service_ids").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("bookings")
      .select(BOOKING_DETAIL_SELECT)
      .eq("user_id", user.id)
      .gte("end_date", today)
      .in("status", ["scheduled", "requested"])
      .order("start_time")
      .limit(4),
    supabase.from("bookings").select("service_id, status").eq("user_id", user.id).not("status", "in", "(canceled,declined)").limit(200),
    supabase.from("services").select("*").eq("active", true).order("position"),
    getForm("intake"),
  ]);
  const [policy, settings] = await Promise.all([getBookingPolicy(), getSiteSettings()]);
  const reviewUrl = policy.review_url;
  const visitsDone = (anyBookingRes.data ?? []).filter((b) => b.status === "completed").length;
  // Their personal invite link: sign-ups through it are saved as "friend-<their id>".
  const inviteUrl = `${siteUrl()}/?src=friend-${user.id.slice(0, 8)}`;

  const pets = (petsRes.data ?? []) as Pet[];
  const upcoming = normalizeBookings(bookingsRes.data);
  const services = (servicesRes.data ?? []) as Service[];
  const answers = (intakeRes.data?.answers as FormAnswers | undefined) ?? {};
  const myServiceIds = new Set([
    ...((intakeRes.data?.service_ids as string[] | undefined) ?? []),
    ...(anyBookingRes.data ?? []).map((b) => b.service_id as string).filter(Boolean),
  ]);
  const myServices = services.filter((s) => myServiceIds.has(s.id));
  const otherServices = services.filter((s) => !myServiceIds.has(s.id));
  const fields = form?.fields ?? [];
  const approved = user.isAdmin || user.profile.booking_approved;
  const meetGreet = services.find((s) => s.audience === "everyone" && s.bookable);
  // Booked their meet & greet but not approved yet: the next step is ours, so say so.
  const everyoneIds = new Set(services.filter((s) => s.audience === "everyone").map((s) => s.id));
  const waitingOnUs = !approved && (anyBookingRes.data ?? []).some((b) => everyoneIds.has(b.service_id as string));
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
      // Answering one service's questions creates the record too, so check the required ones are done.
      done: Boolean(intakeRes.data) && missingRequired(fields, answers, [...myServiceIds]).length === 0,
      title: "Fill out the intake form",
      body: "Routines, access and emergencies.",
      href: "/portal/intake",
    },
    approved
      ? { done: (anyBookingRes.data ?? []).length > 0, title: "Book your first walk", body: "Pick a day and time that works.", href: "/portal/book" }
      : {
          done: (anyBookingRes.data ?? []).length > 0,
          title: "Book a meet & greet",
          body: "We’ll meet your pup, then approve you for walks.",
          href: meetGreet ? `/portal/book?service=${meetGreet.id}` : "/portal/book",
        },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <PageTitle
        title={`Hi, ${firstName}! 👋`}
        description="Everything for your pup, all in one place."
        actions={<ButtonLink href="/portal/book">Make a booking</ButtonLink>}
      />

      {waitingOnUs ? (
        <Card className="mb-6 flex items-start gap-4 border-sea-200 bg-sea-50">
          <Hourglass className="mt-1 size-6 shrink-0 text-ocean" aria-hidden />
          <div>
            <h2 className="text-xl font-semibold">Thanks — we can’t wait to meet {pets.length === 1 ? pets[0].name : "your pup"}!</h2>
            <p className="mt-1 text-ink-600">
              After the meet &amp; greet we’ll approve your account and email you. Then walks and everything else unlock.
            </p>
          </div>
        </Card>
      ) : null}

      {doneCount < steps.length ? (
        <Card className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Getting started</h2>
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

      {services.length ? (
        <Card className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Your services</h2>
            <p className="text-sm text-ink-600">Add a service anytime — we’ll ask a couple of questions so your walker is ready.</p>
          </div>
          {myServices.length ? (
            <ul className="mb-5 grid gap-3 sm:grid-cols-2">
              {myServices.map((s) => {
                const todo = unansweredForService(fields, answers, s.id).filter((f) => f.required).length;
                return (
                  <li key={s.id}>
                    <Link
                      href={todo ? `/portal/services/${s.id}` : `/portal/book?service=${s.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border-2 p-4 transition hover:border-ocean",
                        todo ? "border-sun-300 bg-sun-100/40" : "border-ink-100",
                      )}
                    >
                      {todo ? (
                        <ClipboardList className="size-5 shrink-0 text-amber-600" aria-hidden />
                      ) : (
                        <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{s.name}</span>
                        <span className="text-sm text-ink-600">
                          {todo ? `${todo} question${todo === 1 ? "" : "s"} to answer` : approved || s.audience === "everyone" ? "Ready to book" : "Unlocks after your meet & greet"}
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-ink-400" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {otherServices.length ? (
            <div className="flex flex-wrap gap-2">
              {otherServices.map((s) => (
                <Link
                  key={s.id}
                  href={`/portal/services/${s.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-ink-200 px-4 py-2 text-sm font-bold text-ink-600 transition hover:border-ocean hover:text-ocean"
                >
                  <Plus className="size-4" aria-hidden /> {s.name}
                </Link>
              ))}
            </div>
          ) : null}
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
