"use client";

import { ArrowDown, ArrowUp, ClipboardList, Plus, Repeat, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveForm } from "@/app/admin/_actions/catalog";
import { SaveBar } from "@/components/admin/save-bar";
import { IconButton } from "@/components/admin/schema-form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { KIND_META } from "@/lib/booking";
import { askedEachBooking, canHaveDetails } from "@/lib/intake";
import type { FormDefinition, FormField, FormFieldType, ServiceKind } from "@/lib/types";
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

/** Example "every booking" questions per kind of service. */
const EACH_EXAMPLES: Record<ServiceKind, string> = {
  window: "e.g. “Anything different about this visit?”",
  time: "e.g. “What would you like to cover?”",
  day: "e.g. “Lunch packed?” or “Pick-up person if not you”",
  stay: "e.g. “Feeding schedule for this stay” or “Who has a spare key?”",
};

type ServiceOption = { id: string; name: string; kind: ServiceKind };
type Tab = "all" | "everyone" | string;

function newFieldId() {
  return `q_${crypto.randomUUID().slice(0, 8)}`;
}

export function FormBuilder({
  initial,
  services,
  initialTab,
}: {
  initial: FormDefinition;
  services: ServiceOption[];
  /** Service id to open on (from the Services page). */
  initialTab?: string | null;
}) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [tab, setTab] = useState<Tab>(() => (initialTab && services.some((s) => s.id === initialTab) ? initialTab : "all"));
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const fields = form.fields;

  const setField = (id: string, patch: Partial<FormField>) =>
    setForm((f) => ({ ...f, fields: f.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)) }));

  /** Moves a question past its neighbor in the list being shown. */
  function move(id: string, dir: -1 | 1, shownIds: string[]) {
    const at = shownIds.indexOf(id);
    const other = shownIds[at + dir];
    if (at < 0 || !other) return;
    setForm((f) => {
      const list = [...f.fields];
      const a = list.findIndex((x) => x.id === id);
      const b = list.findIndex((x) => x.id === other);
      [list[a], list[b]] = [list[b], list[a]];
      return { ...f, fields: list };
    });
  }

  /** Adds a field right after the last one in the same group (or at the end). */
  function add(field: Omit<FormField, "id">, after: string[]) {
    // Yes/no answers usually need a "but…", so new ones come with a notes box.
    const created = { ...field, ...(field.type === "yesno" ? { details: true } : {}), id: newFieldId() } as FormField;
    setForm((f) => {
      const list = [...f.fields];
      const last = after.length ? list.findIndex((x) => x.id === after[after.length - 1]) : -1;
      list.splice(last >= 0 ? last + 1 : list.length, 0, created);
      return { ...f, fields: list };
    });
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

  const questions = (list: FormField[]) => list.filter((f) => f.type !== "heading").length;
  const forService = (id: string) => fields.filter((f) => f.services?.includes(id));
  const everyone = fields.filter((f) => !f.services?.length);
  const service = services.find((s) => s.id === tab);

  const card = (field: FormField, shown: FormField[], index: number) => (
    <QuestionCard
      key={field.id}
      field={field}
      services={services}
      first={index === 0}
      last={index === shown.length - 1}
      onChange={(patch) => setField(field.id, patch)}
      onMove={(dir) =>
        move(
          field.id,
          dir,
          shown.map((x) => x.id),
        )
      }
      onDelete={() => setForm((f) => ({ ...f, fields: f.fields.filter((x) => x.id !== field.id) }))}
    />
  );

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Show questions for">
        {(
          [
            { key: "all", label: "All questions", count: questions(fields), emoji: null },
            { key: "everyone", label: "Everyone", count: questions(everyone), emoji: null },
            ...services.map((s) => ({ key: s.id, label: s.name, count: questions(forService(s.id)), emoji: KIND_META[s.kind].emoji })),
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition",
              tab === t.key ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-600 hover:border-ink-200",
            )}
          >
            {t.emoji ? <span aria-hidden>{t.emoji}</span> : null}
            {t.label}
            <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-white/20" : "bg-sea-50 text-ocean")}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "all" ? (
        <>
          <p className="text-sm text-ink-600">
            Every question in one list. Nothing is asked at sign-up: questions are asked the first time a client books the service
            they’re for (or every time, if you choose). “Everyone” questions come up before a client’s first regular visit.
          </p>
          <ol className="space-y-3">{fields.map((f, i) => card(f, fields, i))}</ol>
          <AddButtons onAdd={(type) => add({ type, label: "", required: false }, fields.map((f) => f.id))} />
        </>
      ) : tab === "everyone" ? (
        <>
          <p className="text-sm text-ink-600">Asked once, the first time a client books a regular visit (not the meet & greet).</p>
          <ol className="space-y-3">{everyone.map((f, i) => card(f, everyone, i))}</ol>
          <AddButtons onAdd={(type) => add({ type, label: "", required: false }, everyone.map((f) => f.id))} />
        </>
      ) : service ? (
        <ServiceTab
          service={service}
          fields={forService(service.id)}
          card={card}
          onAdd={(type, each, after) =>
            add({ type, label: "", required: false, services: [service.id], ask: each ? "each" : undefined }, after)
          }
        />
      ) : null}

      <div className="sticky bottom-4 z-20 rounded-2xl border border-ink-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <SaveBar dirty={dirty} pending={pending} onSave={save} onReset={() => setForm(saved)} message={result?.message} error={result?.error} label="Save form" />
      </div>
    </div>
  );
}

function ServiceTab({
  service,
  fields,
  card,
  onAdd,
}: {
  service: ServiceOption;
  fields: FormField[];
  card: (field: FormField, shown: FormField[], index: number) => React.ReactNode;
  onAdd: (type: FormFieldType, each: boolean, after: string[]) => void;
}) {
  const once = fields.filter((f) => !askedEachBooking(f));
  const each = fields.filter(askedEachBooking);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sea-100 text-ocean">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Once, the first time they book it</h2>
            <p className="text-sm text-ink-600">
              Asked when a client signs up for {service.name}, or the first time they book it. Saved to their profile.
            </p>
          </div>
        </div>
        {once.length ? (
          <ol className="space-y-3">{once.map((f, i) => card(f, once, i))}</ol>
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-ink-100 p-4 text-sm text-ink-600">No questions just for {service.name} yet.</p>
        )}
        <AddButtons onAdd={(type) => onAdd(type, false, once.map((f) => f.id))} />
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sun-100 text-ink">
            <Repeat className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Every time they book</h2>
            <p className="text-sm text-ink-600">
              Shown in the booking flow and saved on that booking — you’ll see the answers on the calendar. {EACH_EXAMPLES[service.kind]}
            </p>
          </div>
        </div>
        {each.length ? (
          <ol className="space-y-3">{each.map((f, i) => card(f, each, i))}</ol>
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-ink-100 p-4 text-sm text-ink-600">Nothing asked per booking yet.</p>
        )}
        <AddButtons onAdd={(type) => onAdd(type, true, each.length ? each.map((f) => f.id) : fields.map((f) => f.id))} />
      </section>
    </div>
  );
}

function AddButtons({ onAdd }: { onAdd: (type: FormFieldType) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => onAdd("text")}>
        <Plus className="size-4" aria-hidden /> Add question
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onAdd("heading")}>
        <Plus className="size-4" aria-hidden /> Add section heading
      </Button>
    </div>
  );
}

function QuestionCard({
  field,
  services,
  first,
  last,
  onChange,
  onMove,
  onDelete,
}: {
  field: FormField;
  services: ServiceOption[];
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<FormField>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const heading = field.type === "heading";
  return (
    <li className={heading ? "rounded-3xl border-2 border-sea-200 bg-sea-50 p-4" : "rounded-3xl border border-ink-100 bg-white p-4 shadow-sm"}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_12rem]">
          <Input
            value={field.label}
            aria-label="Question"
            placeholder={heading ? "Section heading" : "Question"}
            className={heading ? "font-display text-lg font-semibold" : "font-bold"}
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <Select
            value={field.type}
            aria-label="Answer type"
            onChange={(e) => {
              const type = e.target.value as FormFieldType;
              onChange({ type, options: HAS_OPTIONS.has(type) ? (field.options?.length ? field.options : ["Option 1", "Option 2"]) : undefined });
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
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Delete question" onClick={onDelete}>
            <Trash2 className="size-4 text-red-700" />
          </IconButton>
        </div>
      </div>
      <AskFor
        services={services}
        value={field.services ?? []}
        ask={field.ask ?? "once"}
        onChange={(ids) => onChange({ services: ids.length ? ids : undefined, ask: ids.length ? field.ask : undefined })}
        onAsk={(ask) => onChange({ ask: ask === "each" ? "each" : undefined })}
      />
      {!heading ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="space-y-3">
            <Input value={field.help ?? ""} placeholder="Help text (optional)" aria-label="Help text" className="text-sm" onChange={(e) => onChange({ help: e.target.value })} />
            {HAS_OPTIONS.has(field.type) ? (
              <Textarea
                rows={3}
                aria-label="Choices, one per line"
                placeholder="One choice per line"
                value={(field.options ?? []).join("\n")}
                onChange={(e) => onChange({ options: e.target.value.split("\n") })}
              />
            ) : null}
          </div>
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="size-5 accent-ocean" checked={Boolean(field.required)} onChange={(e) => onChange({ required: e.target.checked })} />
              Required
            </label>
            {canHaveDetails(field.type) ? (
              <label className="flex items-center gap-2 text-sm font-bold" title="Adds an optional “Tell us more” box under the answer.">
                <input type="checkbox" className="size-5 accent-ocean" checked={Boolean(field.details)} onChange={(e) => onChange({ details: e.target.checked || undefined })} />
                Notes box
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Who gets asked a question (everyone or certain services) and when (intake or every booking). */
function AskFor({
  services,
  value,
  ask,
  onChange,
  onAsk,
}: {
  services: ServiceOption[];
  value: string[];
  ask: "once" | "each";
  onChange: (ids: string[]) => void;
  onAsk: (ask: "once" | "each") => void;
}) {
  if (!services.length) return null;
  const everyone = value.length === 0;
  const chip = "rounded-full border-2 px-3 py-1 text-xs font-bold transition";
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
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
      {!everyone ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-extrabold tracking-wider text-ink-400 uppercase">When</span>
          {(["once", "each"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={ask === a}
              onClick={() => onAsk(a)}
              className={cn(chip, ask === a ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-600 hover:border-ink-200")}
            >
              {a === "once" ? "Once, the first time" : "Every time they book"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
