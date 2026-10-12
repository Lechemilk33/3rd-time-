import "server-only";
import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CONTENT_TAG } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";

/** Every admin action starts here: verifies the caller is an admin, then returns an RLS-scoped client. */
export async function adminClient() {
  await requireAdmin();
  return createClient();
}

/** Makes edits visible on the public site immediately and refreshes the admin view. */
export function publishContentChange() {
  updateTag(CONTENT_TAG);
  refresh();
}

export async function isSeeded(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("site_settings").select("id").eq("id", 1).maybeSingle();
  return Boolean(data);
}

export const NOT_SEEDED = { ok: false, error: "Load the starter content first (Admin → Overview)." } as const;

export function clampText(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
