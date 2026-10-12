import "server-only";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Admin-only data access for server components. */
export async function adminData() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("id").eq("id", 1).maybeSingle();
  return { admin, supabase, seeded: Boolean(data) };
}
