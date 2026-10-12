import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import type { FormAnswers, FormField } from "@/lib/types";

/** Renders intake-form fields built in the admin portal. Inputs are named `f_<field id>`. */
export function DynamicFormFields({ fields, answers }: { fields: FormField[]; answers: FormAnswers }) {
  return (
    <div className="space-y-6">
      {fields.map((field) => {
        const name = `f_${field.id}`;
        const id = `field-${field.id}`;
        const value = answers[field.id];
        const text = typeof value === "string" ? value : "";

        if (field.type === "heading") {
          return (
            <h2 key={field.id} className="border-b border-ink-100 pt-4 pb-2 text-xl font-semibold text-ink first:pt-0">
              {field.label}
            </h2>
          );
        }

        if (field.type === "agreement") {
          return (
            <label key={field.id} className="flex items-start gap-3 rounded-2xl bg-sea-50 p-4 font-semibold">
              <Checkbox name={name} defaultChecked={value === true} required={field.required} className="mt-0.5" />
              <span>
                {field.label}
                {field.required ? <span className="ml-0.5 text-coral">*</span> : null}
                {field.help ? <span className="mt-1 block text-sm font-normal text-ink-600">{field.help}</span> : null}
              </span>
            </label>
          );
        }

        if (field.type === "checkboxes" || field.type === "radio" || field.type === "yesno") {
          const options = field.type === "yesno" ? ["Yes", "No"] : (field.options ?? []);
          const selected = Array.isArray(value) ? value : [text];
          return (
            <fieldset key={field.id}>
              <legend className="mb-2 text-sm font-bold text-ink">
                {field.label}
                {field.required ? <span className="ml-0.5 text-coral">*</span> : null}
              </legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink-100 bg-white px-4 py-2 font-semibold has-[:checked]:border-ocean has-[:checked]:bg-sea-50"
                  >
                    <input
                      type={field.type === "checkboxes" ? "checkbox" : "radio"}
                      name={name}
                      value={option}
                      defaultChecked={selected.includes(option)}
                      required={field.required && field.type !== "checkboxes"}
                      className="accent-ocean"
                    />
                    {option}
                  </label>
                ))}
              </div>
              {field.help ? <p className="mt-1.5 text-sm text-ink-600">{field.help}</p> : null}
            </fieldset>
          );
        }

        let control;
        if (field.type === "textarea") {
          control = <Textarea id={id} name={name} defaultValue={text} required={field.required} rows={3} />;
        } else if (field.type === "select") {
          control = (
            <Select id={id} name={name} defaultValue={text} required={field.required}>
              <option value="">Choose…</option>
              {(field.options ?? []).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          );
        } else {
          const type =
            field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
          control = <Input id={id} name={name} type={type} defaultValue={text} required={field.required} />;
        }

        return (
          <Field key={field.id} label={field.label} htmlFor={id} help={field.help} required={field.required}>
            {control}
          </Field>
        );
      })}
    </div>
  );
}

/** Read-only view of a submission, used in the admin client profile. */
export function FormAnswersView({ fields, answers }: { fields: FormField[]; answers: FormAnswers }) {
  return (
    <dl className="space-y-4">
      {fields.map((field) => {
        if (field.type === "heading") {
          return (
            <h3 key={field.id} className="border-b border-ink-100 pt-3 pb-1 font-display text-lg font-semibold">
              {field.label}
            </h3>
          );
        }
        const value = answers[field.id];
        const display = Array.isArray(value)
          ? value.join(", ")
          : typeof value === "boolean"
            ? value
              ? "✅ Agreed"
              : "—"
            : value;
        return (
          <div key={field.id}>
            <dt className="text-sm font-bold text-ink-600">{field.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-ink">{display || "—"}</dd>
          </div>
        );
      })}
    </dl>
  );
}
