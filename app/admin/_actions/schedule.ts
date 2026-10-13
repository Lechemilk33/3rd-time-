"use server";

import { refresh } from "next/cache";
import { rpcError } from "@/lib/booking-server";
import { isYmd } from "@/lib/dates";
import type { BookingWindow } from "@/lib/booking";
import type { ActionResult } from "@/lib/types";
import { adminClient, clampText, publishContentChange } from "./shared";

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
  review_requests: boolean;
  review_url: string | null;
};

export async function saveBookingRules(input: RulesInput): Promise<ActionResult> {
  const supabase = await adminClient();
  const replyTo = clampText(input.reply_to, 200).trim();
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(replyTo)) return { ok: false, error: "Enter a valid reply-to email." };
  const reviewUrl = clampText(input.review_url ?? "", 500).trim() || null;
  if (reviewUrl && !/^https:\/\/[^\s<>"]+$/.test(reviewUrl)) {
    return { ok: false, error: "Paste the full Google review link, starting with https://" };
  }
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
      review_requests: Boolean(input.review_requests),
      review_url: reviewUrl,
    })
    .eq("id", 1);
  if (error) return { ok: false, error: rpcError(error) };
  // The Terms of Service quote the cancellation window.
  publishContentChange();
  return { ok: true, message: "Booking rules saved." };
}

export type WindowInput = { id: string | null; label: string; start_minute: number; end_minute: number; active: boolean };

/**
 * Saves every arrival window at once. Windows taken off the list are deleted, or hidden from clients
 * when visits already use them so past bookings keep their label.
 */
export async function saveWindows(
  input: WindowInput[],
  removedIds: string[],
): Promise<ActionResult & { windows?: BookingWindow[] }> {
  if (!Array.isArray(input) || input.length > 20) return { ok: false, error: "That’s more windows than we can save." };
  const rows = input.map((w) => ({
    id: w.id && UUID.test(w.id) ? w.id : null,
    label: clampText(w.label, 40).trim(),
    start_minute: int(w.start_minute, 0, 1425, 480),
    end_minute: int(w.end_minute, 15, 1440, 660),
    active: Boolean(w.active),
  }));
  if (rows.some((r) => !r.label)) return { ok: false, error: "Give every window a name, like “Morning”." };
  if (rows.some((r) => r.end_minute <= r.start_minute)) return { ok: false, error: "A window has to end after it starts." };
  const live = rows.filter((r) => r.active).sort((a, b) => a.start_minute - b.start_minute);
  for (let i = 1; i < live.length; i++) {
    if (live[i].start_minute < live[i - 1].end_minute) {
      return { ok: false, error: `${live[i - 1].label} and ${live[i].label} overlap. Windows can touch but not overlap.` };
    }
  }
  if (!live.length) return { ok: false, error: "Clients need at least one window to book walks and drop-ins." };

  const supabase = await adminClient();
  const ordered = [...rows].sort((a, b) => a.start_minute - b.start_minute);
  for (const [position, r] of ordered.entries()) {
    const values = { label: r.label, start_minute: r.start_minute, end_minute: r.end_minute, active: r.active, position };
    const { error } = r.id
      ? await supabase.from("booking_windows").update(values).eq("id", r.id)
      : await supabase.from("booking_windows").insert(values);
    if (error) return { ok: false, error: rpcError(error) };
  }

  let hidden = 0;
  for (const id of removedIds.filter((x) => UUID.test(x))) {
    const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("window_id", id);
    const { error } = count
      ? await supabase.from("booking_windows").update({ active: false }).eq("id", id)
      : await supabase.from("booking_windows").delete().eq("id", id);
    if (error) return { ok: false, error: rpcError(error) };
    if (count) hidden++;
  }

  const { data } = await supabase.from("booking_windows").select("*").order("position").order("start_minute");
  refresh();
  return {
    ok: true,
    windows: (data ?? []) as BookingWindow[],
    message: hidden
      ? `Saved. ${hidden === 1 ? "One window has" : `${hidden} windows have`} past visits, so it’s hidden from clients instead of deleted.`
      : "Arrival windows saved.",
  };
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

export type HoursInput = {
  id: string;
  walker_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  dogs: number;
  label: string | null;
  service_ids: string[] | null;
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Replaces every walker's weekly hours with what's on the editor. */
export async function saveHours(blocks: HoursInput[]): Promise<ActionResult> {
  if (!Array.isArray(blocks) || blocks.length > 500) return { ok: false, error: "That’s more hours than we can save at once." };
  const rows: HoursInput[] = [];
  for (const b of blocks) {
    if (!UUID.test(b.id) || !UUID.test(b.walker_id)) return { ok: false, error: "Something didn’t look right. Reload the page and try again." };
    const weekday = int(b.weekday, 1, 7, 1);
    const start = int(b.start_minute, 0, 1425, 0);
    const end = int(b.end_minute, 15, 1440, 60);
    if (start % 15 || end % 15) return { ok: false, error: "Hours go in 15-minute steps." };
    if (end <= start) return { ok: false, error: `A block on ${DAY_NAMES[weekday - 1]} ends before it starts.` };
    const services = Array.isArray(b.service_ids) ? [...new Set(b.service_ids.filter((id) => UUID.test(id)))] : null;
    if (services && !services.length) {
      return { ok: false, error: `Pick at least one service for the ${DAY_NAMES[weekday - 1]} block, or open it to any service.` };
    }
    rows.push({
      id: b.id,
      walker_id: b.walker_id,
      weekday,
      start_minute: start,
      end_minute: end,
      dogs: int(b.dogs, 1, 20, 1),
      label: clampText(b.label ?? "", 40).trim() || null,
      service_ids: services,
    });
  }
  const sorted = [...rows].sort((a, b) => a.walker_id.localeCompare(b.walker_id) || a.weekday - b.weekday || a.start_minute - b.start_minute);
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    if (a.walker_id === b.walker_id && a.weekday === b.weekday && b.start_minute < a.end_minute) {
      return { ok: false, error: `Two blocks overlap on ${DAY_NAMES[b.weekday - 1]}. Adjust one so they don’t.` };
    }
  }

  const supabase = await adminClient();
  if (rows.length) {
    const { error } = await supabase.from("walker_hours").upsert(rows, { onConflict: "id" });
    if (error) return { ok: false, error: rpcError(error) };
  }
  // Then clear whatever was taken off the calendar.
  const stale = supabase.from("walker_hours").delete();
  const { error } = rows.length
    ? await stale.not("id", "in", `(${rows.map((r) => r.id).join(",")})`)
    : await stale.not("walker_id", "is", null);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Hours saved. Clients see the new times right away." };
}

export type TimeOffInput = { walker_id: string | null; start_date: string; end_date: string; window_id: string | null; note: string };

export async function addTimeOff(input: TimeOffInput): Promise<ActionResult> {
  if (!isYmd(input.start_date) || !isYmd(input.end_date)) return { ok: false, error: "Pick the dates." };
  if (input.end_date < input.start_date) return { ok: false, error: "The end date is before the start date." };
  const supabase = await adminClient();
  const walkerId = input.walker_id && UUID.test(input.walker_id) ? input.walker_id : null;
  const windowId = input.window_id && UUID.test(input.window_id) ? input.window_id : null;
  const { error } = await supabase.from("time_off").insert({
    walker_id: walkerId,
    window_id: windowId,
    start_date: input.start_date,
    end_date: input.end_date,
    note: clampText(input.note, 200).trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  // Time off only stops new bookings, so point out anything already on the books then.
  let booked = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("status", ["scheduled", "requested"])
    .lte("service_date", input.end_date)
    .gte("end_date", input.start_date);
  if (walkerId) booked = booked.eq("walker_id", walkerId);
  if (windowId) booked = booked.eq("window_id", windowId);
  const { count } = await booked;
  return {
    ok: true,
    message: count
      ? `Blocked. ${count} booking${count === 1 ? " is" : "s are"} already on those days — check the calendar if they need moving.`
      : "Blocked. Clients can’t book those times.",
  };
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
