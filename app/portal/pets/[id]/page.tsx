import { notFound } from "next/navigation";
import { PageTitle } from "@/components/dashboard/shell";
import { PetForm } from "@/components/portal/pet-form";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/content";
import { todayIn } from "@/lib/dates";
import { BUSINESS_TIMEZONE } from "@/lib/env";
import { getPetRecordFiles } from "@/lib/records-server";
import { createClient } from "@/lib/supabase/server";
import type { Pet } from "@/lib/types";

export default async function EditPetPage({ params }: PageProps<"/portal/pets/[id]">) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const supabase = await createClient();
  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle<Pet>();
  if (!pet) notFound();
  const [records, settings] = await Promise.all([getPetRecordFiles(supabase, [pet.id]), getSiteSettings()]);

  return (
    <>
      <PageTitle title={pet.name} description="Keep your pup’s info up to date." />
      <PetForm
        pet={pet}
        userId={user.id}
        records={records.get(pet.id) ?? []}
        teamEmail={settings.email || null}
        today={todayIn(BUSINESS_TIMEZONE)}
      />
    </>
  );
}
