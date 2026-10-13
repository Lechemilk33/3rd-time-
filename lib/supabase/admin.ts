import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isServiceRoleConfigured() {
  return Boolean(SUPABASE_URL && SECRET_KEY);
}

/**
 * Bypasses RLS. Only for trusted server code: webhooks, promoting the owner
 * listed in ADMIN_EMAILS and reading the Instagram token. Its responses never
 * go into Next's fetch cache, which otherwise keeps build-time fetches on disk.
 */
export function createServiceClient() {
  if (!isServiceRoleConfigured()) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }
  return createSupabaseClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
