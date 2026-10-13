"use server";

import { randomBytes } from "node:crypto";
import { refresh, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  INSTAGRAM_STATE_COOKIE,
  INSTAGRAM_TAG,
  instagramAuthorizeUrl,
  isInstagramLoginConfigured,
  lookupInstagramAccount,
} from "@/lib/instagram";
import { getOrigin } from "@/lib/origin";
import type { ActionResult } from "@/lib/types";
import { adminClient } from "./shared";

// ---------------------------------------------------------------------------
// Instagram feed (Admin → Integrations)
// ---------------------------------------------------------------------------

function connectError(error: { code?: string; message: string }) {
  return error.code === "PGRST202"
    ? "Run the Instagram database update first (supabase/migrations/…_instagram_feed.sql)."
    : error.message;
}

/** Sends the admin to Instagram to approve; they come back to /api/instagram/callback. */
export async function connectInstagram(): Promise<void> {
  await requireAdmin();
  if (!isInstagramLoginConfigured()) redirect("/admin/integrations#instagram");

  const state = randomBytes(24).toString("hex");
  const redirectUri = `${await getOrigin()}/api/instagram/callback`;
  (await cookies()).set(INSTAGRAM_STATE_COOKIE, JSON.stringify({ state, redirectUri }), {
    httpOnly: true,
    secure: redirectUri.startsWith("https:"),
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: 15 * 60,
  });
  redirect(instagramAuthorizeUrl(state, redirectUri));
}

/** For a token generated in the Meta dashboard (no app ID or secret needed on the server). */
export async function saveInstagramToken(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const supabase = await adminClient();
  const token = String(formData.get("token") ?? "").trim();
  if (!/^\S{20,2048}$/.test(token)) return { ok: false, error: "Paste the whole access token. It starts with “IG”." };

  const account = await lookupInstagramAccount(token);
  if ("error" in account) return { ok: false, error: `Instagram didn’t accept that token: ${account.error}` };

  const { error } = await supabase.rpc("connect_instagram", {
    p_token: token,
    p_user_id: account.userId,
    p_username: account.username,
  });
  if (error) return { ok: false, error: connectError(error) };

  updateTag(INSTAGRAM_TAG);
  refresh();
  return { ok: true, message: `Connected @${account.username}! Your latest posts are on the site now.` };
}

export async function disconnectInstagram(): Promise<void> {
  const supabase = await adminClient();
  const { error } = await supabase.rpc("disconnect_instagram");
  if (error) console.error("Failed to disconnect Instagram", error.message);
  updateTag(INSTAGRAM_TAG);
  refresh();
}
