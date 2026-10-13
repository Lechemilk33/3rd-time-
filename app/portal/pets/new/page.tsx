import Link from "next/link";
import { PageTitle } from "@/components/dashboard/shell";
import { PetForm } from "@/components/portal/pet-form";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/content";
import { todayIn } from "@/lib/dates";
import { BUSINESS_TIMEZONE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewPetPage({ searchParams }: { searchParams: Promise<{ next?: string; added?: string }> }) {
  const [user, { next, added }, settings] = await Promise.all([requireUser(), searchParams, getSiteSettings()]);
  const back = typeof next === "string" && next.startsWith("/portal/book") ? next : undefined;
  // Just saved one with "Save & add another pup".
  const supabase = await createClient();
  const { data: addedPet } =
    typeof added === "string" && UUID.test(added)
      ? await supabase.from("pets").select("name").eq("id", added).eq("owner_id", user.id).maybeSingle()
      : { data: null };

  return (
    <>
      <PageTitle
        title={addedPet ? "Add another pup" : "Add a pup"}
        description="Just their name is enough to start. Add more anytime."
      />
      {addedPet ? (
        <Notice tone="success" title={`${addedPet.name} is added! 🐾`} className="mb-6">
          Fill in your next pup below.{" "}
          <Link href={back ?? "/portal/pets"} className="font-bold underline">
            {back ? "All done? Pick a time →" : "All done? See your pups →"}
          </Link>
        </Notice>
      ) : null}
      {/* A fresh form after each pup. */}
      <PetForm
        key={addedPet ? added : "new"}
        userId={user.id}
        next={back}
        teamEmail={settings.email || null}
        today={todayIn(BUSINESS_TIMEZONE)}
      />
    </>
  );
}
