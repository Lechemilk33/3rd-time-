"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveForm } from "@/app/admin/_actions/catalog";
import { SaveBar } from "@/components/admin/save-bar";
import { IconButton } from "@/components/admin/schema-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import type { FormDefinition, FormField, FormFieldType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: "heading", label: "Section heading" },
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "radio", label: "Pick one" },
  { value: "checkboxes", label: "Pick any" },
  { value: "select", label: "Dropdown" },
  { value: "yesno", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "agreement", label: "Agreement checkbox" },
];

const HAS_OPTIONS = new Set<FormFieldType>(["radio", "checkboxes", "select"]);

function newFieldId() {
  return `q_${crypto.randomUUID().slice(0, 8)}`;
}

export function FormBuilder({
  initial,
  services,
}: {
  initial: FormDefinition;
  services: { id: string; name: string }[];
}) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const setField = (index: number, patch: Partial<FormField>) =>
    setForm((f) => ({ ...f, fields: f.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) }));

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= form.fields.length) return;
    const fields = [...form.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    setForm({ ...form, fields });
  }

  function save() {
    start(async () => {
      const res = await saveForm(form);
      if (res.ok) {
        setSaved(form);
        setResult({ message: res.message });
      } else setResult({ error: res.error });
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <Field label="Form title" htmlFor="form-title">
          <Input id="form-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Intro" htmlFor="form-desc">
          <Textarea
            id="form-desc"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </Card>

      <ol className="space-y-3">
        {form.fields.map((field, index) => (
          <li
            key={field.id}
            className={field.type === "heading" ? "rounded-3xl border-2 border-sea-200 bg-sea-50 p-4" : "rounded-3xl border border-ink-100 bg-white p-4 shadow-sm"}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_12rem]">
                <Input
                  value={field.label}
                  aria-label="Question"
                  placeholder={field.type === "heading" ? "Section heading" : "Question"}
                  className={field.type === "heading" ? "font-display text-lg font-semibold" : "font-bold"}
                  onChange={(e) => setField(index, { label: e.target.value })}
                />
                <Select
                  value={field.type}
                  aria-label="Answer type"
                  onChange={(e) => {
                    const type = e.target.value as FormFieldType;
                    setField(index, {
                      type,
                      options: HAS_OPTIONS.has(type) ? (field.options?.length ? field.options : ["Option 1", "Option 2"]) : undefined,
                    });
                  }}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex">
                <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === form.fields.length - 1}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton
                  label="Delete question"
                  onClick={() => setForm({ ...form, fields: form.fields.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="size-4 text-red-700" />
                </IconButton>
              </div>
            </div>
            <AskFor services={services} value={field.services ?? []} onChange={(ids) => setField(index, { services: ids.length ? ids : undefined })} />
            {field.type !== "heading" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="space-y-3">
                  <Input
                    value={field.help ?? ""}
                    placeholder="Help text (optional)"
                    aria-label="Help text"
                    className="text-sm"
                    onChange={(e) => setField(index, { help: e.target.value })}
                  />
                  {HAS_OPTIONS.has(field.type) ? (
                    <Textarea
                      rows={3}
                      aria-label="Choices, one per line"
                      placeholder="One choice per line"
                      value={(field.options ?? []).join("\n")}
                      onChange={(e) => setField(index, { options: e.target.value.split("\n") })}
                    />
                  ) : null}
                </div>
                <label className="flex items-center gap-2 pt-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="size-5 accent-ocean"
                    checked={Boolean(field.required)}
                    onChange={(e) => setField(index, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setForm({ ...form, fields: [...form.fields, { id: newFieldId(), type: "text", label: "", required: false }] })}
        >
          <Plus className="size-4" aria-hidden /> Add question
        </Button>
        <Button
          variant="ghost"
          onClick={() => setForm({ ...form, fields: [...form.fields, { id: newFieldId(), type: "heading", label: "" }] })}
        >
          <Plus className="size-4" aria-hidden /> Add section heading
        </Button>
      </div>

      <div className="sticky bottom-4 z-20 rounded-2xl border border-ink-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <SaveBar
          dirty={dirty}
          pending={pending}
          onSave={save}
          onReset={() => setForm(saved)}
          message={result?.message}
          error={result?.error}
          label="Save form"
        />
      </div>
    </div>
  );
}

/** Who gets asked a question: everyone, or only clients who signed up for certain services. */
function AskFor({
  services,
  value,
  onChange,
}: {
  services: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  if (!services.length) return null;
  const everyone = value.length === 0;
  const chip = "rounded-full border-2 px-3 py-1 text-xs font-bold transition";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-extrabold tracking-wider text-ink-400 uppercase">Ask</span>
      <button
        type="button"
        aria-pressed={everyone}
        onClick={() => onChange([])}
        className={cn(chip, everyone ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-600 hover:border-ink-200")}
      >
        Everyone
      </button>
      <span className="px-1 text-xs font-bold text-ink-400">or only for</span>
      {services.map((s) => {
        const on = value.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
            className={cn(chip, on ? "border-ocean bg-sea-100 text-ink" : "border-ink-100 bg-white text-ink-600 hover:border-ink-200")}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
