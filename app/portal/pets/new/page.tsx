import { PageTitle } from "@/components/dashboard/shell";
import { PetForm } from "@/components/portal/pet-form";
import { requireUser } from "@/lib/auth";

export default async function NewPetPage() {
  const user = await requireUser();
  return (
    <>
      <PageTitle title="Add a pup" description="Tell us all about your best buddy." />
      <PetForm userId={user.id} />
    </>
  );
}
