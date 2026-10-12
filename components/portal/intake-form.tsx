"use client";

import { useActionState } from "react";
import { submitIntake } from "@/app/portal/actions";
import { DynamicFormFields } from "@/components/forms/dynamic-form-fields";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormAnswers, FormField } from "@/lib/types";

export function IntakeForm({
  fields,
  answers,
  submitted,
}: {
  fields: FormField[];
  answers: FormAnswers;
  submitted: boolean;
}) {
  const [state, action] = useActionState(submitIntake, null);
  return (
    <form action={action} className="space-y-6">
      <Card>
        <DynamicFormFields fields={fields} answers={answers} />
      </Card>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="lg" pendingText="Sending…">
        {submitted ? "Update my answers" : "Submit intake form"}
      </SubmitButton>
    </form>
  );
}
