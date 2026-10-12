import { adminData } from "@/app/admin/_lib";
import { GalleryManager } from "@/components/admin/gallery-manager";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import type { GalleryPhoto } from "@/lib/types";

export default async function GalleryPage() {
  const { supabase, seeded } = await adminData();
  const { data } = await supabase.from("gallery_photos").select("*").order("position").order("created_at");
  return (
    <>
      <PageTitle title="Gallery" description="Show off your happy pups. New uploads appear first." />
      {seeded ? <GalleryManager initial={(data ?? []) as GalleryPhoto[]} /> : <SeedPanel />}
    </>
  );
}
