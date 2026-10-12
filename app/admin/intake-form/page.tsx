import { adminData } from "@/app/admin/_lib";
import { FormBuilder } from "@/components/admin/form-builder";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import { DEFAULT_INTAKE_FORM } from "@/lib/defaults";
import type { FormDefinition } from "@/lib/types";

export default async function IntakeFormPage() {
  const { supabase, seeded } = await adminData();
  const [{ data }, servicesRes] = await Promise.all([
    supabase.from("forms").select("slug, title, description, fields").eq("slug", "intake").maybeSingle<FormDefinition>(),
    supabase.from("services").select("id, name").order("position"),
  ]);
  return (
    <>
      <PageTitle
        title="Intake form"
        description="One form for everyone. Tie questions to a service and only clients who signed up for it are asked — new questions are asked the next time they book it."
      />
      {seeded ? <FormBuilder initial={data ?? DEFAULT_INTAKE_FORM} services={servicesRes.data ?? []} /> : <SeedPanel />}
    </>
  );
}
