"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ImageUpload } from "@/components/image-upload";
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
