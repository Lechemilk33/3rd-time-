"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { Availability } from "@/lib/booking";
import { rpcError } from "@/lib/booking-server";
import { getForm } from "@/lib/content";
import { isYmd } from "@/lib/dates";
import { fieldsForService, missingMessage, readAnswers } from "@/lib/intake";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, FormAnswers } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAvailability(from: string, to: string): Promise<Availability[]> {
  await requireUser();
  if (!isYmd(from) || !isYmd(to)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_availability", { p_from: from, p_to: to });
  return (data ?? []) as Availability[];
}

export type BookResult = ActionResult & {
  status?: "scheduled" | "requested";
  created?: { id: string; date: string }[];
  skipped?: { date: string; reason: string }[];
};

export async function bookVisits(input: {
  serviceId: string;
  petIds: string[];
  dates: string[];
  windowId: string;
  note: string;
}): Promise<BookResult> {
  const user = await requireUser();
  if (!UUID.test(input.serviceId) || !UUID.test(input.windowId)) return { ok: false, error: "Pick a service and a time." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_visits", {
    p_service_id: input.serviceId,
    p_pet_ids: (input.petIds ?? []).filter((id) => UUID.test(id)).slice(0, 10),
    p_dates: (input.dates ?? []).filter(isYmd).slice(0, 100),
    p_window_id: input.windowId,
    p_note: typeof input.note === "string" ? input.note.slice(0, 1000) : null,
  });
  if (error) return { ok: false, error: rpcError(error) };

  // Remember the service on their profile (no-op if they don't have an intake yet).
  const { data: sub } = await supabase
    .from("form_submissions")
    .select("id, service_ids")
    .eq("form_slug", "intake")
    .eq("user_id", user.id)
    .maybeSingle();
  if (sub && !(sub.service_ids as string[]).includes(input.serviceId)) {
    await supabase
      .from("form_submissions")
      .update({ service_ids: [...(sub.service_ids as string[]), input.serviceId] })
      .eq("id", sub.id);
  }

  refresh();
  const result = data as { status: "scheduled" | "requested"; created: { id: string; date: string }[]; skipped: { date: string; reason: string }[] };
  return { ok: true, ...result };
}

export async function cancelVisit(id: string, scope: "one" | "following", reason: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Visit not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: id,
    p_scope: scope === "following" ? "following" : "one",
    p_reason: reason.slice(0, 500) || null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  const n = Number(data ?? 0);
  return { ok: true, message: n > 1 ? `Canceled ${n} visits. We’ve let the team know.` : "Visit canceled. We’ve let the team know." };
}

export async function rescheduleVisit(id: string, date: string, windowId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(id) || !isYmd(date) || !UUID.test(windowId)) return { ok: false, error: "Pick a new day and time." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_booking", { p_booking_id: id, p_date: date, p_window_id: windowId });
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
    supabase.from("services").select("id, name").eq("id", serviceId).eq("active", true).maybeSingle(),
    supabase.from("form_submissions").select("answers, service_ids").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!serviceRes.data) return { ok: false, error: "That service isn’t available right now." };

  const fields = form ? fieldsForService(form.fields, serviceId) : [];
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
