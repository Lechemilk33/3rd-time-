"use client";

import { Home, ShieldPlus } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SOMEONE_HOME, type DetailsNeeded } from "@/lib/client-details";
import { cn } from "@/lib/utils";

export type DetailsValues = {
  phone: string;
  address: string;
  access: string;
  emergencyName: string;
  emergencyPhone: string;
  vet: "" | "yes" | "no";
};

export const EMPTY_DETAILS: DetailsValues = { phone: "", address: "", access: "", emergencyName: "", emergencyPhone: "", vet: "" };

/** What's still blank, in words for the "Book it" hint, or null when everything needed is filled in. */
export function detailsGap(need: DetailsNeeded, v: DetailsValues): string | null {
  if (need.phone && v.phone.replace(/\D/g, "").length < 7) return "Add a phone number.";
  if (need.address && !v.address.trim()) return "Add your address.";
  if (need.access && !v.access.trim()) return "Tell us how to get in.";
  if (need.emergency && (!v.emergencyName.trim() || !v.emergencyPhone.trim())) return "Add an emergency contact.";
  if (need.vet && !v.vet) return "Answer the vet question.";
  return null;
}

/**
 * Contact and home details the booking needs and we don't have yet. They're sent with the booking
 * form (`form` attribute) and saved to the client's profile, so this only shows up once.
 */
export function ClientDetailsFields({
  need,
  values,
  onChange,
  formId,
  petLabel,
  meetGreet,
}: {
  need: DetailsNeeded;
  values: DetailsValues;
  onChange: (next: DetailsValues) => void;
  formId: string;
  petLabel: string;
  meetGreet: boolean;
}) {
  const set = (patch: Partial<DetailsValues>) => onChange({ ...values, ...patch });
  return (
    <div className="space-y-5">
      <p className="text-ink-600">
        {meetGreet
          ? "So we know where to find you, and how to reach you if anything changes."
          : "Just once. We’ll keep these on your profile, where you can change them anytime."}
      </p>

      {need.phone || need.address ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {need.phone ? (
            <Field label="Mobile number" htmlFor="c_phone" required help="We’ll text you when we’re on the way.">
              <Input
                id="c_phone"
                name="c_phone"
                form={formId}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                value={values.phone}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </Field>
          ) : null}
          {need.address ? (
            <Field
              label="Your address"
              htmlFor="c_address"
              required
              help={meetGreet ? `Where we’ll meet ${petLabel}.` : "Where we’ll pick up your pup."}
              className={cn(!need.phone && "sm:col-span-2")}
            >
              <Input
                id="c_address"
                name="c_address"
                form={formId}
                autoComplete="street-address"
                required
                value={values.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {need.access ? (
        <section className="space-y-2 rounded-2xl bg-sea-50/60 p-4">
          <p className="flex items-center gap-2 font-bold">
            <Home className="size-4 text-ocean" aria-hidden /> How do we get in?
          </p>
          <button
            type="button"
            aria-pressed={values.access === SOMEONE_HOME}
            onClick={() => set({ access: values.access === SOMEONE_HOME ? "" : SOMEONE_HOME })}
            className={cn(
              "rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition",
              values.access === SOMEONE_HOME ? "border-ocean bg-white text-ocean" : "border-ink-100 bg-white text-ink-600 hover:border-ink-200",
            )}
          >
            Someone will be home
          </button>
          <Textarea
            id="c_access"
            name="c_access"
            form={formId}
            aria-label="How do we get in?"
            rows={3}
            required
            maxLength={2000}
            value={values.access}
            onChange={(e) => set({ access: e.target.value })}
            placeholder="Lockbox by the side gate, code 1234. Leash hangs by the front door."
          />
          <p className="text-xs text-ink-600">Only you and our team can see this.</p>
        </section>
      ) : null}

      {need.emergency || need.vet ? (
        <section className="space-y-4 rounded-2xl bg-sea-50/60 p-4">
          <p className="flex items-center gap-2 font-bold">
            <ShieldPlus className="size-4 text-ocean" aria-hidden /> Just in case
          </p>
          {need.emergency ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Emergency contact" htmlFor="c_emergency_name" required help="Someone we can call if we can’t reach you.">
                <Input
                  id="c_emergency_name"
                  name="c_emergency_name"
                  form={formId}
                  required
                  placeholder="Name"
                  value={values.emergencyName}
                  onChange={(e) => set({ emergencyName: e.target.value })}
                />
              </Field>
              <Field label="Their phone" htmlFor="c_emergency_phone" required>
                <Input
                  id="c_emergency_phone"
                  name="c_emergency_phone"
                  form={formId}
                  type="tel"
                  inputMode="tel"
                  required
                  value={values.emergencyPhone}
                  onChange={(e) => set({ emergencyPhone: e.target.value })}
                />
              </Field>
            </div>
          ) : null}
          {need.vet ? (
            <fieldset>
              <legend className="mb-2 text-sm font-bold">
                If {petLabel} ever needs urgent care and we can’t reach anyone, may we take them to a vet?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["yes", "Yes, go ahead", "Your vet or the nearest emergency vet."],
                    ["no", "No, keep trying us", "We’ll stay with your pup and keep calling."],
                  ] as const
                ).map(([value, label, help]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-ink-100 bg-white p-3 has-[:checked]:border-ocean has-[:checked]:bg-sea-50"
                  >
                    <input
                      type="radio"
                      name="c_vet"
                      form={formId}
                      value={value}
                      required
                      checked={values.vet === value}
                      onChange={() => set({ vet: value })}
                      className="mt-1 size-4 accent-ocean"
                    />
                    <span>
                      <span className="block font-bold">{label}</span>
                      <span className="block text-sm text-ink-600">{help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
