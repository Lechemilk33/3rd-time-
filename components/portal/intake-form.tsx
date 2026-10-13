"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { submitIntake } from "@/app/portal/actions";
import { DynamicFormFields } from "@/components/forms/dynamic-form-fields";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { servicePrice, serviceTiming } from "@/lib/booking";
import { visibleFields } from "@/lib/intake";
import type { FormAnswers, FormField, Service } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

export function IntakeForm({
  fields,
  answers,
  services,
  selectedServiceIds,
  submitted,
}: {
  fields: FormField[];
  answers: FormAnswers;
  services: Pick<
    Service,
    "id" | "name" | "description" | "price_cents" | "price_label" | "price_unit" | "duration_minutes" | "kind" | "start_minute" | "end_minute"
  >[];
  selectedServiceIds: string[];
  submitted: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction(submitIntake);
  const [selected, setSelected] = useState<string[]>(selectedServiceIds);
  const visible = useMemo(() => new Set(visibleFields(fields, selected).map((f) => f.id)), [fields, selected]);
  const serviceNames = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);
  const extra = fields.filter((f) => f.services?.length && f.type !== "heading" && visible.has(f.id)).length;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {services.length ? (
        <Card>
          <h2 className="text-xl font-semibold">What can we help with?</h2>
          <p className="mt-1 text-sm text-ink-600">
            Pick everything you might want. We’ll only ask about what applies to you — you can add more anytime.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {services.map((s) => {
              const on = selected.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-sea-200",
                    on ? "border-ocean bg-sea-50" : "border-ink-100 hover:border-ink-200",
                  )}
                >
                  <input
                    type="checkbox"
                    name="service_ids"
                    value={s.id}
                    checked={on}
                    onChange={() => setSelected((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition",
                      on ? "border-ocean bg-ocean text-white" : "border-ink-200 bg-white",
                    )}
                  >
                    {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-extrabold">{s.name}</span>
                    <span className="block text-sm text-ink-600">
                      {[serviceTiming(s), servicePrice(s)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {extra ? (
            <p className="mt-3 text-sm font-bold text-ocean">
              + {extra} question{extra === 1 ? "" : "s"} below for the services you picked
            </p>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <DynamicFormFields fields={fields} answers={answers} visible={visible} serviceNames={serviceNames} />
      </Card>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton size="lg" pendingText="Sending…" pending={pending}>
        {submitted ? "Update my answers" : "Submit intake form"}
      </SubmitButton>
    </form>
  );
}
