"use client";

import { saveInstagramToken } from "@/app/admin/_actions/instagram";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";

/** Connects Instagram with a token generated in the Meta dashboard. It's checked with Instagram, then stored in Vault. */
export function InstagramTokenForm() {
  const [state, onSubmit, pending] = useFormAction(saveInstagramToken);
  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-3">
      <Field label="Instagram access token" htmlFor="instagram-token" help="Saved securely and never shown again.">
        <Input
          id="instagram-token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="IGAA…"
          className="font-mono text-sm"
          required
        />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="sm" variant="secondary" pendingText="Checking with Instagram…" pending={pending}>
        Save token
      </SubmitButton>
    </form>
  );
}
