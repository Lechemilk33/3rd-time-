"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Photo } from "@/components/ui/photo";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function ImageUpload({
  value,
  onChange,
  folder,
  name,
  label = "Upload photo",
  className,
  aspect = "aspect-[4/3]",
  onBusyChange,
}: {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  /** When set, renders a hidden input so the URL is submitted with a <form>. */
  name?: string;
  label?: string;
  className?: string;
  aspect?: string;
  /** Lets a parent form hold its submit while the upload is still running. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    onBusyChange?.(true);
    try {
      const { url } = await uploadImage(file, folder);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-2xl border-2 border-dashed border-sea-200 bg-sea-50",
          aspect,
        )}
      >
        {value ? (
          <Photo src={value} alt="" className="h-full w-full" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-600 hover:text-ocean"
          >
            <ImagePlus className="size-8" aria-hidden />
            <span className="text-sm font-bold">{label}</span>
          </button>
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <LoaderCircle className="size-8 animate-spin text-ocean" aria-label="Uploading" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          <ImagePlus className="size-4" aria-hidden /> {value ? "Replace" : label}
        </Button>
        {value ? (
          <Button size="sm" variant="danger" onClick={() => onChange("")} disabled={busy}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
