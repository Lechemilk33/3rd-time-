"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult, BookingStatus, SubmissionStatus } from "@/lib/types";
import { adminClient, clampText } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function setSubmissionStatus(submissionId: string, status: SubmissionStatus): Promise<void> {
  if (!["submitted", "reviewed", "approved"].includes(status)) return;
  const supabase = await adminClient();
  await supabase.from("form_submissions").update({ status }).eq("id", submissionId);
  refresh();
}

export async function saveClientNotes(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const supabase = await adminClient();
  const notes = clampText(formData.get("notes"), 10_000);
  const { error } = await supabase.from("client_notes").upsert({ user_id: userId, notes }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Notes saved." };
}

export async function setClientRole(userId: string, role: "client" | "admin"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id && role !== "admin") {
    return { ok: false, error: "You can’t remove your own admin access." };
  }
  const supabase = await adminClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export type ManualBookingInput = {
  user_id: string;
  pet_id: string;
  service_id: string;
  title: string;
  start_time: string;
  duration_minutes: number;
  notes: string;
};

export async function createBooking(input: ManualBookingInput): Promise<ActionResult> {
  const supabase = await adminClient();
  const start = new Date(input.start_time);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Pick a date and time." };
  const minutes = Math.max(5, Math.min(24 * 60, Math.round(input.duration_minutes || 30)));
  const end = new Date(start.getTime() + minutes * 60_000);

  let title = clampText(input.title, 120).trim();
  if (!title && UUID.test(input.service_id)) {
    const { data } = await supabase.from("services").select("name").eq("id", input.service_id).maybeSingle();
    title = data?.name ?? "";
  }

  const { error } = await supabase.from("bookings").insert({
    user_id: UUID.test(input.user_id) ? input.user_id : null,
    pet_id: UUID.test(input.pet_id) ? input.pet_id : null,
    service_id: UUID.test(input.service_id) ? input.service_id : null,
    title: title || "Walk",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: "scheduled",
    source: "manual",
    notes: clampText(input.notes, 2000) || null,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Booking added." };
}

export async function setBookingStatus(bookingId: string, status: BookingStatus): Promise<void> {
  if (!["scheduled", "completed", "canceled"].includes(status)) return;
  const supabase = await adminClient();
  await supabase.from("bookings").update({ status }).eq("id", bookingId);
  refresh();
}

export async function deleteBooking(bookingId: string): Promise<void> {
  const supabase = await adminClient();
  await supabase.from("bookings").delete().eq("id", bookingId);
  refresh();
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function setMessageHandled(messageId: string, handled: boolean): Promise<void> {
  const supabase = await adminClient();
  await supabase.from("contact_messages").update({ handled }).eq("id", messageId);
  refresh();
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = await adminClient();
  await supabase.from("contact_messages").delete().eq("id", messageId);
  refresh();
}
