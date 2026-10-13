"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { TERMS_VERSION } from "@/lib/legal";
import { getOrigin, safeNextPath } from "@/lib/origin";
import { cleanSource } from "@/lib/source";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { formString } from "@/lib/utils";

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  error: "Client accounts aren’t connected yet. Please check back soon!",
};

/** Where an email link lands; `via` tells app/auth/callback which kind of email it was. */
async function callbackUrl(next: string, via: "signup" | "login" | "reset") {
  return `${await getOrigin()}/auth/callback?next=${encodeURIComponent(next)}&via=${via}`;
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password don’t match. Try again?";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first — check your inbox for the link.";
  if (/already registered/i.test(message)) return "There’s already an account with that email. Try logging in.";
  if (/password should be/i.test(message)) return "Please choose a password with at least 8 characters.";
  if (/rate limit/i.test(message)) return "Too many tries — please wait a minute and try again.";
  return message;
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = formString(formData, "email");
  const password = formString(formData, "password");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  const next = safeNextPath(formString(formData, "next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Right password, but the confirmation link was never used (or has expired): send a fresh one.
  if (error && /email not confirmed/i.test(error.message)) {
    const resent = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: await callbackUrl(next, "signup") } });
    return {
      ok: false,
      error: resent.error
        ? "Please confirm your email first. The link is in your inbox (check spam too)."
        : `Please confirm your email first. We just sent a fresh link to ${email}.`,
    };
  }
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  redirect(next);
}

export async function sendMagicLink(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = formString(formData, "email");
  if (!email) return { ok: false, error: "Enter your email address." };

  const next = safeNextPath(formString(formData, "next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: await callbackUrl(next, "login"),
    },
  });
  if (error && !/signups not allowed|user not found/i.test(error.message)) {
    return { ok: false, error: friendlyAuthError(error.message) };
  }
  // Same message either way so the form doesn't reveal who has an account.
  return { ok: true, message: "If there’s an account for that email, a login link is on its way. 📬" };
}

export async function signUp(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const fullName = formString(formData, "full_name");
  const phone = formString(formData, "phone");
  const email = formString(formData, "email");
  const password = formString(formData, "password");
  const next = safeNextPath(formString(formData, "next"));

  if (!fullName || !email || !password) return { ok: false, error: "Please fill in your name, email, and a password." };
  if (password.length < 8) return { ok: false, error: "Please choose a password with at least 8 characters." };
  if (formData.get("agree") !== "on") return { ok: false, error: "Please agree to the Terms of Service and Privacy Policy to create your account." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Saved on the profile with the time they agreed (see handle_new_user).
      data: { full_name: fullName, phone, terms_version: TERMS_VERSION, source: cleanSource(formString(formData, "source")) || null },
      emailRedirectTo: await callbackUrl(next, "signup"),
    },
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  if (data.session) redirect(next);
  return {
    ok: true,
    message: `Almost there! We sent a confirmation link to ${email}. Click it to finish setting up your account.`,
  };
}

/** "Send it again" after signing up. */
export async function resendConfirmation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = formString(formData, "email");
  if (!email) return { ok: false, error: "Enter your email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: await callbackUrl(safeNextPath(formString(formData, "next")), "signup") },
  });
  if (error && /rate limit|security purposes|after \d+ seconds/i.test(error.message)) {
    return { ok: false, error: "We just sent one. Give it a minute, then try again." };
  }
  return { ok: true, message: `Sent! Check ${email} (and your spam folder).` };
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = formString(formData, "email");
  if (!email) return { ok: false, error: "Enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl("/portal/password", "reset"),
  });
  if (error && /rate limit/i.test(error.message)) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, message: "If there’s an account for that email, a reset link is on its way. 📬" };
}

export async function updatePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const password = formString(formData, "password");
  const confirm = formString(formData, "confirm");
  if (!password || password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "Those passwords don’t match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true, message: "Password updated!" };
}
