"use server";

import { refresh } from "next/cache";
import { isYmd } from "@/lib/dates";
import { rpcError } from "@/lib/booking-server";
import type { ActionResult } from "@/lib/types";
import { adminClient, clampText } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
const minuteOrNull = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1440 ? v : null;

export type CreateBookingsInput = {
  clientId: string | null;
  guestName?: string;
  guestEmail?: string;
  serviceId: string;
  petIds: string[];
  dates: string[];
  windowId: string | null;
  arrivalMinute: number | null;
  walkerId: string | null;
  note: string;
  force: boolean;
  notify: boolean;
};

export type CreateBookingsResult = ActionResult & {
  created?: { id: string; date: string }[];
  skipped?: { date: string; reason: string }[];
};

export async function createBookings(input: CreateBookingsInput): Promise<CreateBookingsResult> {
  const supabase = await adminClient();
  const dates = (input.dates ?? []).filter(isYmd).slice(0, 100);
  const { data, error } = await supabase.rpc("book_visits", {
    p_service_id: uuidOrNull(input.serviceId),
    p_pet_ids: (input.petIds ?? []).filter((id) => UUID.test(id)),
    p_dates: dates,
    p_window_id: uuidOrNull(input.windowId),
    p_note: clampText(input.note, 1000) || null,
    p_client_id: uuidOrNull(input.clientId),
    p_walker_id: uuidOrNull(input.walkerId),
    p_arrival_minute: minuteOrNull(input.arrivalMinute),
    p_force: Boolean(input.force),
    p_notify: Boolean(input.notify),
    p_guest_name: input.clientId ? null : clampText(input.guestName, 120).trim() || null,
    p_guest_email: input.clientId ? null : clampText(input.guestEmail, 200).trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  const result = data as { created: { id: string; date: string }[]; skipped: { date: string; reason: string }[] };
  return { ok: true, created: result.created, skipped: result.skipped };
}

export type MoveInput = {
  id: string;
  date: string;
  windowId?: string | null;
  arrivalMinute?: number | null;
  walkerId?: string | null;
  /** null = email the client only if the day or window changed */
  notify?: boolean | null;
  clearArrival?: boolean;
};

export async function moveBooking(input: MoveInput): Promise<ActionResult & { notified?: boolean }> {
  if (!UUID.test(input.id) || !isYmd(input.date)) return { ok: false, error: "Pick a date." };
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("move_booking", {
    p_booking_id: input.id,
    p_date: input.date,
    p_window_id: uuidOrNull(input.windowId),
    p_arrival_minute: minuteOrNull(input.arrivalMinute),
    p_walker_id: uuidOrNull(input.walkerId),
    p_notify: input.notify ?? null,
    p_clear_arrival: Boolean(input.clearArrival),
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, notified: Boolean((data as { notified?: boolean })?.notified) };
}

type Scope = "one" | "following";

export async function setBookingStatus(
  id: string,
  status: "scheduled" | "completed" | "declined",
  options: { scope?: Scope; notify?: boolean; reason?: string } = {},
): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "Visit not found." };
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("set_booking_status", {
    p_booking_id: id,
    p_status: status,
    p_scope: options.scope === "following" ? "following" : "one",
    p_notify: options.notify ?? true,
    p_reason: clampText(options.reason, 500) || null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  const n = Number(data ?? 0);
  return { ok: true, message: n > 1 ? `Updated ${n} visits.` : "Updated." };
}

export async function cancelBooking(
  id: string,
  options: { scope?: Scope; notify?: boolean; reason?: string } = {},
): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "Visit not found." };
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: id,
    p_scope: options.scope === "following" ? "following" : "one",
    p_reason: clampText(options.reason, 500) || null,
    p_notify: options.notify ?? true,
  });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  const n = Number(data ?? 0);
  return { ok: true, message: n > 1 ? `Canceled ${n} visits.` : "Visit canceled." };
}

/** Walker and visit notes. Times go through moveBooking so emails and capacity stay right. */
export async function updateBooking(
  id: string,
  patch: { walkerId?: string | null; notes?: string | null },
): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "Visit not found." };
  const supabase = await adminClient();
  const update: Record<string, unknown> = {};
  if (patch.walkerId !== undefined) update.walker_id = uuidOrNull(patch.walkerId);
  if (patch.notes !== undefined) update.notes = clampText(patch.notes, 2000).trim() || null;
  const { error } = await supabase.from("bookings").update(update).eq("id", id);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteBooking(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "Visit not found." };
  const supabase = await adminClient();
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Deleted." };
}

export async function getAdminAvailability(from: string, to: string) {
  if (!isYmd(from) || !isYmd(to)) return [];
  const supabase = await adminClient();
  const { data } = await supabase.rpc("booking_availability", { p_from: from, p_to: to });
  return (data ?? []) as { service_date: string; window_id: string; capacity: number; remaining: number }[];
}
