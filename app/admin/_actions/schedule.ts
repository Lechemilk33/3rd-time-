"use server";

import { refresh } from "next/cache";
import { rpcError } from "@/lib/booking-server";
import { isYmd } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { adminClient, clampText } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export type RulesInput = {
  booking_enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
  cancel_cutoff_hours: number;
  admin_alerts: boolean;
  client_reminders: boolean;
  walker_digest: boolean;
  reminder_hour: number;
  reply_to: string;
};

export async function saveBookingRules(input: RulesInput): Promise<ActionResult> {
  const supabase = await adminClient();
  const replyTo = clampText(input.reply_to, 200).trim();
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(replyTo)) return { ok: false, error: "Enter a valid reply-to email." };
  const { error } = await supabase
    .from("booking_settings")
    .update({
      booking_enabled: Boolean(input.booking_enabled),
      min_notice_hours: int(input.min_notice_hours, 0, 336, 12),
      max_days_ahead: int(input.max_days_ahead, 1, 365, 60),
      cancel_cutoff_hours: int(input.cancel_cutoff_hours, 0, 336, 12),
      admin_alerts: Boolean(input.admin_alerts),
      client_reminders: Boolean(input.client_reminders),
      walker_digest: Boolean(input.walker_digest),
      reminder_hour: int(input.reminder_hour, 0, 23, 18),
      reply_to: replyTo,
    })
    .eq("id", 1);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Booking rules saved." };
}

export type WindowInput = { id?: string; label: string; start_minute: number; end_minute: number; active: boolean };

export async function saveWindow(input: WindowInput): Promise<ActionResult> {
  const supabase = await adminClient();
  const label = clampText(input.label, 40).trim();
  const start = int(input.start_minute, 0, 1439, 480);
  const end = int(input.end_minute, 1, 1440, 660);
  if (!label) return { ok: false, error: "Give the window a name, like “Midday”." };
  if (end <= start) return { ok: false, error: "The window has to end after it starts." };
  const row = { label, start_minute: start, end_minute: end, active: Boolean(input.active), position: Math.floor(start / 15) };
  const { error } =
    input.id && UUID.test(input.id)
      ? await supabase.from("booking_windows").update(row).eq("id", input.id)
      : await supabase.from("booking_windows").insert(row);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

/** Windows with visits on them are hidden instead of deleted, so history stays intact. */
export async function deleteWindow(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const supabase = await adminClient();
  const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("window_id", id);
  const { error } = count
    ? await supabase.from("booking_windows").update({ active: false }).eq("id", id)
    : await supabase.from("booking_windows").delete().eq("id", id);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: count ? "Hidden (it has visits, so we kept it for your records)." : "Deleted." };
}

export type WalkerInput = { profile_id: string; display_name: string; color: string; active: boolean };

export async function saveWalker(input: WalkerInput): Promise<ActionResult> {
  if (!UUID.test(input.profile_id)) return { ok: false, error: "Not found." };
  const supabase = await adminClient();
  const name = clampText(input.display_name, 40).trim();
  if (!name) return { ok: false, error: "Add a name." };
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#1A6FA0";
  const { error } = await supabase
    .from("walkers")
    .update({ display_name: name, color, active: Boolean(input.active) })
    .eq("profile_id", input.profile_id);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function saveAvailability(
  walkerId: string,
  cells: { weekday: number; window_id: string; capacity: number }[],
): Promise<ActionResult> {
  if (!UUID.test(walkerId)) return { ok: false, error: "Not found." };
  const supabase = await adminClient();
  const rows = cells
    .filter((c) => UUID.test(c.window_id) && c.weekday >= 1 && c.weekday <= 7)
    .map((c) => ({ walker_id: walkerId, weekday: c.weekday, window_id: c.window_id, capacity: int(c.capacity, 0, 50, 0) }));
  const { error } = await supabase.from("walker_availability").upsert(rows, { onConflict: "walker_id,weekday,window_id" });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Availability saved." };
}

export type TimeOffInput = { walker_id: string | null; start_date: string; end_date: string; window_id: string | null; note: string };

export async function addTimeOff(input: TimeOffInput): Promise<ActionResult> {
  if (!isYmd(input.start_date) || !isYmd(input.end_date)) return { ok: false, error: "Pick the dates." };
  if (input.end_date < input.start_date) return { ok: false, error: "The end date is before the start date." };
  const supabase = await adminClient();
  const { error } = await supabase.from("time_off").insert({
    walker_id: input.walker_id && UUID.test(input.walker_id) ? input.walker_id : null,
    window_id: input.window_id && UUID.test(input.window_id) ? input.window_id : null,
    start_date: input.start_date,
    end_date: input.end_date,
    note: clampText(input.note, 200).trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Time off added. Clients can’t book those times." };
}

export async function deleteTimeOff(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const supabase = await adminClient();
  const { error } = await supabase.from("time_off").delete().eq("id", id);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Removed." };
}

export async function resetCalendarFeed(): Promise<ActionResult & { token?: string }> {
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("reset_calendar_feed");
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, token: data as string, message: "New calendar link ready. The old one stopped working." };
}

export async function sendTestEmail(): Promise<ActionResult> {
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("send_test_email");
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, message: `Test email sent to ${data}. It should arrive within a minute.` };
}
