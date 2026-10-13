"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult, SubmissionStatus } from "@/lib/types";
import { adminClient, clampText } from "./shared";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function setSubmissionStatus(submissionId: string, status: SubmissionStatus): Promise<void> {
  if (!["submitted", "reviewed", "approved"].includes(status)) return;
  const supabase = await adminClient();
  const { data } = await supabase.from("form_submissions").update({ status }).eq("id", submissionId).select("user_id").maybeSingle();
  // Approving someone's intake also lets them book regular visits (and emails them, via a trigger).
  if (status === "approved" && data?.user_id) {
    await supabase.from("profiles").update({ booking_approved: true }).eq("id", data.user_id);
  }
  refresh();
}

/** Approved clients can book every service, not just the meet & greet. */
export async function setBookingApproval(userId: string, approved: boolean): Promise<ActionResult> {
  const supabase = await adminClient();
  const { error } = await supabase.from("profiles").update({ booking_approved: approved }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: approved ? "Approved — they can book everything now. We emailed them." : "Approval removed." };
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
