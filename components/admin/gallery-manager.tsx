"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  addGalleryPhotos,
  deleteGalleryPhoto,
  moveGalleryPhoto,
  updateGalleryPhoto,
} from "@/app/admin/_actions/catalog";
import { IconButton } from "@/components/admin/schema-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { Photo } from "@/components/ui/photo";
import { uploadImage } from "@/lib/upload";
import type { GalleryPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

export function GalleryManager({ initial }: { initial: GalleryPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, 30);
    setProgress({ done: 0, total: list.length });
    const uploaded: { url: string; path: string }[] = [];
    for (const file of list) {
      try {
        uploaded.push(await uploadImage(file, "gallery"));
      } catch (e) {
        setError(`Couldn’t upload ${file.name}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (inputRef.current) inputRef.current.value = "";
    if (uploaded.length) {
      const res = await addGalleryPhotos(uploaded);
      if (res.photos) setPhotos(res.photos);
      if (!res.ok) setError(res.error ?? "Couldn’t save photos.");
    }
    setProgress(null);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; photos?: GalleryPhoto[] }>) {
    start(async () => {
      const res = await action();
      if (res.photos) setPhotos(res.photos);
      if (!res.ok) setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-3xl border-2 border-dashed border-sea-200 bg-white p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <ImagePlus className="mx-auto size-10 text-ocean" aria-hidden />
        <p className="mt-2 font-bold">Drop photos here or pick them from your phone</p>
        <p className="text-sm text-ink-600">Photos are resized automatically so the site stays fast.</p>
        <Button className="mt-4" onClick={() => inputRef.current?.click()} disabled={Boolean(progress)}>
          {progress ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Uploading {progress.done}/{progress.total}
            </>
          ) : (
            "Choose photos"
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {photos.length === 0 ? (
        <p className="text-center text-ink-600">No photos yet. The gallery shows friendly placeholders until you add some.</p>
      ) : (
        <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", pending && "opacity-80")}>
          {photos.map((photo, index) => (
            <li key={photo.id} className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-sea-50">
                <Photo src={photo.image_url} alt={photo.caption ?? ""} className={cn("h-full w-full", !photo.visible && "opacity-40")} />
                {!photo.visible ? (
                  <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">Hidden</span>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <CaptionInput photo={photo} onError={setError} />
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <IconButton label="Move earlier" onClick={() => run(() => moveGalleryPhoto(photo.id, "up"))} disabled={pending || index === 0}>
                      <ArrowLeft className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Move later"
                      onClick={() => run(() => moveGalleryPhoto(photo.id, "down"))}
                      disabled={pending || index === photos.length - 1}
                    >
                      <ArrowRight className="size-4" />
                    </IconButton>
                    <IconButton
                      label={photo.visible ? "Hide" : "Show"}
                      onClick={() => {
                        setPhotos((all) => all.map((p) => (p.id === photo.id ? { ...p, visible: !p.visible } : p)));
                        run(() => updateGalleryPhoto(photo.id, { visible: !photo.visible }));
                      }}
                    >
                      {photo.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>
                  </div>
                  <IconButton
                    label="Delete photo"
                    onClick={() => {
                      if (confirm("Delete this photo?")) run(() => deleteGalleryPhoto(photo.id));
                    }}
                  >
                    <Trash2 className="size-4 text-red-700" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CaptionInput({ photo, onError }: { photo: GalleryPhoto; onError: (e: string) => void }) {
  const [value, setValue] = useState(photo.caption ?? "");
  const [saved, setSaved] = useState(photo.caption ?? "");
  const [, start] = useTransition();
  return (
    <Input
      value={value}
      placeholder="Add a caption (optional)"
      aria-label="Caption"
      className="py-2 text-sm"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value === saved) return;
        start(async () => {
          const res = await updateGalleryPhoto(photo.id, { caption: value });
          if (res.ok) setSaved(value);
          else onError(res.error ?? "Couldn’t save caption.");
        });
      }}
    />
  );
}
