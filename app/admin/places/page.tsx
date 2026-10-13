import { adminData } from "@/app/admin/_lib";
import { PlacesManager } from "@/components/admin/places-manager";
import { PageTitle } from "@/components/dashboard/shell";
import { GOOGLE_MAPS_KEY } from "@/lib/maps";
import type { Place } from "@/lib/types";

export default async function PlacesPage() {
  const { supabase } = await adminData();
  const { data } = await supabase.from("places").select("*").order("name");
  return (
    <>
      <PageTitle
        title="Meeting places"
        description="Spots you meet clients at, like a park for meet & greets. Save them once, then pick one in a tap when you set where to meet."
      />
      <PlacesManager initial={(data ?? []) as Place[]} maps={Boolean(GOOGLE_MAPS_KEY)} />
    </>
  );
}
