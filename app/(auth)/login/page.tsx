import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormSkeleton, LoginForm } from "@/components/auth/forms";
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
        <Link href="/signup" className="font-bold text-ocean hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
