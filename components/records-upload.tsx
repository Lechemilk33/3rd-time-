"use client";

/* eslint-disable @next/next/no-img-element -- private files behind short-lived links, not optimizable */
import { Camera, CircleAlert, CircleCheck, FileImage, FileText, LoaderCircle, RotateCw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { fileSize, isPdf, RECORD_ACCEPT, recordTypeOf, type PetRecordFile, type StagedRecord } from "@/lib/records";
import { discardRecord, uploadRecord } from "@/lib/records-upload";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = {
  key: string;
  name: string;
  type: string;
  size: number;
  /** Local preview of a photo while it uploads. */
  preview: string | null;
  status: "uploading" | "staged" | "saved" | "error";
  error?: string;
  file: File;
  staged?: StagedRecord;
};

const viewable = (type: string) => /^image\/(jpeg|png|webp|gif|avif)$/.test(type);

/**
 * Add vaccine records: drag files in, pick them, or (on a phone) take a photo of the paperwork.
 * With `attach`, each file is saved to the pup as soon as it's up. Without it, uploads wait for the
 * surrounding form, which receives them in the hidden `name` input.
 */
export function RecordsUpload({
  ownerId,
  files = [],
  attach,
  remove,
  name,
  onBusyChange,
  isNew,
  compact = false,
}: {
  /** Whose folder the files go in (the pup's owner). */
  ownerId: string;
  /** Files already saved with the pup. */
  files?: PetRecordFile[];
  attach?: (files: StagedRecord[]) => Promise<ActionResult>;
  remove?: (id: string) => Promise<ActionResult>;
  name?: string;
  onBusyChange?: (busy: boolean) => void;
  /** Marks saved files the team hasn't looked at yet. */
  isNew?: (file: PetRecordFile) => boolean;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chooseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());

  const busy = items.some((i) => i.status === "uploading");
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const patch = (key: string, next: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...next } : i)));

  async function send(item: Item) {
    patch(item.key, { status: "uploading", error: undefined });
    try {
      const staged = await uploadRecord(item.file, ownerId);
      if (!attach) return patch(item.key, { status: "staged", staged });
      const res = await attach([staged]);
      if (!res.ok) {
        void discardRecord(staged.path);
        return patch(item.key, { status: "error", error: res.error ?? "Couldn’t save it. Try again." });
      }
      patch(item.key, { status: "saved", staged });
    } catch (e) {
      patch(item.key, { status: "error", error: e instanceof Error ? e.message : "Upload didn’t go through." });
    }
  }

  function add(list: FileList | null | undefined) {
    if (!list?.length) return;
    const all = [...list];
    const ok = all.filter((f) => recordTypeOf(f));
    const skipped = all.filter((f) => !recordTypeOf(f)).map((f) => f.name);
    setError(skipped.length ? `${skipped.join(", ")} ${skipped.length === 1 ? "isn’t a photo or PDF" : "aren’t photos or PDFs"}, so we left ${skipped.length === 1 ? "it" : "them"} out.` : null);
    const next = ok.slice(0, 12).map((file): Item => {
      const preview = viewable(file.type) ? URL.createObjectURL(file) : null;
      if (preview) previews.current.add(preview);
      return {
        key: crypto.randomUUID(),
        name: file.name || "Photo",
        type: file.type,
        size: file.size,
        preview,
        status: "uploading",
        file,
      };
    });
    setItems((cur) => [...cur, ...next]);
    next.forEach((item) => void send(item));
  }

  function drop(item: Item) {
    if (item.staged && item.status === "staged") void discardRecord(item.staged.path);
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
      previews.current.delete(item.preview);
    }
    setItems((list) => list.filter((i) => i.key !== item.key));
  }

  async function removeSaved(file: PetRecordFile) {
    if (!remove || !confirm(`Remove “${file.name}”?`)) return;
    setError(null);
    setHidden((h) => [...h, file.id]);
    const res = await remove(file.id);
    if (!res.ok) {
      setHidden((h) => h.filter((id) => id !== file.id));
      setError(res.error ?? "Couldn’t remove that file.");
    }
  }

  const onDrag = (e: DragEvent, on: boolean) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setOver(on);
  };

  // Saved files come back from the server; hide the local copy once they do.
  const savedPaths = new Set(files.map((f) => f.path));
  const local = items.filter((i) => !(i.status === "saved" && i.staged && savedPaths.has(i.staged.path)));
  const shown = files.filter((f) => !hidden.includes(f.id));
  const staged = items.filter((i) => i.status === "staged" && i.staged).map((i) => i.staged!);

  return (
    <div className="space-y-3">
      {name ? <input type="hidden" name={name} value={JSON.stringify(staged)} /> : null}

      <div
        onDragEnter={(e) => onDrag(e, true)}
        onDragOver={(e) => onDrag(e, true)}
        onDragLeave={(e) => onDrag(e, false)}
        onDrop={(e) => {
          onDrag(e, false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed transition",
          over ? "border-ocean bg-sea-100" : "border-sea-200 bg-sea-50/60",
          compact ? "flex flex-wrap items-center gap-3 p-3" : "px-4 py-6 text-center",
        )}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-white text-ocean shadow-sm",
            compact ? "size-10" : "mx-auto mb-3 size-12",
          )}
        >
          <Upload className="size-5" aria-hidden />
        </span>
        <div className={cn(compact && "min-w-0 flex-1")}>
          <p className="font-bold">{compact ? "Add records" : "Add a photo or PDF"}</p>
          <p className="text-sm text-ink-600">
            <span className="pointer-coarse:hidden">Drag files here or choose them. </span>
            Photos or PDFs, up to 15 MB each.
          </p>
        </div>
        <div className={cn("flex flex-wrap gap-2", !compact && "mt-4 justify-center")}>
          <Button size="sm" variant="secondary" className="hidden pointer-coarse:inline-flex" onClick={() => cameraRef.current?.click()}>
            <Camera className="size-4" aria-hidden /> Take a photo
          </Button>
          <Button size="sm" variant="outline" onClick={() => chooseRef.current?.click()}>
            <Upload className="size-4" aria-hidden /> Choose files
          </Button>
        </div>
        <input
          ref={chooseRef}
          type="file"
          multiple
          accept={RECORD_ACCEPT}
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}

      {shown.length || local.length ? (
        <ul className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
          {shown.map((f) => (
            <Tile
              key={f.id}
              name={f.name}
              type={f.type}
              src={viewable(f.type) ? f.url : null}
              href={f.url}
              detail={isNew?.(f) ? "New" : fileSize(f.size)}
              fresh={isNew?.(f)}
              onRemove={remove ? () => void removeSaved(f) : undefined}
            />
          ))}
          {local.map((i) => (
            <Tile
              key={i.key}
              name={i.name}
              type={i.type}
              src={i.preview}
              status={i.status}
              detail={
                i.status === "uploading"
                  ? "Uploading…"
                  : i.status === "staged"
                    ? "Ready · saved with your pup"
                    : i.status === "saved"
                      ? "Saved"
                      : i.error
              }
              onRetry={i.status === "error" ? () => void send(i) : undefined}
              onRemove={i.status === "uploading" || i.status === "saved" ? undefined : () => drop(i)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Tile({
  name,
  type,
  src,
  href,
  detail,
  status,
  fresh,
  onRetry,
  onRemove,
}: {
  name: string;
  type: string;
  src: string | null;
  href?: string | null;
  detail?: string;
  status?: Item["status"];
  fresh?: boolean;
  onRetry?: () => void;
  onRemove?: () => void;
}) {
  const failed = status === "error";
  const preview = src ? (
    <img src={src} alt="" className="h-full w-full object-cover" />
  ) : (
    <span className="grid h-full place-items-center text-sea-300">
      {isPdf(type, name) ? <FileText className="size-10" aria-hidden /> : <FileImage className="size-10" aria-hidden />}
    </span>
  );
  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 bg-white",
        failed ? "border-red-200" : fresh ? "border-sun-300" : "border-ink-100",
      )}
    >
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-sea-50" aria-label={`Open ${name}`}>
          {preview}
        </a>
      ) : (
        <div className="aspect-[4/3] bg-sea-50">{preview}</div>
      )}
      {status === "uploading" ? (
        <span className="absolute inset-x-0 top-0 grid aspect-[4/3] place-items-center bg-white/60">
          <LoaderCircle className="size-7 animate-spin text-ocean" aria-label="Uploading" />
        </span>
      ) : null}
      <div className="flex items-start gap-1.5 px-3 py-2">
        {status === "saved" || status === "staged" ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        ) : failed ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{name}</span>
          <span className={cn("block text-xs", failed ? "font-bold text-red-700" : fresh ? "font-bold text-amber-700" : "text-ink-600")}>
            {detail}
          </span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-ocean hover:underline">
              <RotateCw className="size-3" aria-hidden /> Try again
            </button>
          ) : null}
        </span>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-white/95 text-ink-600 shadow transition hover:text-red-700"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
