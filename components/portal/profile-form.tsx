"use client";

import { updateProfile } from "@/app/portal/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
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
          <Field label="Address" htmlFor="address">
            <Input id="address" name="address" defaultValue={profile.address ?? ""} autoComplete="street-address" />
          </Field>
        </div>
      </Card>
      <Card id="access" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Getting in</h2>
          <p className="text-sm text-ink-600">For visits when you’re not home. Only you and our team can see this.</p>
        </div>
        <Field label="How do we get in?" htmlFor="access_notes" help="Lockbox or gate codes, where the leash lives, alarm, parking tips.">
          <Textarea id="access_notes" name="access_notes" defaultValue={profile.access_notes ?? ""} rows={4} />
        </Field>
      </Card>
      <Card id="emergency" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Just in case</h2>
          <p className="text-sm text-ink-600">Who we call if we can’t reach you.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Emergency contact" htmlFor="emergency_contact_name">
            <Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={profile.emergency_contact_name ?? ""} />
          </Field>
          <Field label="Their phone" htmlFor="emergency_contact_phone">
            <Input
              id="emergency_contact_phone"
              name="emergency_contact_phone"
              type="tel"
              defaultValue={profile.emergency_contact_phone ?? ""}
            />
          </Field>
          <Field
            label="If your pup needs urgent care and we can’t reach anyone, may we take them to a vet?"
            htmlFor="vet_care_ok"
            className="sm:col-span-2"
          >
            <Select
              id="vet_care_ok"
              name="vet_care_ok"
              defaultValue={profile.vet_care_ok == null ? "" : profile.vet_care_ok ? "yes" : "no"}
              className="sm:max-w-sm"
            >
              <option value="">Not answered yet</option>
              <option value="yes">Yes, go ahead</option>
              <option value="no">No, keep trying to reach us</option>
            </Select>
          </Field>
        </div>
      </Card>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="lg" pendingText="Saving…" pending={pending}>
        Save profile
      </SubmitButton>
    </form>
  );
}
