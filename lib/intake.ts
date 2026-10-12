import type { FormAnswers, FormField } from "@/lib/types";

/**
 * One intake form for everyone. Questions can be tied to services ("only ask people who signed
 * up for Drop-In Visits"), so each client answers what applies to them.
 */

export function appliesTo(field: FormField, serviceIds: readonly string[]) {
  return !field.services?.length || field.services.some((id) => serviceIds.includes(id));
}

/** Fields a client with these services should see. Headings with nothing under them are dropped. */
export function visibleFields(fields: FormField[], serviceIds: readonly string[]): FormField[] {
  const shown = fields.filter((f) => appliesTo(f, serviceIds));
  return shown.filter((f, i) => {
    if (f.type !== "heading") return true;
    const next = shown[i + 1];
    return Boolean(next && next.type !== "heading");
  });
}

/** The questions tied to one service (plus the headings above them). */
export function fieldsForService(fields: FormField[], serviceId: string): FormField[] {
  const out: FormField[] = [];
  let heading: FormField | null = null;
  for (const f of fields) {
    if (f.type === "heading") {
      heading = f.services?.includes(serviceId) ? f : null;
      continue;
    }
    if (!f.services?.includes(serviceId)) continue;
    if (heading) {
      out.push(heading);
      heading = null;
    }
    out.push(f);
  }
  return out;
}

export function isAnswered(field: FormField, value: FormAnswers[string] | undefined) {
  if (field.type === "heading") return true;
  if (field.type === "agreement") return value === true;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim() !== "";
}

/** Required questions that still need an answer. */
export function missingRequired(fields: FormField[], answers: FormAnswers, serviceIds: readonly string[]) {
  return visibleFields(fields, serviceIds).filter((f) => f.required && !isAnswered(f, answers[f.id]));
}

/** Questions for this service the client hasn't answered yet. */
export function unansweredForService(fields: FormField[], answers: FormAnswers, serviceId: string) {
  return fieldsForService(fields, serviceId).filter((f) => f.type !== "heading" && !isAnswered(f, answers[f.id]));
}

/**
 * Reads `f_<id>` inputs from a submitted form. Only `required` questions in `checkFields` are
 * enforced; everything in `fields` that was submitted is saved.
 */
export function readAnswers(
  fields: FormField[],
  formData: FormData,
  checkFields: FormField[] = fields,
): { answers: FormAnswers; missing: string[] } {
  const answers: FormAnswers = {};
  const required = new Set(checkFields.filter((f) => f.required).map((f) => f.id));
  const missing: string[] = [];

  for (const field of fields) {
    if (field.type === "heading") continue;
    const key = `f_${field.id}`;
    if (!formData.has(key) && field.type !== "agreement" && field.type !== "checkboxes") continue;
    let value: string | string[] | boolean;
    if (field.type === "checkboxes") {
      if (!formData.has(`${key}__present`)) continue;
      const options = field.options ?? [];
      value = formData.getAll(key).map(String).filter((v) => options.includes(v));
    } else if (field.type === "agreement") {
      if (!formData.has(`${key}__present`)) continue;
      value = formData.get(key) === "on";
    } else {
      const raw = String(formData.get(key) ?? "").trim().slice(0, 5000);
      value = raw;
      if ((field.type === "select" || field.type === "radio") && raw && !(field.options ?? []).includes(raw)) value = "";
      if (field.type === "yesno" && raw && raw !== "Yes" && raw !== "No") value = "";
    }
    answers[field.id] = value;
  }

  for (const field of checkFields) {
    if (field.type === "heading" || !required.has(field.id)) continue;
    if (!isAnswered(field, answers[field.id])) missing.push(field.label);
  }
  return { answers, missing };
}

export function missingMessage(missing: string[]) {
  return `Please answer: ${missing.slice(0, 3).join(" · ")}${missing.length > 3 ? " …" : ""}`;
}
