import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { INSTAGRAM_STATE_COOKIE, INSTAGRAM_TAG, exchangeInstagramCode } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

/**
 * Instagram sends the admin back here after they approve “Connect Instagram” in
 * Admin → Integrations. Add this URL to the Meta app's OAuth redirect URIs.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const jar = await cookies();
  const saved = readState(jar.get(INSTAGRAM_STATE_COOKIE)?.value);
  jar.delete({ name: INSTAGRAM_STATE_COOKIE, path: "/api/instagram" });
  await requireAdmin();

  const done = (result: string) => NextResponse.redirect(new URL(`/admin/integrations?instagram=${result}#instagram`, url.origin));

  if (!saved || url.searchParams.get("state") !== saved.state) return done("expired");
  if (url.searchParams.get("error")) return done("canceled");
  const code = url.searchParams.get("code")?.replace(/#_$/, "");
  if (!code) return done("failed");

  const connection = await exchangeInstagramCode(code, saved.redirectUri);
  if ("error" in connection) {
    console.error("Instagram connect failed:", connection.error);
    return done("failed");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("connect_instagram", {
    p_token: connection.token,
    p_user_id: connection.userId,
    p_username: connection.username,
    p_expires_at: connection.expiresAt,
  });
  if (error) {
    console.error("Failed to save the Instagram connection", error.message);
    return done(error.code === "PGRST202" ? "not-set-up" : "failed");
  }

  revalidateTag(INSTAGRAM_TAG, { expire: 0 });
  return done("connected");
}

function readState(value: string | undefined): { state: string; redirectUri: string } | null {
  try {
    const parsed = JSON.parse(value ?? "");
    return typeof parsed?.state === "string" && typeof parsed?.redirectUri === "string" ? parsed : null;
  } catch {
    return null;
  }
}
