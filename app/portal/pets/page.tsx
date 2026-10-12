import { PawPrint, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Photo } from "@/components/ui/photo";
import { requireUser } from "@/lib/auth";
import { formatAge } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Pet } from "@/lib/types";

export default async function PetsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("pets").select("*").eq("owner_id", user.id).order("created_at");
  const pets = (data ?? []) as Pet[];
  const now = new Date();

  return (
    <>
      <PageTitle
        title="My pups"
        description="The more we know, the better the walks."
        actions={
          <ButtonLink href="/portal/pets/new">
            <Plus className="size-4" aria-hidden /> Add a pup
          </ButtonLink>
        }
      />
      {pets.length === 0 ? (
        <EmptyState icon={<PawPrint className="size-7" />} title="No pups yet">
          Add your dog’s details, photo and quirks so we can give them the best care.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((pet) => (
            <li key={pet.id}>
              <Link
                href={`/portal/pets/${pet.id}`}
                className="block overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="aspect-[4/3] bg-sea-50">
                  {pet.photo_url ? (
                    <Photo src={pet.photo_url} alt={pet.name} className="h-full w-full" />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <PawPrint className="size-14 text-sea-300" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h2 className="text-xl font-semibold">{pet.name}</h2>
                  <p className="text-ink-600">
                    {[pet.breed, formatAge(pet.birthday, now), pet.weight_lbs ? `${pet.weight_lbs} lbs` : ""]
                      .filter(Boolean)
                      .join(" · ") || "Tap to add details"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
