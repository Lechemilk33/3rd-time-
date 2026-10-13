import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { RECORDS_BUCKET, type PetRecordFile, type StagedRecord } from "@/lib/records";

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

/** Each pup's files, newest last, with links that work for an hour. */
export async function getPetRecordFiles(supabase: SupabaseClient, petIds: string[]) {
  const byPet = new Map<string, PetRecordFile[]>();
  if (!petIds.length) return byPet;
  const { data: rows } = await supabase
    .from("pet_records")
    .select("id, pet_id, path, file_name, content_type, size_bytes, created_at")
    .in("pet_id", petIds)
    .order("created_at");
  if (!rows?.length) return byPet;
  const { data: signed } = await supabase.storage.from(RECORDS_BUCKET).createSignedUrls(
    rows.map((r) => r.path as string),
    3600,
  );
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of rows) {
    byPet.set(r.pet_id, [
      ...(byPet.get(r.pet_id) ?? []),
      {
        id: r.id,
        path: r.path,
        name: r.file_name || "Record",
        type: r.content_type,
        size: r.size_bytes,
        url: urls.get(r.path) ?? null,
        created_at: r.created_at,
      },
    ]);
  }
  return byPet;
}

/** Files sent with a form, checked to be in the owner's folder. */
export function readStagedRecords(value: unknown, ownerId: string): StagedRecord[] {
  let list: unknown;
  try {
    list = typeof value === "string" && value ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (f): f is StagedRecord =>
        Boolean(f) && typeof f.path === "string" && PATH.test(f.path) && f.path.startsWith(`${ownerId}/`),
    )
    .slice(0, 20)
    .map((f) => ({
      path: f.path,
      name: String(f.name ?? "").slice(0, 200),
      type: String(f.type ?? "").slice(0, 100),
      size: Math.max(0, Math.round(Number(f.size) || 0)),
    }));
}

/** Rows for pet_records from uploaded files. */
export const recordRows = (files: StagedRecord[], petId: string, ownerId: string) =>
  files.map((f) => ({
    pet_id: petId,
    owner_id: ownerId,
    path: f.path,
    file_name: f.name,
    content_type: f.type,
    size_bytes: f.size,
  }));
