import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { askedEachBooking } from "@/lib/intake";
import type { FormAnswers, FormField } from "@/lib/types";

/**
 * Renders intake-form fields built in the admin portal. Inputs are named `f_<field id>`.
 * Fields not in `visible` stay mounted (so nothing typed is lost) but are hidden and optional.
 */
export function DynamicFormFields({
  fields,
  answers,
  visible,
  serviceNames,
}: {
  fields: FormField[];
  answers: FormAnswers;
  visible?: Set<string>;
  /** Shows a "For Drop-In Visit" tag on questions tied to services. */
  serviceNames?: Map<string, string>;
}) {
  return (
    <div className="space-y-6">
      {fields.map((field) => {
        const shown = !visible || visible.has(field.id);
        const required = shown && field.required;
        const name = `f_${field.id}`;
        const id = `field-${field.id}`;
        const value = answers[field.id];
        const text = typeof value === "string" ? value : "";
        const tag =
          serviceNames && field.services?.length ? (
            <span className="ml-2 inline-flex rounded-full bg-sun-100 px-2 py-0.5 align-middle text-[11px] font-extrabold text-ink">
              For {field.services.map((s) => serviceNames.get(s)).filter(Boolean).join(" / ")}
            </span>
          ) : null;

        let content;
        if (field.type === "heading") {
          content = (
            <h2 className="border-b border-ink-100 pt-4 pb-2 text-xl font-semibold text-ink">
              {field.label}
              {tag}
            </h2>
          );
        } else if (field.type === "agreement") {
          content = (
            <label className="flex items-start gap-3 rounded-2xl bg-sea-50 p-4 font-semibold">
              <input type="hidden" name={`${name}__present`} value="1" />
              <Checkbox name={name} defaultChecked={value === true} required={required} className="mt-0.5" />
              <span>
                {field.label}
                {field.required ? <span className="ml-0.5 text-coral">*</span> : null}
                {tag}
                {field.help ? <span className="mt-1 block text-sm font-normal text-ink-600">{field.help}</span> : null}
              </span>
            </label>
          );
        } else if (field.type === "checkboxes" || field.type === "radio" || field.type === "yesno") {
          const options = field.type === "yesno" ? ["Yes", "No"] : (field.options ?? []);
          const selected = Array.isArray(value) ? value : [text];
          content = (
            <fieldset>
              {field.type === "checkboxes" ? <input type="hidden" name={`${name}__present`} value="1" /> : null}
              <legend className="mb-2 text-sm font-bold text-ink">
                {field.label}
                {field.required ? <span className="ml-0.5 text-coral">*</span> : null}
                {tag}
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
                      required={required && field.type !== "checkboxes"}
                      className="accent-ocean"
                    />
                    {option}
                  </label>
                ))}
              </div>
              {field.help ? <p className="mt-1.5 text-sm text-ink-600">{field.help}</p> : null}
            </fieldset>
          );
        } else {
          let control;
          if (field.type === "textarea") {
            control = <Textarea id={id} name={name} defaultValue={text} required={required} rows={3} />;
          } else if (field.type === "select") {
            control = (
              <Select id={id} name={name} defaultValue={text} required={required}>
                <option value="">Choose…</option>
                {(field.options ?? []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            );
          } else {
            const type =
              field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
            control = <Input id={id} name={name} type={type} defaultValue={text} required={required} />;
          }
          content = (
            <Field
              label={
                <>
                  {field.label}
                  {tag}
                </>
              }
              htmlFor={id}
              help={field.help}
              required={field.required}
            >
              {control}
            </Field>
          );
        }

        return (
          <div key={field.id} hidden={!shown} className="first:[&>h2]:pt-0">
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** Read-only view of a submission, used in the admin client profile. */
export function FormAnswersView({
  fields,
  answers,
  serviceIds,
  serviceNames,
}: {
  fields: FormField[];
  answers: FormAnswers;
  serviceIds?: string[];
  serviceNames?: Map<string, string>;
}) {
  // Per-booking questions are shown on each booking instead.
  const shown = fields.filter(
    (f) =>
      !askedEachBooking(f) &&
      (!f.services?.length || !serviceIds || f.services.some((s) => serviceIds.includes(s)) || answers[f.id] !== undefined),
  );
  return (
    <dl className="space-y-4">
      {shown.map((field) => {
        const tag =
          serviceNames && field.services?.length ? (
            <span className="ml-2 rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-extrabold text-ink">
              {field.services.map((s) => serviceNames.get(s)).filter(Boolean).join(" / ")}
            </span>
          ) : null;
        if (field.type === "heading") {
          return (
            <h3 key={field.id} className="border-b border-ink-100 pt-3 pb-1 font-display text-lg font-semibold">
              {field.label}
              {tag}
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
            <dt className="text-sm font-bold text-ink-600">
              {field.label}
              {tag}
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-ink">{display || "—"}</dd>
          </div>
        );
      })}
    </dl>
  );
}
