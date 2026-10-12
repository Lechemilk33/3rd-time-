import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type CurrentUser = {
  id: string;
  email: string;
  profile: Profile;
  isAdmin: boolean;
};

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Promotes the business owner(s) listed in ADMIN_EMAILS the first time they
 * sign in, so nobody has to touch SQL to get into the admin portal.
 */
async function promoteIfOwner(userId: string, email: string, profile: Profile): Promise<Profile> {
  if (profile.role === "admin") return profile;
  if (!adminEmails().includes(email.toLowerCase())) return profile;
  if (!isServiceRoleConfigured()) return profile;

  const { error } = await createServiceClient()
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId);
  if (error) {
    console.error("Failed to promote admin", error.message);
    return profile;
  }
  return { ...profile, role: "admin" };
}

/** The signed-in user and their profile, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;
  // Sessions are per request; never let this run during prerendering.
  await connection();

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : "";

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (!profile) {
    // The signup trigger normally creates this; recover if it didn't.
    const { data: created } = await supabase
      .from("profiles")
      .insert({ id: userId, email })
      .select("*")
      .single<Profile>();
    profile = created;
  }
  if (!profile) return null;

  profile = await promoteIfOwner(userId, email, profile);
  return { id: userId, email, profile, isAdmin: profile.role === "admin" };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/portal");
  return user;
}
