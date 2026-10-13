"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ImageUpload } from "@/components/image-upload";
import { Photo } from "@/components/ui/photo";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import type { FieldDef } from "@/lib/sections";

type Value = Record<string, unknown>;

/** Builds an editing form from a field schema (see lib/sections.ts). */
export function SchemaForm({
  fields,
  value,
  onChange,
  imageFolder,
}: {
  fields: FieldDef[];
  value: Value;
  onChange: (value: Value) => void;
  imageFolder: string;
}) {
  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <SchemaField
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(v) => onChange({ ...value, [field.key]: v })}
          imageFolder={imageFolder}
        />
      ))}
    </div>
  );
}

function SchemaField({
  field,
  value,
  onChange,
  imageFolder,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  imageFolder: string;
}) {
  const id = useId();
  const text = typeof value === "string" ? value : value == null ? "" : String(value);

  switch (field.type) {
    case "text":
    case "url":
      return (
        <Field label={field.label} htmlFor={id} help={field.help}>
          <Input
            id={id}
            value={text}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            inputMode={field.type === "url" ? "url" : undefined}
          />
        </Field>
      );
    case "textarea":
      return (
        <Field label={field.label} htmlFor={id} help={field.help}>
          <Textarea id={id} value={text} rows={4} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "number":
      return (
        <Field label={field.label} htmlFor={id} help={field.help}>
          <Input
            id={id}
            type="number"
            className="max-w-40"
            value={text}
            onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          />
        </Field>
      );
    case "boolean":
      return (
        <label className="flex cursor-pointer items-center gap-3 font-bold">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="relative h-7 w-12 shrink-0 rounded-full bg-ink-200 transition peer-checked:bg-ocean peer-focus-visible:ring-4 peer-focus-visible:ring-sea-200 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          {field.label}
        </label>
      );
    case "color":
      return (
        <Field label={field.label} htmlFor={id} help={field.help}>
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(text) ? text : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-xl border-2 border-ink-100 bg-white p-1"
            />
            <Input value={text} onChange={(e) => onChange(e.target.value)} className="max-w-32 font-mono uppercase" />
          </div>
        </Field>
      );
    case "select":
      return (
        <Field label={field.label} htmlFor={id} help={field.help}>
          <Select id={id} value={text} onChange={(e) => onChange(e.target.value)} className="max-w-xs">
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "image":
      return (
        <Field label={field.label} help={field.help}>
          <ImageUpload value={text} onChange={onChange} folder={imageFolder} />
        </Field>
      );
    case "images":
      return <ImagesField field={field} value={value} onChange={onChange} imageFolder={imageFolder} />;
    case "strings":
      return <StringsField id={id} field={field} value={value} onChange={onChange} />;
    case "group":
      return (
        <fieldset className="space-y-4 rounded-2xl border border-ink-100 p-4">
          <legend className="px-1 font-bold">{field.label}</legend>
          <SchemaForm
            fields={field.fields}
            value={(value && typeof value === "object" ? value : {}) as Value}
            onChange={onChange}
            imageFolder={imageFolder}
          />
        </fieldset>
      );
    case "list":
      return <ListField field={field} value={value} onChange={onChange} imageFolder={imageFolder} />;
  }
}

/** Several photos: upload many at once, drag (or use the arrows) to reorder, remove any. */
function ImagesField({
  field,
  value,
  onChange,
  imageFolder,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  imageFolder: string;
}) {
  const urls = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
  const [pending, setPending] = useState<{ key: string; preview: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Uploads finish later: add them to whatever the list is by then, not what it was when they started.
  const latest = useRef({ urls, onChange });
  useEffect(() => {
    latest.current = { urls, onChange };
  });

  async function add(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, 20);
    if (!list.length) return;
    setError(null);
    const batch = list.map((f) => ({ key: crypto.randomUUID(), preview: URL.createObjectURL(f) }));
    setPending((p) => [...p, ...batch]);
    const results = await Promise.allSettled(list.map((f) => uploadImage(f, imageFolder, 1800)));
    batch.forEach((b) => URL.revokeObjectURL(b.preview));
    setPending((p) => p.filter((x) => !batch.some((b) => b.key === x.key)));
    const done = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.url] : []));
    if (done.length) latest.current.onChange([...latest.current.urls, ...done]);
    const failed = results.length - done.length;
    if (failed) setError(`${failed} photo${failed === 1 ? "" : "s"} didn’t upload. Try again.`);
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= urls.length || from === to) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div>
      <p className="mb-1 text-sm font-bold">{field.label}</p>
      {field.help ? <p className="mb-3 text-sm text-ink-600">{field.help}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((url, i) => (
          <li
            key={url}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom != null) move(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
            className={cn(
              "group relative aspect-[4/3] cursor-grab overflow-hidden rounded-2xl border-2 bg-sea-50",
              dragFrom === i ? "border-ocean opacity-60" : "border-ink-100",
            )}
          >
            <Photo src={url} alt={`Photo ${i + 1}`} className="h-full w-full" draggable={false} />
            {i === 0 ? (
              <span className="absolute top-2 left-2 rounded-full bg-sun px-2 py-0.5 text-[11px] font-extrabold">Shows first</span>
            ) : null}
            <button
              type="button"
              onClick={() => onChange(urls.filter((_, j) => j !== i))}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-white/95 text-ink-600 shadow transition hover:text-red-700"
            >
              <X className="size-4" aria-hidden />
            </button>
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move photo ${i + 1} earlier`}
                className="grid size-8 place-items-center rounded-full bg-white/95 text-ink-600 shadow transition hover:text-ink disabled:invisible"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === urls.length - 1}
                aria-label={`Move photo ${i + 1} later`}
                className="grid size-8 place-items-center rounded-full bg-white/95 text-ink-600 shadow transition hover:text-ink disabled:invisible"
              >
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} className="relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-ink-100 bg-sea-50">
            <Photo src={p.preview} alt="" className="h-full w-full opacity-60" />
            <span className="absolute inset-0 grid place-items-center">
              <LoaderCircle className="size-7 animate-spin text-ocean" aria-label="Uploading" />
            </span>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) void add(e.dataTransfer.files);
            }}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-sea-200 bg-sea-50/60 text-ink-600 transition hover:border-ocean hover:text-ocean"
          >
            <ImagePlus className="size-7" aria-hidden />
            <span className="text-sm font-bold">{urls.length ? "Add more" : "Add photos"}</span>
            <span className="text-xs">Pick several at once</span>
          </button>
        </li>
      </ul>
      {error ? <p className="mt-2 text-sm font-bold text-red-700">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StringsField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  // Keep the raw text locally so blank lines survive while typing.
  const [text, setText] = useState(Array.isArray(value) ? value.join("\n") : "");
  return (
    <Field label={field.label} htmlFor={id} help={field.help}>
      <Textarea
        id={id}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n"));
        }}
      />
    </Field>
  );
}

function ListField({
  field,
  value,
  onChange,
  imageFolder,
}: {
  field: Extract<FieldDef, { type: "list" }>;
  value: unknown;
  onChange: (value: unknown) => void;
  imageFolder: string;
}) {
  const items = (Array.isArray(value) ? value : []) as Value[];
  // Stable keys so inputs keep focus when items move.
  const [keys, setKeys] = useState(() => items.map(() => crypto.randomUUID()));
  const itemKeys = keys.length === items.length ? keys : items.map((_, i) => keys[i] ?? `k-${i}`);

  function update(next: Value[], nextKeys: string[]) {
    setKeys(nextKeys);
    onChange(next);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const nextKeys = [...itemKeys];
    [next[index], next[target]] = [next[target], next[index]];
    [nextKeys[index], nextKeys[target]] = [nextKeys[target], nextKeys[index]];
    update(next, nextKeys);
  }

  return (
    <div>
      <p className="mb-2 text-sm font-bold">{field.label}</p>
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={itemKeys[index]} className="rounded-2xl border border-ink-100 bg-sand/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-ink-600 capitalize">
                {field.itemLabel} {index + 1}
              </span>
              <div className="flex gap-1">
                <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton
                  label="Remove"
                  onClick={() =>
                    update(
                      items.filter((_, i) => i !== index),
                      itemKeys.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 className="size-4 text-red-700" />
                </IconButton>
              </div>
            </div>
            <SchemaForm
              fields={field.fields}
              value={item}
              onChange={(v) => update(items.map((it, i) => (i === index ? v : it)), itemKeys)}
              imageFolder={imageFolder}
            />
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={() => update([...items, {}], [...itemKeys, crypto.randomUUID()])}
      >
        <Plus className="size-4" aria-hidden /> Add {field.itemLabel}
      </Button>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-xl text-ink-600 transition hover:bg-white hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}
