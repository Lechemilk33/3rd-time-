"use client";

import { CalendarPlus, CircleCheck } from "lucide-react";
import { addService } from "@/app/portal/booking-actions";
import { DynamicFormFields } from "@/components/forms/dynamic-form-fields";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormAnswers, FormField } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";

export function AddServiceForm({
  service,
  fields,
  answers,
  already,
  canBook,
}: {
  service: { id: string; name: string; description: string | null };
  fields: FormField[];
  answers: FormAnswers;
  already: boolean;
  canBook: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction(addService.bind(null, service.id));
  const questions = fields.filter((f) => f.type !== "heading").length;

  if (state?.ok) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CircleCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h2 className="mt-3 font-display text-2xl font-semibold">{state.message}</h2>
        <p className="mt-1 text-ink-600">We’ve saved your answers.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {canBook ? (
            <ButtonLink href={`/portal/book?service=${service.id}`} className="h-auto min-h-11 py-2 whitespace-normal">
              <CalendarPlus className="size-4" aria-hidden /> Book {service.name}
            </ButtonLink>
          ) : null}
          <ButtonLink href="/portal" variant="outline">
            Back home
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      {service.description ? <p className="text-lg text-ink-600">{service.description}</p> : null}
      {questions ? (
        <Card>
          <h2 className="mb-1 text-xl font-semibold">A few questions first</h2>
          <p className="mb-5 text-sm text-ink-600">
            {already ? "Keep these up to date so your walker knows what to do." : "So we can take great care of your pup with this service."}
          </p>
          <DynamicFormFields fields={fields} answers={answers} />
        </Card>
      ) : (
        <Notice tone="info">No extra questions for this one — just add it to your services.</Notice>
      )}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton size="lg" pendingText="Saving…" pending={pending} className="h-auto min-h-13 py-3 whitespace-normal">
        {already ? "Save answers" : `Add ${service.name}`}
      </SubmitButton>
    </form>
  );
}
