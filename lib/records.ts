/**
 * Vaccine records.
 *
 * Clients add photos or PDFs of their pup's shot records whenever it suits them: when they add the
 * pup, or later from the pup's page. It's never required to sign up or book a meet & greet. The team
 * checks the records and notes how long each shot is good for; the client gets one reminder email a
 * few weeks before one runs out (private.send_record_reminders).
 *
 * What we ask for in San Diego, and why:
 * - Rabies: California law requires it for every dog over 4 months (Health & Safety Code 121690),
 *   and it's needed for the city dog license.
 * - Distemper & parvo (DHPP or DAPP): the core shot every vet gives, standard anywhere dogs meet.
 * - Kennel cough (Bordetella): it spreads where dogs get together, so it matters most for group
 *   walks and park visits.
 */

import { addDays, formatYmd, type Ymd } from "@/lib/dates";
import type { Pet } from "@/lib/types";

export const RECORDS_BUCKET = "pet-records";
export const RECORD_MAX_BYTES = 15 * 1024 * 1024;
export const RECORD_ACCEPT = "image/*,application/pdf,.heic,.heif,.pdf";
const RECORD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

/** Days before a shot runs out that it shows as "due" and the client is reminded. */
export const DUE_SOON_DAYS = 30;

export type VaccineKey = "rabies_until" | "distemper_until" | "bordetella_until";

export const VACCINES: { key: VaccineKey; name: string; short: string; why: string }[] = [
  { key: "rabies_until", name: "Rabies", short: "Rabies", why: "Required by California law for dogs over 4 months." },
  { key: "distemper_until", name: "Distemper & parvo (DHPP)", short: "DHPP", why: "The core shot every vet gives." },
  {
    key: "bordetella_until",
    name: "Kennel cough (Bordetella)",
    short: "Bordetella",
    why: "Recommended for group walks and park visits.",
  },
];

/** A file a client added, with a short-lived link to open it. */
export type PetRecordFile = {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  url: string | null;
  created_at: string;
};

/** An uploaded file that isn't attached to a pup yet (sent with the new-pup form). */
export type StagedRecord = { path: string; name: string; type: string; size: number };

export const isPdf = (type: string, name = "") => type === "application/pdf" || /\.pdf$/i.test(name);

/** The file types the bucket takes (by type, or by extension when the browser doesn't say). */
export function recordTypeOf(file: { type: string; name: string }): string | null {
  if (RECORD_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "heic" || ext === "heif") return `image/${ext}`;
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png" || ext === "webp") return `image/${ext}`;
  return null;
}

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "Mar 12, 2027" */
export const shotDate = (ymd: Ymd) => formatYmd(ymd, { month: "short", day: "numeric", year: "numeric" });

export type ShotTone = "green" | "sun" | "red" | "gray";

export function shotStatus(until: Ymd | null, today: Ymd): { tone: ShotTone; label: string } {
  if (!until) return { tone: "gray", label: "Not on file" };
  if (until < today) return { tone: "red", label: `Expired ${shotDate(until)}` };
  if (until <= addDays(today, DUE_SOON_DAYS)) return { tone: "sun", label: `Due ${shotDate(until)}` };
  return { tone: "green", label: `Good through ${shotDate(until)}` };
}

type RecordsPet = Pick<Pet, "records_checked_at" | VaccineKey>;

/**
 * Where a pup's records stand:
 * - none: nothing added yet
 * - checking: added something the team hasn't looked at yet
 * - checked: the team has looked at everything
 */
export type RecordsState = "none" | "checking" | "checked";

export function recordsState(pet: RecordsPet, latestUpload: string | null | undefined): RecordsState {
  if (latestUpload && (!pet.records_checked_at || Date.parse(latestUpload) > Date.parse(pet.records_checked_at))) {
    return "checking";
  }
  return pet.records_checked_at ? "checked" : "none";
}

/** Shots that have run out or will within DUE_SOON_DAYS, soonest first. */
export function shotsDue(pet: RecordsPet, today: Ymd) {
  const soon = addDays(today, DUE_SOON_DAYS);
  return VACCINES.flatMap((v) => {
    const until = pet[v.key];
    return until && until <= soon ? [{ ...v, until, expired: until < today }] : [];
  }).sort((a, b) => a.until.localeCompare(b.until));
}

/** Newest upload per pup, from a list of { pet_id, created_at } rows. */
export function latestUploads(rows: { pet_id: string; created_at: string }[] | null | undefined) {
  const latest = new Map<string, string>();
  for (const r of rows ?? []) {
    const seen = latest.get(r.pet_id);
    if (!seen || Date.parse(r.created_at) > Date.parse(seen)) latest.set(r.pet_id, r.created_at);
  }
  return latest;
}
