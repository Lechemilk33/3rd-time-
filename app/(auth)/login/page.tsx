import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthSwitchLink, LoginForm } from "@/components/auth/forms";
import { SetupNotice } from "@/components/auth/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Welcome back! 🐾</h1>
      <p className="mt-2 mb-8 text-ink-600">Log in to your client portal.</p>
      {configured ? null : <SetupNotice />}
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginForm disabled={!configured} />
      </Suspense>
      <p className="mt-8 text-ink-600">
        New here?{" "}
        <Suspense fallback={<span className="font-bold text-ocean">Create an account</span>}>
          <AuthSwitchLink href="/signup">Create an account</AuthSwitchLink>
        </Suspense>
      </p>
    </>
  );
}
