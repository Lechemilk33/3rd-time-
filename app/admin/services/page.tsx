import { adminData } from "@/app/admin/_lib";
import { SeedPanel } from "@/components/admin/seed-panel";
import { ServicesEditor } from "@/components/admin/services-editor";
import { PageTitle } from "@/components/dashboard/shell";
import { isStripeConfigured } from "@/lib/stripe";
import type { Service } from "@/lib/types";

export default async function ServicesPage() {
  const { supabase, seeded } = await adminData();
  const { data } = await supabase.from("services").select("*").order("position").order("created_at");
  return (
    <>
      <PageTitle
        title="Services & prices"
        description="These show up anywhere you’ve added a “Services & prices” section, and in the client portal."
      />
      {seeded ? (
        <ServicesEditor initial={(data ?? []) as Service[]} stripeReady={isStripeConfigured()} />
      ) : (
        <SeedPanel />
      )}
    </>
  );
}
