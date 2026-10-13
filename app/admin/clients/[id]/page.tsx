import { ArrowLeft, Mail, MapPin, Phone, PawPrint } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { setSubmissionStatus } from "@/app/admin/_actions/business";
import { adminData } from "@/app/admin/_lib";
import { ApprovalToggle, ClientNotesForm, RoleToggle } from "@/components/admin/client-tools";
import { PetRecordsReview } from "@/components/admin/pet-records-review";
import { PageTitle } from "@/components/dashboard/shell";
import { FormAnswersView } from "@/components/forms/dynamic-form-fields";
import { BookingList } from "@/components/portal/booking-list";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Photo } from "@/components/ui/photo";
import { BOOKING_DETAIL_SELECT, normalizeBookings } from "@/lib/booking";
import { getBookingConfig } from "@/lib/booking-server";
import { getForm } from "@/lib/content";
import { todayIn } from "@/lib/dates";
import { formatAge, formatDate, formatMoney } from "@/lib/format";
import { getPetRecordFiles } from "@/lib/records-server";
import type { FormSubmission, Payment, Pet, Profile } from "@/lib/types";
import { referrerPrefix, sourceLabel } from "@/lib/source";
import { cn } from "@/lib/utils";

// Reading a client's answers is separate from approving them (that's the switch under Booking).
const READ_LABELS = { submitted: "New", reviewed: "Read" } as const;

export default async function ClientDetailPage({ params }: PageProps<"/admin/clients/[id]">) {
  const [{ id }, { supabase, admin }] = await Promise.all([params, adminData()]);
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!profile) notFound();

  const [petsRes, submissionRes, notesRes, bookingsRes, paymentsRes, form, config, servicesRes] = await Promise.all([
    supabase.from("pets").select("*").eq("owner_id", id).order("created_at"),
    supabase.from("form_submissions").select("*").eq("user_id", id).eq("form_slug", "intake").maybeSingle<FormSubmission>(),
    supabase.from("client_notes").select("notes").eq("user_id", id).maybeSingle(),
    supabase.from("bookings").select(BOOKING_DETAIL_SELECT).eq("user_id", id).order("start_time", { ascending: false }).limit(25),
    supabase.from("payments").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    getForm("intake"),
    getBookingConfig(supabase),
    supabase.from("services").select("id, name").order("position"),
  ]);
  const serviceNames = new Map((servicesRes.data ?? []).map((s) => [s.id as string, s.name as string]));
  // Signed up through another client's invite link: who sent them.
  const prefix = referrerPrefix(profile.source);
  const { data: referrer } = prefix
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .gte("id", `${prefix}-0000-0000-0000-000000000000`)
        .lte("id", `${prefix}-ffff-ffff-ffff-ffffffffffff`)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const pets = (petsRes.data ?? []) as Pet[];
  const records = await getPetRecordFiles(supabase, pets.map((p) => p.id));
  const today = todayIn(config.settings.timezone);
  const noRabies = pets.filter((p) => !p.rabies_until || p.rabies_until < today);
  const submission = submissionRes.data;
  const payments = (paymentsRes.data ?? []) as Payment[];
  const now = new Date();

  return (
    <>
      <Link href="/admin/clients" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ocean hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All clients
      </Link>
      <PageTitle
        title={profile.full_name || profile.email || "Client"}
        description={`Joined ${formatDate(profile.created_at)}`}
        actions={
          <>
            <ButtonLink href={`/admin/calendar/new?client=${profile.id}`}>New booking</ButtonLink>
            {profile.id !== admin.id ? <RoleToggle userId={profile.id} role={profile.role} /> : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Contact</h2>
            <ul className="space-y-3">
              {profile.email ? (
                <Detail icon={<Mail className="size-4" />}>
                  <a href={`mailto:${profile.email}`} className="text-ocean hover:underline">{profile.email}</a>
                </Detail>
              ) : null}
              {profile.phone ? (
                <Detail icon={<Phone className="size-4" />}>
                  <a href={`tel:${profile.phone}`} className="text-ocean hover:underline">{profile.phone}</a>
                </Detail>
              ) : null}
              {profile.address ? <Detail icon={<MapPin className="size-4" />}>{profile.address}</Detail> : null}
            </ul>
            {profile.emergency_contact_name || profile.emergency_contact_phone ? (
              <p className="mt-4 text-sm">
                <span className="font-bold">Emergency:</span> {profile.emergency_contact_name} {profile.emergency_contact_phone}
              </p>
            ) : null}
            {profile.vet_care_ok != null ? (
              <p className="mt-1 text-sm">
                <span className="font-bold">Vet if we can’t reach anyone:</span>{" "}
                {profile.vet_care_ok ? "Yes, go ahead" : "No, keep trying them"}
              </p>
            ) : null}
            {profile.access_notes ? (
              <div className="mt-4 rounded-2xl bg-sun-100 p-3 text-sm">
                <p className="font-bold">Home access</p>
                <p className="whitespace-pre-wrap">{profile.access_notes}</p>
              </div>
            ) : null}
          </Card>

          {profile.role === "client" ? (
            <Card>
              <h2 className="mb-3 text-xl font-semibold">Booking</h2>
              <ApprovalToggle userId={profile.id} approved={profile.booking_approved} />
              {!profile.booking_approved && pets.length && noRabies.length ? (
                <p className="mt-3 rounded-2xl bg-sun-100/70 p-3 text-sm">
                  No current rabies record checked for {noRabies.map((p) => p.name).join(" & ")} yet. California requires it for dogs over 4
                  months. It’s your call whether to approve without it.
                </p>
              ) : null}
              <p className="mt-4 border-t border-ink-100 pt-3 text-sm text-ink-600">
                Found us:{" "}
                {referrer ? (
                  <Link href={`/admin/clients/${referrer.id}`} className="font-bold text-ocean hover:underline">
                    Referred by {referrer.full_name || referrer.email}
                  </Link>
                ) : (
                  <span className="font-bold text-ink">{sourceLabel(profile.source)}</span>
                )}
              </p>
              {profile.review_requested_at ? (
                <p className="mt-1 text-sm text-ink-600">Asked for a Google review on {formatDate(profile.review_requested_at)}.</p>
              ) : null}
              <p className="mt-1 text-sm text-ink-600">
                {profile.terms_accepted_at
                  ? `Agreed to the Terms of Service and Privacy Policy on ${formatDate(profile.terms_accepted_at)}.`
                  : "Hasn’t agreed to the Terms of Service yet. They’ll be asked the next time they log in."}
              </p>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-1 text-xl font-semibold">Private notes</h2>
            <p className="mb-3 text-sm text-ink-600">Only admins can see these.</p>
            <ClientNotesForm userId={profile.id} notes={notesRes.data?.notes ?? ""} />
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-semibold">Bookings</h2>
            <BookingList
              bookings={normalizeBookings(bookingsRes.data)}
              windows={config.windows}
              walkers={config.walkers}
              timeZone={config.settings.timezone}
              empty="No bookings yet."
              hrefFor={(b) => `/admin/calendar?view=week&date=${b.service_date}&b=${b.id}`}
            />
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-semibold">Payments</h2>
            {payments.length ? (
              <ul className="divide-y divide-ink-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>
                      {p.description} · {formatDate(p.created_at)}
                    </span>
                    <span className="font-bold">{formatMoney(p.amount_cents, p.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-600">No payments yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Pups</h2>
            {pets.length === 0 ? (
              <p className="text-ink-600">No pups added yet.</p>
            ) : (
              <ul className="space-y-5">
                {pets.map((pet) => (
                  <li key={pet.id} className="rounded-2xl border border-ink-100 p-4">
                    <div className="flex items-center gap-4">
                      <span className="block size-16 shrink-0 overflow-hidden rounded-2xl bg-sea-50">
                        {pet.photo_url ? (
                          <Photo src={pet.photo_url} alt={pet.name} className="h-full w-full" />
                        ) : (
                          <PawPrint className="m-auto mt-4 size-8 text-sea-300" aria-hidden />
                        )}
                      </span>
                      <div>
                        <p className="font-display text-lg font-semibold">{pet.name}</p>
                        <p className="text-sm text-ink-600">
                          {[pet.breed, pet.sex, formatAge(pet.birthday, now), pet.weight_lbs ? `${pet.weight_lbs} lbs` : "",
                            pet.spayed_neutered == null ? "" : pet.spayed_neutered ? "Fixed" : "Not fixed"]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <PetDetail label="Personality" value={pet.temperament} />
                      <PetDetail label="Walking notes" value={pet.walking_notes} />
                      <PetDetail label="Feeding" value={pet.feeding_notes} />
                      <PetDetail label="Medications" value={pet.medications} />
                      <PetDetail label="Medical / allergies" value={pet.medical_notes} />
                      <PetDetail label="Vet" value={[pet.vet_name, pet.vet_phone].filter(Boolean).join(" · ")} />
                    </dl>
                    <PetRecordsReview pet={pet} files={records.get(pet.id) ?? []} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Their answers</h2>
              {submission ? (
                <div className="flex flex-wrap gap-1.5">
                  {(["submitted", "reviewed"] as const).map((status) => {
                    const on = status === "submitted" ? submission.status === "submitted" : submission.status !== "submitted";
                    return (
                      <form key={status} action={setSubmissionStatus.bind(null, submission.id, status)}>
                        <button
                          type="submit"
                          aria-pressed={on}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-bold transition",
                            on ? "bg-ink text-white" : "bg-sea-50 text-ink-600 hover:bg-sea-100",
                          )}
                        >
                          {READ_LABELS[status]}
                        </button>
                      </form>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {submission && form ? (
              <>
                <p className="mb-4 text-sm text-ink-600">Last updated {formatDate(submission.updated_at)}</p>
                {submission.service_ids?.length ? (
                  <div className="mb-4 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-ink-600">Interested in:</span>
                    {submission.service_ids.map((sid) => (
                      <Badge key={sid} tone="sea">
                        {serviceNames.get(sid) ?? "Removed service"}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <FormAnswersView
                  fields={form.fields}
                  answers={submission.answers}
                  serviceIds={submission.service_ids ?? []}
                  serviceNames={serviceNames}
                />
              </>
            ) : (
              <p className="text-ink-600">Nothing yet. Questions are asked the first time they book a service.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 text-ocean">{icon}</span>
      <span className="break-all">{children}</span>
    </li>
  );
}

function PetDetail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="font-bold text-ink-600">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
