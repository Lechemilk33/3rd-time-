"use client";

import { MEDIA_BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";


/**
 * Shrinks phone photos (often 4–8 MB) to a web-friendly WebP before upload.
 * Falls back to the original file if the browser can't decode it.
 */
export async function resizeImage(file: File, maxSize = 2000, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export type UploadedImage = { url: string; path: string };

/** Uploads to Supabase Storage under `folder/` and returns the public URL. */
export async function uploadImage(file: File, folder: string, maxSize?: number): Promise<UploadedImage> {
  const blob = await resizeImage(file, maxSize);
  const ext = blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder.replace(/\/+$/, "")}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: blob.type || file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
