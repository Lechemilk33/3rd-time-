import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing spot for confirmation, login-link and password-reset emails. `via` (added in app/actions/auth.ts)
 * says which kind it was, so a link that can't sign someone in here still lands on the right message.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const params = url.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNextPath(params.get("next"));
  // Emails sent before `via` existed: a reset is the one that lands on the password page.
  const via = params.get("via") ?? (next === "/portal/password" ? "reset" : "signup");
  const go = (path: string, extra: Record<string, string> = {}) => {
    const to = new URL(path, url.origin);
    for (const [key, value] of Object.entries(extra)) to.searchParams.set(key, value);
    return NextResponse.redirect(to);
  };

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  // Already signed in here (the link was opened twice, say): carry on.
  if (!ok && (code || tokenHash)) ok = Boolean((await supabase.auth.getClaims()).data?.claims);
  if (ok) return go(next, via === "signup" ? { confirmed: "1" } : {});

  if (code) {
    // Supabase only sends a code once the link checks out, so the email is confirmed. It was opened in a
    // different browser from the one that asked for it (phone mail apps often do this), and only that
    // browser can finish signing in, so ask them to log in here instead of calling the link expired.
    if (via === "reset") return go("/forgot-password", { error: "browser" });
    if (via === "login") return go("/login", { error: "browser", next });
    return go("/login", { confirmed: "1", next });
  }
  // Expired, or already used.
  return via === "reset" ? go("/forgot-password", { error: "link" }) : go("/login", { error: "link", next });
}
