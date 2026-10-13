import { adminData } from "@/app/admin/_lib";
import { FormBuilder } from "@/components/admin/form-builder";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import { DEFAULT_INTAKE_FORM } from "@/lib/defaults";
import type { FormDefinition, ServiceKind } from "@/lib/types";

export default async function IntakeFormPage({ searchParams }: PageProps<"/admin/intake-form">) {
  const [{ supabase, seeded }, sp] = await Promise.all([adminData(), searchParams]);
  const [{ data }, servicesRes] = await Promise.all([
    supabase.from("forms").select("slug, title, description, fields").eq("slug", "intake").maybeSingle<FormDefinition>(),
    supabase.from("services").select("id, name, kind").order("position"),
  ]);
  return (
    <>
      <PageTitle
        title="Intake & booking questions"
        description="Questions clients answer while booking: once, the first time they book a service, or every time."
      />
      {seeded ? (
        <FormBuilder
          initial={data ?? DEFAULT_INTAKE_FORM}
          services={(servicesRes.data ?? []) as { id: string; name: string; kind: ServiceKind }[]}
          initialTab={typeof sp.service === "string" ? sp.service : null}
        />
      ) : (
        <SeedPanel />
      )}
    </>
  );
}
