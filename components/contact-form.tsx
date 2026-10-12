"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/app/actions/contact";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

export function ContactForm() {
  const [state, action] = useActionState(sendContactMessage, null);

  if (state?.ok) {
    return <Notice tone="success" title="Message sent">{state.message}</Notice>;
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="contact-name" required>
          <Input id="contact-name" name="name" autoComplete="name" required maxLength={200} />
        </Field>
        <Field label="Email" htmlFor="contact-email" required>
          <Input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={200} />
        </Field>
      </div>
      <Field label="Phone (optional)" htmlFor="contact-phone">
        <Input id="contact-phone" name="phone" type="tel" autoComplete="tel" maxLength={50} />
      </Field>
      <Field label="How can we help?" htmlFor="contact-message" required>
        <Textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={5000}
          placeholder="Tell us about your pup and what you’re looking for!"
        />
      </Field>
      <div className="hidden" aria-hidden>
        <label>
          Company <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton size="lg" pendingText="Sending…">
        Send message
      </SubmitButton>
    </form>
  );
}
