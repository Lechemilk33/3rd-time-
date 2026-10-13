"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  requestPasswordReset,
  resendConfirmation,
  sendMagicLink,
  signIn,
  signUp,
  updatePassword,
} from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { PRIVACY_HREF, TERMS_HREF } from "@/lib/legal";
import { SOURCE_KEY } from "@/lib/source";
import { useFormAction } from "@/lib/use-form-action";

/** What an email link that couldn't sign them in here says (see app/auth/callback). */
function LinkNotice() {
  const params = useSearchParams();
  if (params.get("confirmed")) {
    return (
      <Notice tone="success" title="Your email is confirmed! 🎉">
        Log in below to finish setting up your account.
      </Notice>
    );
  }
  if (params.get("error") === "browser") {
    return (
      <Notice title="Almost there! Just log in below.">
        Your login link opened in a different browser from the one you asked from, so we couldn’t sign you in automatically.
      </Notice>
    );
  }
  if (params.get("error") === "link") {
    return (
      <Notice tone="warning" title="That link has expired or was already used.">
        If you’ve already confirmed your email, just log in below. If not, log in anyway and we’ll send you a fresh link.
      </Notice>
    );
  }
  return null;
}

/** Reads ?next=, ?confirmed= and ?error= from the URL, so render it inside <Suspense>. */
export function LoginForm({ disabled }: { disabled?: boolean }) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/portal";
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwSubmit, pwPending] = useFormAction(signIn);
  const [linkState, linkSubmit, linkPending] = useFormAction(sendMagicLink);

  if (mode === "link") {
    return (
      <div className="space-y-5">
        {linkState?.ok ? (
          <Notice tone="success">{linkState.message}</Notice>
        ) : (
          <form onSubmit={linkSubmit} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <Field label="Email" htmlFor="link-email">
              <Input id="link-email" name="email" type="email" autoComplete="email" required disabled={disabled} />
            </Field>
            {linkState?.error ? <Notice tone="error">{linkState.error}</Notice> : null}
            <SubmitButton size="lg" className="w-full" pendingText="Sending…" pending={linkPending} disabled={disabled}>
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
      <LinkNotice />
      <form onSubmit={pwSubmit} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required disabled={disabled} />
        </Field>
        {/* The link sits outside the <label> (so the field isn't announced as "Password Forgot it?") and after
            the input in tab order. */}
        <div className="relative">
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required disabled={disabled} />
          </Field>
          <Link href="/forgot-password" className="absolute top-0 right-0 text-sm font-bold text-ocean hover:underline">
            Forgot it?
          </Link>
        </div>
        {pwState?.error ? <Notice tone="error">{pwState.error}</Notice> : null}
        <SubmitButton size="lg" className="w-full" pendingText="Logging in…" pending={pwPending} disabled={disabled}>
          Log in
        </SubmitButton>
      </form>
      <button type="button" onClick={() => setMode("link")} className="text-sm font-bold text-ocean hover:underline">
        Email me a login link instead
      </button>
    </div>
  );
}

/** Reads ?next= so a visitor who tapped "Book" lands back there, so render it inside <Suspense>. */
const noSubscribe = () => () => {};

function readSource() {
  try {
    return localStorage.getItem(SOURCE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function SignupForm({ disabled }: { disabled?: boolean }) {
  const next = useSearchParams().get("next") ?? "/portal";
  // How they found us (see SourceTracker), saved on their profile.
  const source = useSyncExternalStore(noSubscribe, readSource, () => "");
  const [state, onSubmit, pending] = useFormAction(signUp);
  const [email, setEmail] = useState("");
  if (state?.ok) return <CheckEmail email={email} next={next} message={state.message} />;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="source" value={source} />
      <Field label="Your name" htmlFor="full_name" required>
        <Input id="full_name" name="full_name" autoComplete="name" required disabled={disabled} />
      </Field>
      <Field label="Email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={disabled}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
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
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-600">
        <input type="checkbox" name="agree" required className="mt-0.5 size-5 shrink-0 accent-ocean" disabled={disabled} />
        <span>
          I agree to the{" "}
          <a href={TERMS_HREF} target="_blank" rel="noreferrer" className="font-bold text-ocean underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href={PRIVACY_HREF} target="_blank" rel="noreferrer" className="font-bold text-ocean underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton size="lg" className="w-full" pendingText="Creating your account…" pending={pending} disabled={disabled}>
        Create my account
      </SubmitButton>
    </form>
  );
}

/** After signing up: where the link went, and a way to send it again. */
function CheckEmail({ email, next, message }: { email: string; next: string; message?: string }) {
  const [state, onSubmit, pending] = useFormAction(resendConfirmation);
  return (
    <div className="space-y-4">
      <Notice tone="success" title="Check your email 📬">
        {message}
      </Notice>
      {state?.ok ? (
        <Notice tone="success">{state.message}</Notice>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <span>Didn’t get it?</span>
          <button type="submit" disabled={pending} className="font-bold text-ocean hover:underline disabled:opacity-60">
            {pending ? "Sending…" : "Send it again"}
          </button>
        </form>
      )}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
    </div>
  );
}

/** Reads ?error= (a reset link that didn't work), so render it inside <Suspense>. */
export function ForgotPasswordForm({ disabled }: { disabled?: boolean }) {
  const linkError = useSearchParams().get("error");
  const [state, onSubmit, pending] = useFormAction(requestPasswordReset);
  if (state?.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {linkError === "browser" ? (
        <Notice title="Let’s send you a new link.">
          That reset link opened in a different browser from the one you asked from, so it couldn’t finish. Send a new one
          from here and open it from your email.
        </Notice>
      ) : linkError === "link" ? (
        <Notice tone="warning" title="That reset link has expired or was already used.">
          Send a new one below.
        </Notice>
      ) : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required disabled={disabled} />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton size="lg" className="w-full" pendingText="Sending…" pending={pending} disabled={disabled}>
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, onSubmit, pending] = useFormAction(updatePassword);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" htmlFor="password" help="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton pendingText="Saving…" pending={pending}>
        Save password
      </SubmitButton>
    </form>
  );
}

/** A link to the other auth page that keeps ?next=, so switching between log in and sign up doesn't lose it. */
export function AuthSwitchLink({ href, children }: { href: string; children: ReactNode }) {
  const next = useSearchParams().get("next");
  return (
    <Link href={next ? `${href}?next=${encodeURIComponent(next)}` : href} className="font-bold text-ocean hover:underline">
      {children}
    </Link>
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
