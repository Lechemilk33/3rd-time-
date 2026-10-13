import { diffDays, formatYmd, minuteLabel, minuteRange, timeToMinutes, type Ymd } from "@/lib/dates";
import { formatDuration, formatMoney } from "@/lib/format";
import type { Booking, BookingStatus, DurationOption, Handoff, PriceUnit, Service, ServiceKind } from "@/lib/types";

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
  service: (Pick<Service, "id" | "name" | "price_cents" | "price_label" | "price_unit" | "kind" | "duration_minutes"> &
    Pick<Service, "start_minute" | "end_minute" | "min_nights" | "max_nights" | "confirmation"> &
    Pick<Service, "duration_options" | "handoff_options" | "pickup_fee_cents" | "bring_details">) | null;
};

export type Availability = { service_date: Ymd; window_id: string; capacity: number; remaining: number };

export type DayAvailability = { service_date: Ymd; capacity: number; remaining: number };

/** service_availability() returns this capacity for days with no limit. */
export const UNLIMITED = 99;

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

export const KIND_META: Record<ServiceKind, { label: string; short: string; hint: string; emoji: string }> = {
  window: {
    label: "Visit in a time window",
    short: "Window visit",
    hint: "Clients pick a day and a window like Morning or Midday. Best for walks and drop-ins.",
    emoji: "🦮",
  },
  time: {
    label: "Set-time appointment",
    short: "Appointment",
    hint: "Clients pick an exact start time. Best for meet & greets, grooming and training.",
    emoji: "⏰",
  },
  day: {
    label: "Full day",
    short: "Full day",
    hint: "Drop off in the morning, pick up in the evening. Best for day care and day trips.",
    emoji: "☀️",
  },
  stay: {
    label: "Overnight stay",
    short: "Overnight",
    hint: "Clients pick check-in and check-out dates. Best for boarding and house sitting.",
    emoji: "🌙",
  },
};

export const PRICE_UNITS: Record<PriceUnit, string> = {
  visit: "per visit",
  hour: "per hour",
  day: "per day",
  night: "per night",
  flat: "flat rate",
};

export function isMultiDay(b: Pick<Booking, "kind">) {
  return b.kind === "day" || b.kind === "stay";
}

/** Does a booking take up this day? (Stays include their check-out day.) */
export function coversDay(b: Pick<Booking, "service_date" | "end_date">, day: Ymd) {
  return b.service_date <= day && day <= (b.end_date ?? b.service_date);
}

/** Nights in a stay (days for full-day bookings). */
export function stayLength(b: Pick<Booking, "kind" | "service_date" | "end_date">) {
  const days = diffDays(b.end_date ?? b.service_date, b.service_date);
  return b.kind === "stay" ? Math.max(1, days) : days + 1;
}

/** Default drop-off / check-in and pick-up / check-out times. */
export function serviceStartMinute(s: Pick<Service, "kind" | "start_minute">) {
  return s.start_minute ?? (s.kind === "stay" ? 17 * 60 : 8 * 60);
}
export function serviceEndMinute(s: Pick<Service, "kind" | "end_minute">) {
  return s.end_minute ?? (s.kind === "stay" ? 10 * 60 : 17 * 60);
}

/** "per night" (or the service's own wording). Empty for plain per-visit prices. */
export function priceUnitLabel(s: Pick<Service, "price_label" | "price_unit">) {
  return s.price_label || (s.price_unit && s.price_unit !== "visit" && s.price_unit !== "flat" ? PRICE_UNITS[s.price_unit] : "");
}

type Lengths = Partial<Pick<Service, "duration_options">>;

/** Whether clients pick how long (a 30- or 60-minute walk). */
export function hasLengthChoice(s: Lengths) {
  return (s.duration_options?.length ?? 0) > 1;
}

/** Lengths a client can pick, shortest first. A fixed-length service gives just its one length. */
export function lengthOptions(s: Pick<Service, "duration_minutes" | "price_cents"> & Lengths): DurationOption[] {
  if (!hasLengthChoice(s)) return [{ minutes: s.duration_minutes ?? 30, price_cents: s.price_cents }];
  return [...s.duration_options!].sort((a, b) => a.minutes - b.minutes);
}

/** Price of one booking of the given length: that length's price, else the service price. */
export function lengthPrice(s: Pick<Service, "price_cents"> & Lengths, minutes?: number | null): number | null {
  const option = hasLengthChoice(s) && minutes != null ? s.duration_options!.find((o) => o.minutes === minutes) : undefined;
  return option ? option.price_cents : s.price_cents;
}

/** "$75 per night" / "$25" / "From $25 per walk" / "Free". */
export function servicePrice(s: Pick<Service, "price_cents" | "price_label" | "price_unit"> & Lengths) {
  const unit = priceUnitLabel(s);
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);
  if (hasLengthChoice(s)) {
    const prices = s.duration_options!.map((o) => o.price_cents).filter((p): p is number => p != null);
    if (!prices.length) return s.price_label || "";
    const low = Math.min(...prices);
    if (Math.max(...prices) === 0) return "Free";
    return withUnit(low === Math.max(...prices) ? formatMoney(low) : `From ${formatMoney(low)}`);
  }
  if (s.price_cents == null) return s.price_label || "";
  if (s.price_cents === 0) return "Free";
  return withUnit(formatMoney(s.price_cents));
}

/** "30 min" / "30 min or 1 hr" / "8 AM – 5 PM" / "Check-in 5 PM · check-out 10 AM". */
export function serviceTiming(s: Pick<Service, "kind" | "duration_minutes" | "start_minute" | "end_minute"> & Lengths) {
  if (s.kind === "day") return minuteRange(serviceStartMinute(s), serviceEndMinute(s));
  if (s.kind === "stay") return `Check-in ${minuteLabel(serviceStartMinute(s))} · check-out ${minuteLabel(serviceEndMinute(s))}`;
  if (hasLengthChoice(s)) {
    const lengths = lengthOptions({ ...s, price_cents: null }).map((o) => formatDuration(o.minutes));
    return lengths.length <= 3 ? lengths.join(" or ") : `${lengths[0]} – ${lengths[lengths.length - 1]}`;
  }
  return formatDuration(s.duration_minutes);
}

/** A length (minutes) worth sending to the database, else null. */
export function lengthOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 5 && value <= 720 ? value : null;
}

export function handoffOrNull(value: unknown): Handoff | null {
  return value === "pickup" || value === "bring" ? value : null;
}

/** How the pup gets to us, in each audience's words. */
export const HANDOFF_META: Record<Handoff, { label: string; client: string; team: string; emoji: string }> = {
  pickup: { label: "Pick-up", client: "Pick my pup up from home", team: "Pick up from home", emoji: "🚗" },
  bring: { label: "Drop-off", client: "I’ll drop my pup off", team: "Client drops off", emoji: "📍" },
};

/** "$40" for the length booked (+ pick-up fee) — falls back to the service's price wording. */
export function bookingPriceLabel(b: Pick<BookingDetail, "service" | "duration_minutes" | "handoff">): string {
  const s = b.service;
  if (!s) return "";
  const base = hasLengthChoice(s)
    ? (() => {
        const p = lengthPrice(s, b.duration_minutes);
        return p == null ? s.price_label || "" : p === 0 ? "Free" : [formatMoney(p), priceUnitLabel(s)].filter(Boolean).join(" ");
      })()
    : servicePrice(s);
  const fee = b.handoff === "pickup" && s.pickup_fee_cents ? ` + ${formatMoney(s.pickup_fee_cents)} pick-up` : "";
  return base ? base + fee : "";
}

/** Estimated total for a booking: the chosen length's price (scaled by nights/days/visits) plus any pick-up fee. */
export function estimateTotal(
  s: Pick<Service, "price_cents" | "price_unit" | "duration_minutes"> & Lengths & Partial<Pick<Service, "pickup_fee_cents">>,
  units: { nights?: number; days?: number; visits?: number; pets?: number },
  choice: { minutes?: number | null; handoff?: Handoff | null } = {},
): number | null {
  const price = lengthPrice(s, choice.minutes);
  if (price == null || price === 0) return null;
  const bookings = s.price_unit === "night" || s.price_unit === "flat" ? 1 : (units.visits ?? units.days ?? 1);
  const fee = choice.handoff === "pickup" ? (s.pickup_fee_cents ?? 0) * bookings : 0;
  switch (s.price_unit) {
    case "night":
      return price * (units.nights ?? 1) + fee;
    case "day":
      return price * (units.days ?? units.nights ?? 1) + fee;
    case "hour":
      return Math.round((price * (choice.minutes ?? s.duration_minutes ?? 60)) / 60) * (units.visits ?? 1) + fee;
    case "flat":
      return price + fee;
    default:
      return price * (units.visits ?? 1) + fee;
  }
}

/** "Fri, Oct 23" → "Mon, Oct 26" style range label for a stay / full day. */
export function dateSpanLabel(b: Pick<Booking, "kind" | "service_date" | "end_date">) {
  const fmt = (d: Ymd) => formatYmd(d, { weekday: "short", month: "short", day: "numeric" });
  if (b.kind !== "stay" || !b.end_date || b.end_date === b.service_date) return fmt(b.service_date);
  return `${fmt(b.service_date)} → ${fmt(b.end_date)}`;
}

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

/**
 * Human time for a visit: "Midday · 11 AM – 2 PM", "Midday · around 12:15 PM", "6:30 PM",
 * "All day · 8 AM – 5 PM" or "3 nights · check-in 5 PM, check-out 10 AM".
 */
export function visitTimeLabel(
  b: Pick<Booking, "arrival_time" | "window_id" | "start_time" | "end_time" | "kind" | "service_date" | "end_date">,
  windows: Map<string, BookingWindow>,
  timeZone: string,
): string {
  const local = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(":00", "") : "";
  if (b.kind === "stay") {
    const nights = stayLength(b);
    return `${nights} night${nights === 1 ? "" : "s"} · check-in ${local(b.start_time)}, check-out ${local(b.end_time)}`;
  }
  if (b.kind === "day") return `All day · ${local(b.start_time)} – ${local(b.end_time)}`;
  const pinned = timeToMinutes(b.arrival_time);
  if (b.kind === "time" && pinned != null) return minuteLabel(pinned);
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
  id, user_id, service_id, title, kind, start_time, end_time, status, source, service_date, end_date,
  window_id, arrival_time, duration_minutes, walker_id, series_id, notes, client_note, answers, cancel_reason, handoff,
  invitee_name, invitee_email, created_at, updated_at,
  client:profiles!bookings_user_id_fkey (id, full_name, email, phone, address, access_notes,
    emergency_contact_name, emergency_contact_phone, booking_approved),
  pets:booking_pets (pet:pets (id, name, breed, photo_url, temperament, walking_notes, medical_notes,
    medications, feeding_notes)),
  service:services (id, name, price_cents, price_label, price_unit, kind, duration_minutes, start_minute, end_minute,
    min_nights, max_nights, confirmation, duration_options, handoff_options, pickup_fee_cents, bring_details)
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
