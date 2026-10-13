import { adminData } from "@/app/admin/_lib";
import { SeedPanel } from "@/components/admin/seed-panel";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { PageTitle } from "@/components/dashboard/shell";
import { mergeSettings } from "@/lib/content";

export default async function SettingsPage() {
  const { supabase, seeded } = await adminData();
  const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
  return (
    <>
      <PageTitle title="Site settings" description="Business info, contact details, booking link and brand colors." />
      {seeded ? <SettingsEditor initial={mergeSettings(data?.data)} /> : <SeedPanel />}
    </>
  );
}
