"use server";

import type { ActionResult, FormDefinition, FormField, FormFieldType, GalleryPhoto, PriceUnit, Service, ServiceKind } from "@/lib/types";
import { serviceEndMinute, serviceStartMinute } from "@/lib/booking";
import { MEDIA_BUCKET } from "@/lib/media";
import { adminClient, clampText, publishContentChange } from "./shared";

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

type ServiceInput = Omit<Service, "id" | "position">;
type ServicesResult = ActionResult & { services?: Service[] };

async function listServices(supabase: Awaited<ReturnType<typeof adminClient>>) {
  const { data } = await supabase.from("services").select("*").order("position").order("created_at");
  return (data ?? []) as Service[];
}

const KINDS: ServiceKind[] = ["window", "time", "day", "stay"];
const UNITS: PriceUnit[] = ["visit", "hour", "day", "night", "flat"];

function int(value: unknown, min: number, max: number, fallback: number | null): number | null {
  const n = Number(value);
  if (value === null || value === "" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanService(input: ServiceInput): ServiceInput {
  const kind = KINDS.includes(input.kind) ? input.kind : "window";
  const ranged = kind === "day" || kind === "stay";
  const minNights = int(input.min_nights, 1, 60, 1)!;
  return {
    name: clampText(input.name, 80).trim() || "New service",
    description: clampText(input.description, 1000) || null,
    price_cents: int(input.price_cents, 0, 10_000_000, null),
    price_label: clampText(input.price_label, 40).trim() || null,
    price_unit: UNITS.includes(input.price_unit) ? input.price_unit : "visit",
    duration_minutes: ranged ? null : int(input.duration_minutes, 5, 720, 30),
    image_url: clampText(input.image_url, 1000) || null,
    booking_url: clampText(input.booking_url, 1000) || null,
    active: Boolean(input.active),
    allow_online_payment: Boolean(input.allow_online_payment),
    bookable: Boolean(input.bookable),
    audience: input.audience === "everyone" ? "everyone" : "approved",
    confirmation: input.confirmation === "request" ? "request" : "instant",
    max_pets: int(input.max_pets, 1, 10, 3)!,
    kind,
    daily_capacity: ranged ? int(input.daily_capacity, 1, 100, null) : null,
    start_minute: ranged ? int(input.start_minute, 0, 1439, null) : null,
    end_minute: ranged ? int(input.end_minute, 0, 1439, null) : null,
    min_nights: minNights,
    max_nights: Math.max(minNights, int(input.max_nights, 1, 90, 14)!),
  };
}

const NEW_SERVICE: Record<ServiceKind, Partial<ServiceInput>> = {
  window: { name: "New visit", price_cents: 2500, price_unit: "visit", duration_minutes: 30, confirmation: "instant" },
  time: { name: "New appointment", price_cents: 5000, price_unit: "visit", duration_minutes: 60, confirmation: "instant", max_pets: 2 },
  day: {
    name: "Doggy day care",
    price_cents: 4500,
    price_unit: "day",
    duration_minutes: null,
    start_minute: 8 * 60,
    end_minute: 17 * 60,
    daily_capacity: 6,
    confirmation: "instant",
  },
  stay: {
    name: "Overnight stay",
    price_cents: 7500,
    price_unit: "night",
    duration_minutes: null,
    start_minute: 17 * 60,
    end_minute: 10 * 60,
    daily_capacity: 3,
    min_nights: 1,
    max_nights: 14,
    confirmation: "request",
  },
};

export async function createService(kind: ServiceKind = "window"): Promise<ServicesResult & { id?: string }> {
  const supabase = await adminClient();
  const services = await listServices(supabase);
  const k = KINDS.includes(kind) ? kind : "window";
  const { data, error } = await supabase
    .from("services")
    .insert({
      description: "Describe this service.",
      active: false,
      allow_online_payment: false,
      bookable: true,
      audience: "approved",
      kind: k,
      ...NEW_SERVICE[k],
      position: services.length,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, services: await listServices(supabase), id: data.id as string };
}

export async function saveService(id: string, input: ServiceInput): Promise<ActionResult & { service?: Service }> {
  const supabase = await adminClient();
  const clean = cleanService(input);
  if (clean.kind === "day" && serviceEndMinute(clean) <= serviceStartMinute(clean)) {
    return { ok: false, error: "Pick-up has to be after drop-off." };
  }
  const { data, error } = await supabase.from("services").update(clean).eq("id", id).select("*").single();
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, message: "Saved and live!", service: data as Service };
}

export async function moveService(id: string, direction: "up" | "down"): Promise<ServicesResult> {
  const supabase = await adminClient();
  const services = await listServices(supabase);
  const index = services.findIndex((s) => s.id === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && swap >= 0 && swap < services.length) {
    [services[index], services[swap]] = [services[swap], services[index]];
    await Promise.all(services.map((s, i) => supabase.from("services").update({ position: i }).eq("id", s.id)));
    publishContentChange();
  }
  return { ok: true, services: await listServices(supabase) };
}

export async function deleteService(id: string): Promise<ServicesResult> {
  const supabase = await adminClient();
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Questions that were only for this service go with it; others just stop mentioning it.
  const { data: form } = await supabase.from("forms").select("fields").eq("slug", "intake").maybeSingle<{ fields: FormField[] }>();
  if (form?.fields?.some((f) => f.services?.includes(id))) {
    const fields = form.fields.flatMap((f) => {
      if (!f.services?.includes(id)) return [f];
      const rest = f.services.filter((s) => s !== id);
      return rest.length ? [{ ...f, services: rest }] : [];
    });
    await supabase.from("forms").update({ fields }).eq("slug", "intake");
  }
  publishContentChange();
  return { ok: true, services: await listServices(supabase) };
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

type GalleryResult = ActionResult & { photos?: GalleryPhoto[] };

async function listPhotos(supabase: Awaited<ReturnType<typeof adminClient>>) {
  const { data } = await supabase.from("gallery_photos").select("*").order("position").order("created_at");
  return (data ?? []) as GalleryPhoto[];
}

export async function addGalleryPhotos(uploads: { url: string; path: string }[]): Promise<GalleryResult> {
  const supabase = await adminClient();
  const existing = await listPhotos(supabase);
  // New photos go first so fresh adventures show at the top.
  const rows = uploads.slice(0, 50).map((u, i) => ({
    image_url: clampText(u.url, 1000),
    storage_path: clampText(u.path, 500),
    position: i,
  }));
  const { error } = await supabase.from("gallery_photos").insert(rows);
  if (error) return { ok: false, error: error.message };
  await Promise.all(
    existing.map((p, i) => supabase.from("gallery_photos").update({ position: rows.length + i }).eq("id", p.id)),
  );
  publishContentChange();
  return { ok: true, photos: await listPhotos(supabase) };
}

export async function updateGalleryPhoto(
  id: string,
  patch: { caption?: string; visible?: boolean },
): Promise<ActionResult> {
  const supabase = await adminClient();
  const update: Record<string, unknown> = {};
  if (patch.caption !== undefined) update.caption = clampText(patch.caption, 300) || null;
  if (patch.visible !== undefined) update.visible = Boolean(patch.visible);
  const { error } = await supabase.from("gallery_photos").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true };
}

export async function moveGalleryPhoto(id: string, direction: "up" | "down"): Promise<GalleryResult> {
  const supabase = await adminClient();
  const photos = await listPhotos(supabase);
  const index = photos.findIndex((p) => p.id === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && swap >= 0 && swap < photos.length) {
    [photos[index], photos[swap]] = [photos[swap], photos[index]];
    await Promise.all(photos.map((p, i) => supabase.from("gallery_photos").update({ position: i }).eq("id", p.id)));
    publishContentChange();
  }
  return { ok: true, photos: await listPhotos(supabase) };
}

export async function deleteGalleryPhoto(id: string): Promise<GalleryResult> {
  const supabase = await adminClient();
  const { data: photo } = await supabase.from("gallery_photos").select("storage_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("gallery_photos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (photo?.storage_path) await supabase.storage.from(MEDIA_BUCKET).remove([photo.storage_path]);
  publishContentChange();
  return { ok: true, photos: await listPhotos(supabase) };
}

// ---------------------------------------------------------------------------
// Forms (intake builder)
// ---------------------------------------------------------------------------

const FIELD_TYPES: FormFieldType[] = [
  "heading",
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "radio",
  "checkboxes",
  "yesno",
  "agreement",
];

export async function saveForm(input: FormDefinition): Promise<ActionResult> {
  const supabase = await adminClient();
  const { data: serviceRows } = await supabase.from("services").select("id");
  const serviceIds = new Set((serviceRows ?? []).map((s) => s.id as string));
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const f of (input.fields ?? []).slice(0, 100)) {
    const id = clampText(f.id, 60).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id || seen.has(id) || !FIELD_TYPES.includes(f.type)) continue;
    seen.add(id);
    const label = clampText(f.label, 300).trim();
    if (!label) return { ok: false, error: "Every question needs a label." };
    const needsOptions = f.type === "select" || f.type === "radio" || f.type === "checkboxes";
    const options = needsOptions
      ? (f.options ?? []).map((o) => clampText(o, 120).trim()).filter(Boolean).slice(0, 30)
      : undefined;
    if (needsOptions && !options?.length) return { ok: false, error: `“${label}” needs at least one choice.` };
    const services = (f.services ?? []).filter((s) => serviceIds.has(s));
    // Only for services that no longer exist: don't let it turn into a question for everyone.
    if (f.services?.length && !services.length) continue;
    fields.push({
      id,
      type: f.type,
      label,
      help: clampText(f.help, 300).trim() || undefined,
      required: f.type === "heading" ? undefined : Boolean(f.required),
      options,
      services: services.length ? services : undefined,
      ask: services.length && f.ask === "each" ? "each" : undefined,
    });
  }

  const { error } = await supabase.from("forms").upsert(
    {
      slug: clampText(input.slug, 60) || "intake",
      title: clampText(input.title, 120).trim() || "Intake form",
      description: clampText(input.description, 1000).trim() || null,
      fields,
    },
    { onConflict: "slug" },
  );
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, message: "Form saved. Clients see the new version right away." };
}
