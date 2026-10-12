"use client";

import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  addSection,
  deleteSection,
  duplicateSection,
  moveSection,
  saveSection,
  setSectionVisible,
} from "@/app/admin/_actions/content";
import { SaveBar } from "@/components/admin/save-bar";
import { IconButton, SchemaForm } from "@/components/admin/schema-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SECTION_TYPES, SECTION_TYPE_MAP } from "@/lib/sections";
import type { Section, SectionData } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SectionsEditor({ pageId, initialSections }: { pageId: string; initialSections: Section[] }) {
  const [sections, setSections] = useState(initialSections);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string; sections?: Section[] }>, after?: (s: Section[]) => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      if (res.sections) {
        setSections(res.sections);
        after?.(res.sections);
      }
    });
  }

  function add(type: string, index: number) {
    setPickerAt(null);
    run(
      () => addSection(pageId, type, index),
      (next) => setOpenId(next[Math.min(index, next.length - 1)]?.id ?? null),
    );
  }

  return (
    <div className={cn("space-y-3", pending && "opacity-80")}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {sections.length === 0 ? <p className="text-ink-600">This page is empty. Add your first section below.</p> : null}

      {sections.map((section, index) => (
        <div key={section.id}>
          <SectionCard
            section={section}
            open={openId === section.id}
            onToggleOpen={() => setOpenId(openId === section.id ? null : section.id)}
            isFirst={index === 0}
            isLast={index === sections.length - 1}
            busy={pending}
            onMove={(dir) => run(() => moveSection(pageId, section.id, dir))}
            onDuplicate={() => run(() => duplicateSection(pageId, section.id))}
            onDelete={() => {
              const label = SECTION_TYPE_MAP[section.type]?.label ?? "section";
              if (confirm(`Delete this ${label}? This can’t be undone.`)) run(() => deleteSection(pageId, section.id));
            }}
            onVisible={(visible) => {
              setSections((all) => all.map((s) => (s.id === section.id ? { ...s, visible } : s)));
              startTransition(async () => {
                const res = await setSectionVisible(section.id, visible);
                if (!res.ok) setError(res.error ?? "Couldn’t update visibility.");
              });
            }}
            onSaved={(data) => setSections((all) => all.map((s) => (s.id === section.id ? { ...s, data } : s)))}
          />
          {pickerAt === index + 1 ? (
            <SectionPicker onPick={(type) => add(type, index + 1)} onClose={() => setPickerAt(null)} />
          ) : (
            <AddBetween onClick={() => setPickerAt(index + 1)} />
          )}
        </div>
      ))}

      {sections.length === 0 ? (
        pickerAt === 0 ? (
          <SectionPicker onPick={(type) => add(type, 0)} onClose={() => setPickerAt(null)} />
        ) : (
          <Button onClick={() => setPickerAt(0)}>
            <Plus className="size-4" aria-hidden /> Add a section
          </Button>
        )
      ) : null}
    </div>
  );
}

function AddBetween({ onClick }: { onClick: () => void }) {
  return (
    <div className="group relative flex h-8 items-center justify-center">
      <div className="absolute inset-x-6 top-1/2 h-px bg-ink-100 opacity-0 transition group-hover:opacity-100" />
      <button
        type="button"
        onClick={onClick}
        className="relative flex items-center gap-1 rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-bold text-ink-600 shadow-sm transition hover:border-ocean hover:text-ocean"
      >
        <Plus className="size-3.5" aria-hidden /> Add section here
      </button>
    </div>
  );
}

function SectionPicker({ onPick, onClose }: { onPick: (type: string) => void; onClose: () => void }) {
  return (
    <div className="my-3 rounded-3xl border-2 border-ocean/30 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-lg font-semibold">Choose a section</p>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SECTION_TYPES.map((def) => (
          <li key={def.type}>
            <button
              type="button"
              onClick={() => onPick(def.type)}
              className="flex h-full w-full items-start gap-3 rounded-2xl border border-ink-100 p-3 text-left transition hover:border-ocean hover:bg-sea-50"
            >
              <span className="text-2xl" aria-hidden>
                {def.icon}
              </span>
              <span>
                <span className="block font-bold">{def.label}</span>
                <span className="text-sm text-ink-600">{def.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionCard({
  section,
  open,
  onToggleOpen,
  isFirst,
  isLast,
  busy,
  onMove,
  onDuplicate,
  onDelete,
  onVisible,
  onSaved,
}: {
  section: Section;
  open: boolean;
  onToggleOpen: () => void;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (dir: "up" | "down") => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onVisible: (visible: boolean) => void;
  onSaved: (data: SectionData) => void;
}) {
  const def = SECTION_TYPE_MAP[section.type];
  const [draft, setDraft] = useState<SectionData>(section.data);
  const [saving, startSave] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(section.data);
  const summary = typeof section.data.heading === "string" && section.data.heading ? section.data.heading : def?.description;

  function save() {
    startSave(async () => {
      const res = await saveSection(section.id, draft);
      if (res.ok) {
        onSaved(draft);
        setResult({ message: res.message });
      } else {
        setResult({ error: res.error });
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-3xl border bg-white shadow-sm transition",
        open ? "border-ocean/40 shadow-md" : "border-ink-100",
        !section.visible && "bg-white/60",
      )}
    >
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button type="button" onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sea-50 text-xl" aria-hidden>
            {def?.icon ?? "🧩"}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{def?.label ?? section.type}</span>
              {!section.visible ? <Badge tone="gray">Hidden</Badge> : null}
              {dirty ? <Badge tone="coral">Unsaved</Badge> : null}
            </span>
            <span className="block truncate text-sm text-ink-600">{summary}</span>
          </span>
          <ChevronDown className={cn("ml-auto size-5 shrink-0 text-ink-400 transition", open && "rotate-180")} aria-hidden />
        </button>
        <div className="flex shrink-0 items-center">
          <IconButton label={section.visible ? "Hide section" : "Show section"} onClick={() => onVisible(!section.visible)} disabled={busy}>
            {section.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </IconButton>
          <span className="hidden sm:contents">
            <IconButton label="Move up" onClick={() => onMove("up")} disabled={busy || isFirst}>
              <ArrowUp className="size-4" />
            </IconButton>
            <IconButton label="Move down" onClick={() => onMove("down")} disabled={busy || isLast}>
              <ArrowDown className="size-4" />
            </IconButton>
          </span>
        </div>
      </div>

      {open ? (
        <div className="border-t border-ink-100 p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap gap-2 sm:hidden">
            <Button size="sm" variant="outline" onClick={() => onMove("up")} disabled={busy || isFirst}>
              <ArrowUp className="size-4" aria-hidden /> Up
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMove("down")} disabled={busy || isLast}>
              <ArrowDown className="size-4" aria-hidden /> Down
            </Button>
          </div>
          {def ? (
            <SchemaForm fields={def.fields} value={draft} onChange={setDraft} imageFolder="site" />
          ) : (
            <Notice tone="warning">This section type isn’t editable.</Notice>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
            <SaveBar
              dirty={dirty}
              pending={saving}
              onSave={save}
              onReset={() => setDraft(section.data)}
              message={result?.message}
              error={result?.error}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onDuplicate} disabled={busy}>
                <Copy className="size-4" aria-hidden /> Duplicate
              </Button>
              <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
                <Trash2 className="size-4" aria-hidden /> Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
