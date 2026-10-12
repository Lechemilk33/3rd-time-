import { adminData } from "@/app/admin/_lib";
import { SeedPanel } from "@/components/admin/seed-panel";
import { ServicesEditor, type ServiceQuestionCounts } from "@/components/admin/services-editor";
import { PageTitle } from "@/components/dashboard/shell";
import { isStripeConfigured } from "@/lib/stripe";
import { askedEachBooking } from "@/lib/intake";
import type { FormField, Service } from "@/lib/types";

export default async function ServicesPage() {
  const { supabase, seeded } = await adminData();
  const [{ data }, formRes] = await Promise.all([
    supabase.from("services").select("*").order("position").order("created_at"),
    supabase.from("forms").select("fields").eq("slug", "intake").maybeSingle<{ fields: FormField[] }>(),
  ]);
  const questions: ServiceQuestionCounts = {};
  for (const f of formRes.data?.fields ?? []) {
    if (f.type === "heading") continue;
    for (const id of f.services ?? []) {
      questions[id] ??= { once: 0, each: 0 };
      questions[id][askedEachBooking(f) ? "each" : "once"] += 1;
    }
  }
  return (
    <>
      <PageTitle
        title="Services & prices"
        description="Walks, appointments, day care, overnight stays — each service sets how clients book it and what you ask them."
      />
      {seeded ? (
        <ServicesEditor initial={(data ?? []) as Service[]} stripeReady={isStripeConfigured()} questions={questions} />
      ) : (
        <SeedPanel />
      )}
    </>
  );
}
