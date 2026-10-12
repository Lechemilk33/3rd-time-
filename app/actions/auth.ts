"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getOrigin, safeNextPath } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { formString } from "@/lib/utils";

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  error: "Client accounts aren’t connected yet. Please check back soon!",
};

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  redirect(safeNextPath(formString(formData, "next")));
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
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
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

  if (!fullName || !email || !password) return { ok: false, error: "Please fill in your name, email, and a password." };
  if (password.length < 8) return { ok: false, error: "Please choose a password with at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=/portal`,
    },
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  if (data.session) redirect("/portal");
  return {
    ok: true,
    message: `Almost there! We sent a confirmation link to ${email}. Click it to finish setting up your account.`,
  };
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = formString(formData, "email");
  if (!email) return { ok: false, error: "Enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/portal/password`,
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
