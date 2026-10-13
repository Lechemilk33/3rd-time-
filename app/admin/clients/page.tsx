import { Users } from "lucide-react";
import { adminData } from "@/app/admin/_lib";
import { ClientsTable, type ClientRow } from "@/components/admin/clients-table";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { latestUploads, recordsState } from "@/lib/records";
import type { Profile, SubmissionStatus } from "@/lib/types";

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  const [{ supabase }, sp] = await Promise.all([adminData(), searchParams]);
  const [profilesRes, petsRes, intakeRes, uploadsRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("pets").select("id, owner_id, name, breed, records_checked_at, rabies_until, distemper_until, bordetella_until"),
    supabase.from("form_submissions").select("user_id, status").eq("form_slug", "intake"),
    supabase.from("pet_records").select("pet_id, created_at"),
  ]);
  const latest = latestUploads(uploadsRes.data);
  const recordsToCheck = new Set(
    (petsRes.data ?? []).filter((p) => recordsState(p, latest.get(p.id)) === "checking").map((p) => p.owner_id as string),
  );
  const profiles = (profilesRes.data ?? []) as Profile[];
  const petsByOwner = new Map<string, { name: string; breed: string | null }[]>();
  for (const p of petsRes.data ?? []) {
    petsByOwner.set(p.owner_id, [...(petsByOwner.get(p.owner_id) ?? []), { name: p.name, breed: p.breed }]);
  }
  const intakeByUser = new Map((intakeRes.data ?? []).map((s) => [s.user_id as string, s.status as SubmissionStatus]));

  const rows: ClientRow[] = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || p.email || "No name yet",
    email: p.email,
    phone: p.phone,
    address: p.address,
    role: p.role,
    approved: p.booking_approved,
    intake: intakeByUser.get(p.id) ?? null,
    records: recordsToCheck.has(p.id),
    pets: petsByOwner.get(p.id) ?? [],
    joined: formatDate(p.created_at),
  }));

  return (
    <>
      <PageTitle
        title="Clients"
        description="Everyone with an account, their pups, intake and booking status."
        actions={<ButtonLink href="/admin/calendar/new">New booking</ButtonLink>}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title="No clients yet">
          When people sign up from your website they’ll show up here.
        </EmptyState>
      ) : (
        <ClientsTable rows={rows} initialFilter={sp.filter === "review" || sp.filter === "records" || sp.filter === "new" ? sp.filter : "all"} />
      )}
    </>
  );
}
