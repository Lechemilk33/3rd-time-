"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import {
  requestPasswordReset,
  sendMagicLink,
  signIn,
  signUp,
  updatePassword,
} from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

/** Reads ?next= and ?error= from the URL, so render it inside <Suspense>. */
export function LoginForm({ disabled }: { disabled?: boolean }) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/portal";
  const linkError = params.get("error") === "link";
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction] = useActionState(signIn, null);
  const [linkState, linkAction] = useActionState(sendMagicLink, null);

  if (mode === "link") {
    return (
      <div className="space-y-5">
        {linkState?.ok ? (
          <Notice tone="success">{linkState.message}</Notice>
        ) : (
          <form action={linkAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <Field label="Email" htmlFor="link-email">
              <Input id="link-email" name="email" type="email" autoComplete="email" required disabled={disabled} />
            </Field>
            {linkState?.error ? <Notice tone="error">{linkState.error}</Notice> : null}
            <SubmitButton size="lg" className="w-full" pendingText="Sending…" disabled={disabled}>
              Email me a login link
            </SubmitButton>
          </form>
        )}
        <button type="button" onClick={() => setMode("password")} className="text-sm font-bold text-ocean hover:underline">
          ← Log in with a password instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {linkError ? (
        <Notice tone="error">That link has expired or was already used. Please log in or request a new one.</Notice>
      ) : null}
      <form action={pwAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required disabled={disabled} />
        </Field>
        <Field
          label={
            <span className="flex items-center justify-between">
              Password
              <Link href="/forgot-password" className="text-sm font-bold text-ocean hover:underline">
                Forgot it?
              </Link>
            </span>
          }
          htmlFor="password"
        >
          <Input id="password" name="password" type="password" autoComplete="current-password" required disabled={disabled} />
        </Field>
        {pwState?.error ? <Notice tone="error">{pwState.error}</Notice> : null}
        <SubmitButton size="lg" className="w-full" pendingText="Logging in…" disabled={disabled}>
          Log in
        </SubmitButton>
      </form>
      <button type="button" onClick={() => setMode("link")} className="text-sm font-bold text-ocean hover:underline">
        Email me a login link instead
      </button>
    </div>
  );
}

export function SignupForm({ disabled }: { disabled?: boolean }) {
  const [state, action] = useActionState(signUp, null);
  if (state?.ok) return <Notice tone="success" title="Check your email">{state.message}</Notice>;

  return (
    <form action={action} className="space-y-4">
      <Field label="Your name" htmlFor="full_name" required>
        <Input id="full_name" name="full_name" autoComplete="name" required disabled={disabled} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required disabled={disabled} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" disabled={disabled} />
        </Field>
      </div>
      <Field label="Password" htmlFor="password" required help="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={disabled}
        />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton size="lg" className="w-full" pendingText="Creating your account…" disabled={disabled}>
        Create my account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm({ disabled }: { disabled?: boolean }) {
  const [state, action] = useActionState(requestPasswordReset, null);
  if (state?.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required disabled={disabled} />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton size="lg" className="w-full" pendingText="Sending…" disabled={disabled}>
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" htmlFor="password" help="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}

export function AuthFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-[4.75rem] animate-pulse rounded-2xl bg-sea-50" />
      <div className="h-[4.75rem] animate-pulse rounded-2xl bg-sea-50" />
      <div className="h-13 animate-pulse rounded-full bg-sun-100" />
    </div>
  );
}
