import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth/forms";
import { SetupNotice } from "@/components/auth/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  const configured = isSupabaseConfigured();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Join the pack 🐶</h1>
      <p className="mt-2 mb-8 text-ink-600">
        Create a free account to add your pup, fill out the intake form, and book walks.
      </p>
      {configured ? null : <SetupNotice />}
      <SignupForm disabled={!configured} />
      <p className="mt-8 text-ink-600">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-ocean hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
