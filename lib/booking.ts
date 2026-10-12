import { minuteLabel, minuteRange, timeToMinutes, type Ymd } from "@/lib/dates";
import type { Booking, BookingStatus } from "@/lib/types";

/** Shared booking types and helpers (safe for client and server components). */

export type BookingWindow = {
  id: string;
  label: string;
  start_minute: number;
  end_minute: number;
  position: number;
  active: boolean;
};

export type Walker = {
  profile_id: string;
  display_name: string;
  color: string;
  active: boolean;
  position: number;
};

export type BookingSettings = {
  booking_enabled: boolean;
  timezone: string;
  min_notice_hours: number;
  max_days_ahead: number;
  cancel_cutoff_hours: number;
  admin_alerts: boolean;
  client_reminders: boolean;
  walker_digest: boolean;
  reminder_hour: number;
  reply_to: string;
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  booking_enabled: true,
  timezone: "America/Los_Angeles",
  min_notice_hours: 12,
  max_days_ahead: 60,
  cancel_cutoff_hours: 12,
  admin_alerts: true,
  client_reminders: true,
  walker_digest: true,
  reminder_hour: 18,
  reply_to: "hello@waitingforpaws.com",
};

export type BookingPet = {
  id: string;
  name: string;
  breed: string | null;
  photo_url: string | null;
  temperament?: string | null;
  walking_notes?: string | null;
  medical_notes?: string | null;
  medications?: string | null;
  feeding_notes?: string | null;
};

export type BookingClient = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  access_notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  booking_approved?: boolean;
};

/** A booking with everything needed to show who and what. */
export type BookingDetail = Booking & {
  client: BookingClient | null;
  pets: BookingPet[];
  service: { id: string; name: string; price_cents: number | null; price_label: string | null } | null;
};

export type Availability = { service_date: Ymd; window_id: string; capacity: number; remaining: number };

export const ACTIVE_STATUSES: BookingStatus[] = ["requested", "scheduled"];

export const STATUS_META: Record<BookingStatus, { label: string; tone: "sea" | "sun" | "green" | "gray" | "red" }> = {
  requested: { label: "Request", tone: "sun" },
  scheduled: { label: "Scheduled", tone: "sea" },
  completed: { label: "Done", tone: "green" },
  canceled: { label: "Canceled", tone: "gray" },
  declined: { label: "Declined", tone: "red" },
};

export const SKIP_REASONS: Record<string, string> = {
  too_soon: "too soon to book online",
  too_far: "too far ahead",
  closed: "not available that day",
  full: "fully booked",
  walker_full: "that walker is fully booked",
  already_booked: "already booked",
};

export function windowRange(w: Pick<BookingWindow, "start_minute" | "end_minute">) {
  return minuteRange(w.start_minute, w.end_minute);
}

/** Minute of day a visit starts on the calendar: the pinned arrival, else the window start. */
export function visitStartMinute(
  b: Pick<Booking, "arrival_time" | "window_id">,
  windows: Map<string, BookingWindow>,
  fallback = 9 * 60,
): number {
  const pinned = timeToMinutes(b.arrival_time);
  if (pinned != null) return pinned;
  const w = b.window_id ? windows.get(b.window_id) : undefined;
  return w ? w.start_minute : fallback;
}

/** Human time for a visit: "Midday · 11 AM – 2 PM", "Midday · around 12:15 PM" or "6:30 PM". */
export function visitTimeLabel(
  b: Pick<Booking, "arrival_time" | "window_id" | "start_time">,
  windows: Map<string, BookingWindow>,
  timeZone: string,
): string {
  const pinned = timeToMinutes(b.arrival_time);
  const w = b.window_id ? windows.get(b.window_id) : undefined;
  if (w && pinned != null) return `${w.label} · around ${minuteLabel(pinned)}`;
  if (pinned != null) return minuteLabel(pinned);
  if (w) return `${w.label} · ${windowRange(w)}`;
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(b.start_time));
}

export function petNames(pets: Pick<BookingPet, "name">[]) {
  const names = pets.map((p) => p.name);
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function clientName(b: Pick<BookingDetail, "client" | "invitee_name">) {
  return b.client?.full_name || b.client?.email || b.invitee_name || "Guest";
}

/** "Jane D." */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** Supabase select for a booking with client, pups and service. */
export const BOOKING_DETAIL_SELECT = `
  id, user_id, service_id, title, start_time, end_time, status, source, service_date, window_id,
  arrival_time, duration_minutes, walker_id, series_id, notes, client_note, cancel_reason,
  invitee_name, invitee_email, created_at, updated_at,
  client:profiles!bookings_user_id_fkey (id, full_name, email, phone, address, access_notes,
    emergency_contact_name, emergency_contact_phone, booking_approved),
  pets:booking_pets (pet:pets (id, name, breed, photo_url, temperament, walking_notes, medical_notes,
    medications, feeding_notes)),
  service:services (id, name, price_cents, price_label)
`;

type RawBooking = Omit<BookingDetail, "pets" | "client" | "service"> & {
  client: BookingClient | BookingClient[] | null;
  pets: { pet: BookingPet | BookingPet[] | null }[] | null;
  service: BookingDetail["service"] | BookingDetail["service"][] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Flattens the nested Supabase rows from BOOKING_DETAIL_SELECT. */
export function normalizeBookings(rows: unknown[] | null | undefined): BookingDetail[] {
  return ((rows ?? []) as RawBooking[]).map((r) => ({
    ...r,
    client: one(r.client),
    service: one(r.service),
    pets: (r.pets ?? [])
      .map((p) => one(p.pet))
      .filter((p): p is BookingPet => Boolean(p))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** Minimal iCalendar file for "Add to calendar". */
export function icsForVisits(
  visits: { id: string; title: string; start: Date; end: Date; description?: string; location?: string }[],
  calendarName = "Waiting for Paws",
) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Waiting for Paws//Booking//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];
  const now = stamp(new Date());
  for (const v of visits) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${v.id}@waitingforpaws.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(v.start)}`,
      `DTEND:${stamp(v.end)}`,
      `SUMMARY:${esc(v.title)}`,
    );
    if (v.description) lines.push(`DESCRIPTION:${esc(v.description)}`);
    if (v.location) lines.push(`LOCATION:${esc(v.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Fold long lines per RFC 5545.
  return lines
    .map((line) => {
      if (line.length <= 74) return line;
      const parts: string[] = [];
      for (let i = 0; i < line.length; i += 73) parts.push((i ? " " : "") + line.slice(i, i + 73));
      return parts.join("\r\n");
    })
    .join("\r\n");
}
