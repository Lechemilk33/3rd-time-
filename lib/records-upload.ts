"use client";

import { RECORD_MAX_BYTES, RECORDS_BUCKET, recordTypeOf, type StagedRecord } from "@/lib/records";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/upload";

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/**
 * Uploads one vaccine record to the private bucket, in the pup owner's folder. Phone photos are
 * shrunk to a size that's still easy to read, so they go up quickly on a cell connection.
 */
export async function uploadRecord(file: File, ownerId: string): Promise<StagedRecord> {
  const type = recordTypeOf(file);
  if (!type) throw new Error("That type of file won’t open for us. A photo or a PDF works best.");
  // Most browsers can't read HEIC photos, so those go up as they are.
  const blob = type.startsWith("image/") && !/hei[cf]$/.test(type) ? await resizeImage(file, 2400, 0.9) : file;
  if (blob.size > RECORD_MAX_BYTES) throw new Error("That file is over 15 MB. A photo of the page works too.");
  const contentType = blob === file ? type : blob.type;
  const path = `${ownerId}/${crypto.randomUUID()}.${EXT[contentType] ?? "jpg"}`;
  const { error } = await createClient()
    .storage.from(RECORDS_BUCKET)
    .upload(path, blob, { contentType, upsert: false });
  if (error) {
    throw new Error(/exceed|too large|size/i.test(error.message) ? "That file is too big. Try a photo instead." : "Upload didn’t go through. Check your connection and try again.");
  }
  return { path, name: file.name.slice(0, 200) || "Record", type: contentType, size: blob.size };
}

/** Removes an uploaded file that was never attached to a pup. */
export async function discardRecord(path: string) {
  await createClient().storage.from(RECORDS_BUCKET).remove([path]);
}
