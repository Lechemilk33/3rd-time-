import type { FormAnswers, FormField } from "@/lib/types";

/**
 * One intake form for everyone. Questions can be tied to services ("only ask people who signed
 * up for Drop-In Visits"), so each client answers what applies to them.
 */

const DETAIL_TYPES = new Set<FormField["type"]>(["yesno", "radio", "select", "checkboxes"]);

/** Choice questions can carry an optional "Tell us more" notes box. */
export function canHaveDetails(type: FormField["type"]) {
  return DETAIL_TYPES.has(type);
}

export function hasDetails(field: FormField) {
  return Boolean(field.details) && canHaveDetails(field.type);
}

/** Where a question's notes are saved in the answers ("treats_ok" → "treats_ok__details"). */
export function detailsKey(fieldId: string) {
  return `${fieldId}__details`;
}

export function appliesTo(field: FormField, serviceIds: readonly string[]) {
  return !field.services?.length || field.services.some((id) => serviceIds.includes(id));
}

/** Asked every time one of its services is booked, instead of once on the intake form. */
export function askedEachBooking(field: FormField) {
  return field.ask === "each" && Boolean(field.services?.length);
}

function dropEmptyHeadings(shown: FormField[]) {
  return shown.filter((f, i) => {
    if (f.type !== "heading") return true;
    const next = shown[i + 1];
    return Boolean(next && next.type !== "heading");
  });
}

/** Intake questions a client with these services should see. Headings with nothing under them are dropped. */
export function visibleFields(fields: FormField[], serviceIds: readonly string[]): FormField[] {
  return dropEmptyHeadings(fields.filter((f) => !askedEachBooking(f) && appliesTo(f, serviceIds)));
}

/**
 * The questions for one service (plus the headings above them): the ones asked once by default, or
 * the ones asked on every booking. With `general`, the "everyone" questions (not tied to a service)
 * are included too: they're asked once, the first time a client books a regular visit.
 */
export function fieldsForService(
  fields: FormField[],
  serviceId: string,
  when: "once" | "each" = "once",
  general = false,
): FormField[] {
  const out: FormField[] = [];
  let heading: FormField | null = null;
  const wanted = (f: FormField) =>
    (f.services?.length ? f.services.includes(serviceId) : general && when === "once") && askedEachBooking(f) === (when === "each");
  for (const f of fields) {
    if (f.type === "heading") {
      heading = wanted(f) ? f : null;
      continue;
    }
    if (!wanted(f)) continue;
    if (heading) {
      out.push(heading);
      heading = null;
    }
    out.push(f);
  }
  return out;
}

/** Questions asked each time this service is booked. */
export function bookingQuestions(fields: FormField[], serviceId: string): FormField[] {
  return fieldsForService(fields, serviceId, "each");
}

/** "Label: answer" pairs for showing saved answers. */
export function answerRows(fields: FormField[], answers: FormAnswers | null | undefined) {
  if (!answers) return [];
  const rows: { id: string; label: string; value: string }[] = [];
  const known = new Set<string>();
  for (const f of fields) {
    if (f.type === "heading") continue;
    known.add(f.id);
    known.add(detailsKey(f.id));
    const v = answers[f.id];
    const note = answers[detailsKey(f.id)];
    const noteText = typeof note === "string" ? note.trim() : "";
    if (!isAnswered(f, v) && !noteText) continue;
    const main = !isAnswered(f, v) ? "" : Array.isArray(v) ? v.join(", ") : v === true ? "Yes" : String(v);
    rows.push({ id: f.id, label: f.label, value: [main, noteText].filter(Boolean).join(" — ") });
  }
  for (const [id, v] of Object.entries(answers)) {
    if (known.has(id) || id.endsWith("__details") || v === "" || v == null || (Array.isArray(v) && !v.length)) continue;
    rows.push({ id, label: "Earlier question", value: Array.isArray(v) ? v.join(", ") : v === true ? "Yes" : String(v) });
  }
  return rows;
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
export function unansweredForService(fields: FormField[], answers: FormAnswers, serviceId: string, general = false) {
  return fieldsForService(fields, serviceId, "once", general).filter((f) => f.type !== "heading" && !isAnswered(f, answers[f.id]));
}

/** The "everyone" questions are asked before regular visits, not before the meet & greet. */
export const asksGeneral = (service: { audience: string }) => service.audience !== "everyone";

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
    // The optional notes box is read even when the choice itself was left blank.
    if (hasDetails(field) && formData.has(`${key}__details`)) {
      answers[detailsKey(field.id)] = String(formData.get(`${key}__details`) ?? "").trim().slice(0, 2000);
    }
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
