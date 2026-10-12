import { adminData } from "@/app/admin/_lib";
import { FormBuilder } from "@/components/admin/form-builder";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import { DEFAULT_INTAKE_FORM } from "@/lib/defaults";
import type { FormDefinition } from "@/lib/types";

export default async function IntakeFormPage() {
  const { supabase, seeded } = await adminData();
  const { data } = await supabase
    .from("forms")
    .select("slug, title, description, fields")
    .eq("slug", "intake")
    .maybeSingle<FormDefinition>();
  return (
    <>
      <PageTitle
        title="Intake form"
        description="The questions new clients answer in their portal. Add, remove, reorder — no code needed."
      />
      {seeded ? <FormBuilder initial={data ?? DEFAULT_INTAKE_FORM} /> : <SeedPanel />}
    </>
  );
}
