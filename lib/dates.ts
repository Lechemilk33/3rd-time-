/**
 * Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings in the business's timezone, so
 * nothing shifts when a browser or server runs in another timezone. Times of day are minutes
 * after midnight.
 */

export type Ymd = string;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: unknown): value is Ymd {
  if (typeof value !== "string" || !YMD.test(value)) return false;
  const d = toUtc(value);
  return !Number.isNaN(d.getTime()) && fromUtc(d) === value;
}

function toUtc(ymd: Ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(date: Date): Ymd {
  return date.toISOString().slice(0, 10);
}

/** Today's date in a timezone. */
export function todayIn(timeZone: string, now = new Date()): Ymd {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Minutes after midnight right now in a timezone. */
export function minutesNowIn(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function addMonths(ymd: Ymd, months: number): Ymd {
  const d = toUtc(ymd);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromUtc(d);
}

export function diffDays(a: Ymd, b: Ymd): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(ymd: Ymd): number {
  const day = toUtc(ymd).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing the date. */
export function startOfWeek(ymd: Ymd): Ymd {
  return addDays(ymd, 1 - isoWeekday(ymd));
}

export function startOfMonth(ymd: Ymd): Ymd {
  return `${ymd.slice(0, 7)}-01`;
}

export function daysBetween(from: Ymd, to: Ymd): Ymd[] {
  const out: Ymd[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatYmd(ymd: Ymd, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(toUtc(ymd));
}

/** "Tue, Oct 14" */
export function shortDate(ymd: Ymd) {
  return formatYmd(ymd, { weekday: "short", month: "short", day: "numeric" });
}

/** "Tuesday, October 14" */
export function longDate(ymd: Ymd) {
  return formatYmd(ymd, { weekday: "long", month: "long", day: "numeric" });
}

/** 480 -> "8 AM", 690 -> "11:30 AM" */
export function minuteLabel(minute: number, compact = false): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = mm ? `${h12}:${String(mm).padStart(2, "0")}` : `${h12}`;
  if (compact) return `${time}${suffix === "AM" ? "a" : "p"}`;
  return `${time} ${suffix}`;
}

/** "11 AM – 2 PM" */
export function minuteRange(start: number, end: number): string {
  return `${minuteLabel(start)} – ${minuteLabel(end)}`;
}

/** "12:15:00" -> 735 */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** 735 -> "12:15" (for <input type="time">) */
export function minutesToTimeInput(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes after midnight in a timezone for an absolute ISO time. */
export function isoToLocalMinutes(iso: string, timeZone: string): number {
  return minutesNowIn(timeZone, new Date(iso));
}

/** Local date for an absolute ISO time. */
export function isoToLocalYmd(iso: string, timeZone: string): Ymd {
  return todayIn(timeZone, new Date(iso));
}

function tzOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** A local date + minute in a timezone -> absolute Date (DST-safe). */
export function zonedToDate(ymd: Ymd, minute: number, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60);
  const first = tzOffsetMinutes(new Date(guess), timeZone);
  let t = guess - first * 60_000;
  const second = tzOffsetMinutes(new Date(t), timeZone);
  if (second !== first) t = guess - second * 60_000;
  return new Date(t);
}
