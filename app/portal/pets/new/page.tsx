import { PageTitle } from "@/components/dashboard/shell";
import { PetForm } from "@/components/portal/pet-form";
import { requireUser } from "@/lib/auth";

export default async function NewPetPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [user, { next }] = await Promise.all([requireUser(), searchParams]);
  return (
    <>
      <PageTitle title="Add a pup" description="Tell us all about your best buddy." />
      <PetForm userId={user.id} next={typeof next === "string" && next.startsWith("/portal/book") ? next : undefined} />
    </>
  );
}
