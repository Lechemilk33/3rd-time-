"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isYmd } from "@/lib/dates";
import { RECORDS_BUCKET, VACCINES, type StagedRecord } from "@/lib/records";
import { readStagedRecords, recordRows } from "@/lib/records-server";
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
// Vaccine records
// ---------------------------------------------------------------------------

/** Records the team adds for a client (say, ones their vet emailed over). */
export async function addPetRecordsAsTeam(petId: string, files: StagedRecord[]): Promise<ActionResult> {
  const supabase = await adminClient();
  const { data: pet } = await supabase.from("pets").select("owner_id").eq("id", petId).maybeSingle();
  if (!pet) return { ok: false, error: "Pup not found." };
  const list = readStagedRecords(files, pet.owner_id as string);
  if (!list.length) return { ok: false, error: "Nothing to add." };
  const { error } = await supabase.from("pet_records").insert(recordRows(list, petId, pet.owner_id as string));
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function removePetRecordAsTeam(recordId: string): Promise<ActionResult> {
  const supabase = await adminClient();
  const { data: file } = await supabase.from("pet_records").select("id, path").eq("id", recordId).maybeSingle();
  if (!file) return { ok: false, error: "That file is already gone." };
  await supabase.storage.from(RECORDS_BUCKET).remove([file.path as string]);
  const { error } = await supabase.from("pet_records").delete().eq("id", file.id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Saves how long each shot is good for and marks the pup's records as checked. */
export async function checkPetRecords(petId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const supabase = await adminClient();
  const patch: Record<string, string | null> = {
    records_checked_at: new Date().toISOString(),
    records_note: clampText(formData.get("records_note"), 300).trim() || null,
  };
  for (const v of VACCINES) {
    const value = String(formData.get(v.key) ?? "");
    if (value && !isYmd(value)) return { ok: false, error: `Check the date for ${v.name}.` };
    patch[v.key] = value || null;
  }
  const { error } = await supabase.from("pets").update(patch).eq("id", petId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Saved. Records checked ✓" };
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
