import { PageTitle } from "@/components/dashboard/shell";
import { PetForm } from "@/components/portal/pet-form";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/content";
import { todayIn } from "@/lib/dates";
import { BUSINESS_TIMEZONE } from "@/lib/env";

export default async function NewPetPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [user, { next }, settings] = await Promise.all([requireUser(), searchParams, getSiteSettings()]);
  return (
    <>
      <PageTitle title="Add a pup" description="Just their name is enough to start. Add more anytime." />
      <PetForm
        userId={user.id}
        next={typeof next === "string" && next.startsWith("/portal/book") ? next : undefined}
        teamEmail={settings.email || null}
        today={todayIn(BUSINESS_TIMEZONE)}
      />
    </>
  );
}
