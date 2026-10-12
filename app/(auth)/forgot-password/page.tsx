import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forms";
import { SetupNotice } from "@/components/auth/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Forgot your password?</h1>
      <p className="mt-2 mb-8 text-ink-600">No worries — we’ll email you a link to pick a new one.</p>
      {configured ? null : <SetupNotice />}
      <ForgotPasswordForm disabled={!configured} />
      <p className="mt-8 text-ink-600">
        <Link href="/login" className="font-bold text-ocean hover:underline">
          ← Back to login
        </Link>
      </p>
    </>
  );
}
