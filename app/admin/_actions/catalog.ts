"use server";

import type { ActionResult, FormDefinition, FormField, FormFieldType, GalleryPhoto, Service } from "@/lib/types";
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

function cleanService(input: ServiceInput): ServiceInput {
  const cents = input.price_cents == null || Number.isNaN(input.price_cents) ? null : Math.max(0, Math.round(input.price_cents));
  const minutes =
    input.duration_minutes == null || Number.isNaN(input.duration_minutes) || input.duration_minutes <= 0
      ? null
      : Math.round(input.duration_minutes);
  return {
    name: clampText(input.name, 80).trim() || "New service",
    description: clampText(input.description, 1000) || null,
    price_cents: cents,
    price_label: clampText(input.price_label, 40) || null,
    duration_minutes: minutes,
    image_url: clampText(input.image_url, 1000) || null,
    booking_url: clampText(input.booking_url, 1000) || null,
    active: Boolean(input.active),
    allow_online_payment: Boolean(input.allow_online_payment),
  };
}

export async function createService(): Promise<ServicesResult> {
  const supabase = await adminClient();
  const services = await listServices(supabase);
  const { error } = await supabase.from("services").insert({
    name: "New service",
    description: "Describe this service.",
    price_cents: 2500,
    price_label: "per walk",
    duration_minutes: 30,
    active: false,
    allow_online_payment: false,
    position: services.length,
  });
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, services: await listServices(supabase) };
}

export async function saveService(id: string, input: ServiceInput): Promise<ActionResult> {
  const supabase = await adminClient();
  const { error } = await supabase.from("services").update(cleanService(input)).eq("id", id);
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, message: "Saved and live!" };
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
    fields.push({
      id,
      type: f.type,
      label,
      help: clampText(f.help, 300).trim() || undefined,
      required: f.type === "heading" ? undefined : Boolean(f.required),
      options,
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
