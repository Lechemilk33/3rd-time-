"use client";

import { updateProfile } from "@/app/portal/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Profile } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const [state, onSubmit, pending] = useFormAction(updateProfile);
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name" required>
            <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} required autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="email" help="This is your login email.">
            <Input id="email" value={email} disabled readOnly />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" />
          </Field>
          <Field label="Home address" htmlFor="address">
            <Input id="address" name="address" defaultValue={profile.address ?? ""} autoComplete="street-address" />
          </Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Emergency contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="emergency_contact_name">
            <Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={profile.emergency_contact_name ?? ""} />
          </Field>
          <Field label="Phone" htmlFor="emergency_contact_phone">
            <Input
              id="emergency_contact_phone"
              name="emergency_contact_phone"
              type="tel"
              defaultValue={profile.emergency_contact_phone ?? ""}
            />
          </Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Getting in</h2>
        <Field
          label="Home access notes"
          htmlFor="access_notes"
          help="Gate or lockbox codes, where the leash lives, parking tips. Only you and our team can see this."
        >
          <Textarea id="access_notes" name="access_notes" defaultValue={profile.access_notes ?? ""} rows={4} />
        </Field>
      </Card>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="lg" pendingText="Saving…" pending={pending}>
        Save profile
      </SubmitButton>
    </form>
  );
}
