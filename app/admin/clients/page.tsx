import { Users } from "lucide-react";
import Link from "next/link";
import { adminData } from "@/app/admin/_lib";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { Profile, SubmissionStatus } from "@/lib/types";

const INTAKE_BADGE: Record<SubmissionStatus, { tone: "sun" | "sea" | "green"; label: string }> = {
  submitted: { tone: "sun", label: "Intake to review" },
  reviewed: { tone: "sea", label: "Intake reviewed" },
  approved: { tone: "green", label: "Approved" },
};

export default async function ClientsPage() {
  const { supabase } = await adminData();
  const [profilesRes, petsRes, intakeRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("pets").select("owner_id, name"),
    supabase.from("form_submissions").select("user_id, status").eq("form_slug", "intake"),
  ]);
  const profiles = (profilesRes.data ?? []) as Profile[];
  const petsByOwner = new Map<string, string[]>();
  for (const p of petsRes.data ?? []) {
    petsByOwner.set(p.owner_id, [...(petsByOwner.get(p.owner_id) ?? []), p.name]);
  }
  const intakeByUser = new Map((intakeRes.data ?? []).map((s) => [s.user_id as string, s.status as SubmissionStatus]));

  return (
    <>
      <PageTitle title="Clients" description="Everyone with a client account, their pups and intake status." />
      {profiles.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title="No clients yet">
          When people sign up from your website they’ll show up here.
        </EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-ink-100">
            {profiles.map((p) => {
              const status = intakeByUser.get(p.id);
              const pets = petsByOwner.get(p.id) ?? [];
              return (
                <li key={p.id}>
                  <Link href={`/admin/clients/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-4 hover:bg-sea-50 sm:px-6">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sun font-display font-semibold">
                      {(p.full_name || p.email || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-bold">
                        {p.full_name || "No name yet"}
                        {p.role === "admin" ? <Badge tone="coral">Admin</Badge> : null}
                      </p>
                      <p className="truncate text-sm text-ink-600">
                        {[p.email, p.phone].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-ink-600">
                      🐾 {pets.length ? pets.join(", ") : "No pups"}
                    </p>
                    {status ? (
                      <Badge tone={INTAKE_BADGE[status].tone}>{INTAKE_BADGE[status].label}</Badge>
                    ) : (
                      <Badge tone="gray">No intake</Badge>
                    )}
                    <span className="hidden text-sm text-ink-400 md:inline">Joined {formatDate(p.created_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
