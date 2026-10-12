"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "@/app/admin/_actions/content";
import { SaveBar } from "@/components/admin/save-bar";
import { SchemaForm } from "@/components/admin/schema-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SETTINGS_GROUPS } from "@/lib/settings-schema";
import { DEFAULT_THEME, themeToCss } from "@/lib/theme";
import type { SiteSettings } from "@/lib/types";

export function SettingsEditor({ initial }: { initial: SiteSettings }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  function save() {
    startTransition(async () => {
      const res = await saveSettings(value);
      if (res.ok) {
        setSaved(value);
        setResult({ message: res.message });
      } else {
        setResult({ error: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Live color preview while editing (only affects this tab until saved). */}
      <style dangerouslySetInnerHTML={{ __html: themeToCss(value.theme) }} />
      {SETTINGS_GROUPS.map((group) => (
        <Card key={group.title}>
          <h2 className="text-xl font-semibold">{group.title}</h2>
          {group.description ? <p className="mt-1 mb-5 text-ink-600">{group.description}</p> : <div className="mb-5" />}
          <SchemaForm
            fields={group.fields}
            value={value as unknown as Record<string, unknown>}
            onChange={(v) => setValue(v as unknown as SiteSettings)}
            imageFolder="site"
          />
          {group.title === "Colors" ? (
            <div className="mt-6 space-y-4">
              <ColorPreview />
              <Button variant="outline" size="sm" onClick={() => setValue({ ...value, theme: DEFAULT_THEME })}>
                Reset to Ocean Beach defaults
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
      <div className="sticky bottom-4 z-20 rounded-2xl border border-ink-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <SaveBar
          dirty={dirty}
          pending={pending}
          onSave={save}
          onReset={() => setValue(saved)}
          message={result?.message}
          error={result?.error}
        />
      </div>
    </div>
  );
}

function ColorPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100">
      <div className="bg-sea-100 p-5">
        <p className="mb-2 inline-flex rounded-full bg-sun-100 px-3 py-1 text-xs font-extrabold text-ink uppercase">Preview</p>
        <p className="font-display text-2xl font-semibold text-ink">Happy dogs. Salty paws.</p>
        <p className="text-ink-600">This is how text and buttons will look.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-sun px-4 py-2 font-bold text-ink">Book a walk</span>
          <span className="rounded-full bg-ocean px-4 py-2 font-bold text-white">Learn more</span>
          <span className="rounded-full bg-coral px-4 py-2 font-bold text-ink">Accent</span>
        </div>
      </div>
      <div className="flex gap-0">
        <div className="h-8 flex-1 bg-sand" />
        <div className="h-8 flex-1 bg-sea" />
        <div className="h-8 flex-1 bg-ocean" />
        <div className="h-8 flex-1 bg-ink" />
        <div className="h-8 flex-1 bg-sun" />
        <div className="h-8 flex-1 bg-coral" />
      </div>
    </div>
  );
}
