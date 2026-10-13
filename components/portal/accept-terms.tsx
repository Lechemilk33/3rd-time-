"use client";

import { ScrollText } from "lucide-react";
import { acceptTerms } from "@/app/portal/actions";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { PRIVACY_HREF, TERMS_HREF } from "@/lib/legal";
import { useFormAction } from "@/lib/use-form-action";

export function AcceptTerms({ updated }: { updated: boolean }) {
  const [state, onSubmit, pending] = useFormAction(acceptTerms);
  return (
    <Card className="mx-auto max-w-xl space-y-5">
      <span className="grid size-12 place-items-center rounded-2xl bg-sea-100 text-ocean">
        <ScrollText className="size-6" aria-hidden />
      </span>
      <div>
        <h1 className="text-2xl font-semibold">{updated ? "We’ve updated our terms" : "One quick thing"}</h1>
        <p className="mt-2 text-ink-600">
          {updated
            ? "Please take a look at the new version and agree to keep booking."
            : "We’ve added Terms of Service and a Privacy Policy. They cover cancellations, payments, vet care in an emergency and how we look after your information. Please read them and agree to keep using your portal."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={TERMS_HREF}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center rounded-full border-2 border-ink-200 px-4 text-sm font-bold hover:border-ocean hover:text-ocean"
        >
          Read the Terms of Service
        </a>
        <a
          href={PRIVACY_HREF}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center rounded-full border-2 border-ink-200 px-4 text-sm font-bold hover:border-ocean hover:text-ocean"
        >
          Read the Privacy Policy
        </a>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 border-t border-ink-100 pt-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="agree" required className="mt-0.5 size-5 shrink-0 accent-ocean" />
          <span className="font-semibold">I agree to the Terms of Service and Privacy Policy.</span>
        </label>
        {state && !state.ok ? <Notice tone="error">{state.error}</Notice> : null}
        <SubmitButton pending={pending} pendingText="Saving…">
          Agree and continue
        </SubmitButton>
      </form>
    </Card>
  );
}
