import "server-only";
import {
  DEFAULT_BOOKING_SETTINGS,
  type BookingSettings,
  type BookingWindow,
  type Walker,
} from "@/lib/booking";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BookingConfig = {
  settings: BookingSettings;
  windows: BookingWindow[];
  walkers: Walker[];
};

/** Windows, walkers and rules. Every signed-in user can read these. */
export async function getBookingConfig(supabase: Supabase): Promise<BookingConfig> {
  const [settingsRes, windowsRes, walkersRes] = await Promise.all([
    supabase.from("booking_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("booking_windows").select("*").order("position").order("start_minute"),
    supabase.from("walkers").select("profile_id, display_name, color, active, position").order("position"),
  ]);
  const raw = (settingsRes.data ?? {}) as Partial<BookingSettings>;
  const settings = Object.fromEntries(
    Object.entries(DEFAULT_BOOKING_SETTINGS).map(([k, v]) => [k, raw[k as keyof BookingSettings] ?? v]),
  ) as BookingSettings;
  return {
    settings,
    windows: (windowsRes.data ?? []) as BookingWindow[],
    walkers: (walkersRes.data ?? []) as Walker[],
  };
}

/** Postgres error text is written for people already; strip the noise around it. */
export function rpcError(error: { message?: string } | null | undefined, fallback = "Something went wrong.") {
  const message = error?.message?.trim();
  if (!message) return fallback;
  if (/permission denied|JWT|violates row-level/i.test(message)) return "You don’t have access to do that.";
  return message;
}
