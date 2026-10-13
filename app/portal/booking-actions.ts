"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { handoffOrNull, lengthOrNull, type Availability, type DayAvailability } from "@/lib/booking";
import { rpcError } from "@/lib/booking-server";
import { anyNeeded, detailsNeeded } from "@/lib/client-details";
import { formatMoney } from "@/lib/format";
import { refundVisits } from "@/lib/payments-server";
import { getForm } from "@/lib/content";
import { isYmd } from "@/lib/dates";
import { asksGeneral, bookingQuestions, fieldsForService, missingMessage, readAnswers, unansweredForService } from "@/lib/intake";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, FormAnswers, Handoff, Profile } from "@/lib/types";
import { formString } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OpeningsFor = {
  serviceId: string;
  /** The length picked, for services with a choice. */
  minutes?: number | null;
  /** How many pups are coming (group visits share the walker's time by the dog). */
  pets?: number;
  /** A visit being moved: its own spot counts as free. */
  exclude?: string | null;
};

/** What's still open for a service: per arrival window, or per day for set-time services. */
export async function getAvailability(from: string, to: string, opts: OpeningsFor): Promise<Availability[]> {
  await requireUser();
  if (!isYmd(from) || !isYmd(to) || !UUID.test(opts.serviceId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_availability", openingsArgs(from, to, opts));
  return (data ?? []) as Availability[];
}

function openingsArgs(from: string, to: string, opts: OpeningsFor) {
  return {
    p_from: from,
    p_to: to,
    p_service_id: opts.serviceId,
    p_duration: lengthOrNull(opts.minutes),
    p_pets: opts.pets && opts.pets > 0 ? Math.min(10, Math.round(opts.pets)) : null,
    p_exclude: opts.exclude && UUID.test(opts.exclude) ? opts.exclude : null,
  };
}

/** Full-day and overnight services: open spots per day. */
export async function getServiceDays(serviceId: string, from: string, to: string): Promise<DayAvailability[]> {
  await requireUser();
  if (!UUID.test(serviceId) || !isYmd(from) || !isYmd(to)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("service_availability", { p_service_id: serviceId, p_from: from, p_to: to });
  return (data ?? []) as DayAvailability[];
}

/** Set-time services: start times still open on a day (minutes after midnight). */
export async function getTimeSlots(
  serviceId: string,
  date: string,
  minutes?: number | null,
  pets?: number,
  exclude?: string | null,
): Promise<{ minute: number; window_id: string | null }[]> {
  await requireUser();
  if (!UUID.test(serviceId) || !isYmd(date)) return [];
  const supabase = await createClient();
  const { p_duration, p_pets, p_exclude } = openingsArgs(date, date, { serviceId, minutes, pets, exclude });
  const { data } = await supabase.rpc("time_slots", { p_service_id: serviceId, p_date: date, p_duration, p_pets, p_exclude });
  return (data ?? []) as { minute: number; window_id: string | null }[];
}

export type BookResult = ActionResult & {
  status?: "scheduled" | "requested";
  created?: { id: string; date: string; end_date: string }[];
  skipped?: { date: string; reason: string }[];
};

export type BookInput = {
  serviceId: string;
  petIds: string[];
  dates: string[];
  /** Window visits. */
  windowId?: string | null;
  /** Set-time appointments. */
  arrivalMinute?: number | null;
  /** Overnight stays: check-out date. */
  endDate?: string | null;
  /** Length picked, for services that offer a choice. */
  minutes?: number | null;
  /** How the pup gets to us, for services that ask. */
  handoff?: Handoff | null;
  note: string;
};

/** Books visits. `answers` carries the service's "every booking" questions (f_<id> inputs). */
export async function bookVisits(input: BookInput, answers?: FormData): Promise<BookResult> {
  const user = await requireUser();
  if (!UUID.test(input.serviceId)) return { ok: false, error: "Pick a service." };
  const windowId = input.windowId && UUID.test(input.windowId) ? input.windowId : null;
  const minute = Number.isInteger(input.arrivalMinute) ? Number(input.arrivalMinute) : null;
  const endDate = input.endDate && isYmd(input.endDate) ? input.endDate : null;
  const supabase = await createClient();

  const [form, subRes, serviceRes] = await Promise.all([
    getForm("intake"),
    supabase.from("form_submissions").select("id, answers, service_ids").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
    supabase.from("services").select("audience").eq("id", input.serviceId).maybeSingle(),
  ]);
  const sub = subRes.data;

  // Contact and home details this booking needs that we don't have yet, saved to their profile.
  if (!user.isAdmin && serviceRes.data) {
    const details = readDetails(detailsNeeded(user.profile, serviceRes.data, handoffOrNull(input.handoff)), answers);
    if (details.missing.length) return { ok: false, error: `Please add ${listWords(details.missing)} so we can take good care of your pup.` };
    if (Object.keys(details.patch).length) {
      const { error } = await supabase.from("profiles").update(details.patch).eq("id", user.id);
      if (error) return { ok: false, error: "Couldn’t save your details. Try again." };
    }
  }

  // The service's intake questions (asked once) have to be answered before booking it.
  const general = serviceRes.data ? asksGeneral(serviceRes.data) : false;
  if (form && unansweredForService(form.fields, (sub?.answers as FormAnswers | undefined) ?? {}, input.serviceId, general).some((f) => f.required)) {
    return { ok: false, error: "Please answer the questions for this service first — reload the page to see them." };
  }

  // Questions asked on every booking of this service.
  const questions = form ? bookingQuestions(form.fields, input.serviceId) : [];
  let saved: FormAnswers | null = null;
  if (questions.length) {
    const read = readAnswers(questions, answers ?? new FormData());
    if (read.missing.length) return { ok: false, error: missingMessage(read.missing) };
    saved = read.answers;
  }

  const { data, error } = await supabase.rpc("book_visits", {
    p_service_id: input.serviceId,
    p_pet_ids: (input.petIds ?? []).filter((id) => UUID.test(id)).slice(0, 10),
    p_dates: (input.dates ?? []).filter(isYmd).slice(0, 100),
    p_window_id: windowId,
    p_arrival_minute: minute != null && minute >= 0 && minute < 1440 ? minute : null,
    p_end_date: endDate,
    p_note: typeof input.note === "string" ? input.note.slice(0, 1000) : null,
    p_answers: saved,
    p_duration: lengthOrNull(input.minutes),
    p_handoff: handoffOrNull(input.handoff),
  });
  if (error) return { ok: false, error: rpcError(error) };

  // Remember the service on their profile (no-op if they don't have an intake yet).
  if (sub && !(sub.service_ids as string[]).includes(input.serviceId)) {
    await supabase
      .from("form_submissions")
      .update({ service_ids: [...(sub.service_ids as string[]), input.serviceId] })
      .eq("id", sub.id);
  }

  refresh();
  const result = data as Required<Pick<BookResult, "status" | "created" | "skipped">>;
  return { ok: true, ...result };
}

function readDetails(need: ReturnType<typeof detailsNeeded>, form: FormData | undefined) {
  const patch: Partial<Profile> = {};
  const missing: string[] = [];
  if (!anyNeeded(need)) return { patch, missing };
  const fd = form ?? new FormData();
  const take = (key: string, max: number) => formString(fd, key)?.slice(0, max) ?? null;
  if (need.phone) {
    const phone = take("c_phone", 40);
    if (phone && phone.replace(/\D/g, "").length >= 7) patch.phone = phone;
    else missing.push("a phone number");
  }
  if (need.address) {
    const address = take("c_address", 300);
    if (address) patch.address = address;
    else missing.push("your address");
  }
  if (need.access) {
    const access = take("c_access", 2000);
    if (access) patch.access_notes = access;
    else missing.push("how we get in");
  }
  if (need.emergency) {
    const name = take("c_emergency_name", 120);
    const phone = take("c_emergency_phone", 40);
    if (name && phone) {
      patch.emergency_contact_name = name;
      patch.emergency_contact_phone = phone;
    } else missing.push("an emergency contact");
  }
  if (need.vet) {
    const ok = formString(fd, "c_vet");
    if (ok === "yes" || ok === "no") patch.vet_care_ok = ok === "yes";
    else missing.push("whether we may take your pup to a vet");
  }
  return { patch, missing };
}

function listWords(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export async function cancelVisit(id: string, scope: "one" | "following", reason: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Visit not found." };
  const supabase = await createClient();

  // Visits this will cancel that were paid by card: refunded once they're canceled.
  const { data: visit } = await supabase.from("bookings").select("id, series_id, service_date").eq("id", id).maybeSingle();
  let paid = supabase
    .from("bookings")
    .select("id")
    .eq("user_id", user.id)
    .eq("paid_via", "card")
    .in("status", ["requested", "scheduled"]);
  paid =
    scope === "following" && visit?.series_id
      ? paid.eq("series_id", visit.series_id).gte("service_date", visit.service_date)
      : paid.eq("id", id);
  const { data: paidRows } = await paid;

  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: id,
    p_scope: scope === "following" ? "following" : "one",
    p_reason: reason.slice(0, 500) || null,
  });
  if (error) return { ok: false, error: rpcError(error) };

  let refundNote = "";
  if (paidRows?.length) {
    const { data: canceled } = await supabase
      .from("bookings")
      .select("id")
      .in("id", paidRows.map((r) => r.id as string))
      .eq("status", "canceled");
    const { refunded, failed } = await refundVisits(supabase, (canceled ?? []).map((r) => r.id as string));
    if (refunded) refundNote = ` We’ve refunded ${formatMoney(refunded)} to your card; it usually shows up in 5–10 days.`;
    if (failed) refundNote += " We couldn’t refund part of it automatically, so the team will sort it out for you.";
  }
  refresh();
  const n = Number(data ?? 0);
  return {
    ok: true,
    message: (n > 1 ? `Canceled ${n} visits. We’ve let the team know.` : "Visit canceled. We’ve let the team know.") + refundNote,
  };
}

export async function rescheduleVisit(
  id: string,
  change: { date: string; windowId?: string | null; arrivalMinute?: number | null; endDate?: string | null },
): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(id) || !isYmd(change.date)) return { ok: false, error: "Pick a new day and time." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_booking", {
    p_booking_id: id,
    p_date: change.date,
    p_window_id: change.windowId && UUID.test(change.windowId) ? change.windowId : null,
    p_arrival_minute: Number.isInteger(change.arrivalMinute) ? change.arrivalMinute : null,
    p_end_date: change.endDate && isYmd(change.endDate) ? change.endDate : null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Done! You’ll get an email with the new time." };
}

/** Adds a service to the client's profile and saves the intake questions tied to it. */
export async function addService(serviceId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!UUID.test(serviceId)) return { ok: false, error: "Service not found." };
  const supabase = await createClient();
  const [form, serviceRes, existingRes] = await Promise.all([
    getForm("intake"),
    supabase.from("services").select("id, name, audience").eq("id", serviceId).eq("active", true).maybeSingle(),
    supabase.from("form_submissions").select("answers, service_ids").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!serviceRes.data) return { ok: false, error: "That service isn’t available right now." };

  const fields = form ? fieldsForService(form.fields, serviceId, "once", asksGeneral(serviceRes.data)) : [];
  const { answers, missing } = readAnswers(fields, formData);
  if (missing.length) return { ok: false, error: missingMessage(missing) };

  const existing = existingRes.data;
  const serviceIds = [...new Set([...((existing?.service_ids as string[] | undefined) ?? []), serviceId])];
  const { error } = await supabase.from("form_submissions").upsert(
    {
      form_slug: "intake",
      user_id: user.id,
      answers: { ...((existing?.answers as FormAnswers | undefined) ?? {}), ...answers },
      service_ids: serviceIds,
    },
    { onConflict: "form_slug,user_id" },
  );
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: `${serviceRes.data.name} added! 🐾` };
}
