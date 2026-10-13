import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthSwitchLink, SignupForm } from "@/components/auth/forms";
import { SetupNotice } from "@/components/auth/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  const configured = isSupabaseConfigured();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Join the pack 🐶</h1>
      <p className="mt-2 mb-8 text-ink-600">
        Create a free account, tell us about your pup and book a free meet &amp; greet. It takes about two minutes.
      </p>
      {configured ? null : <SetupNotice />}
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignupForm disabled={!configured} />
      </Suspense>
      <p className="mt-8 text-ink-600">
        Already have an account?{" "}
        <Suspense fallback={<span className="font-bold text-ocean">Log in</span>}>
          <AuthSwitchLink href="/login">Log in</AuthSwitchLink>
        </Suspense>
      </p>
    </>
  );
}
