"use client";

import { useActionState } from "react";
import { createPage, updatePage } from "@/app/admin/_actions/content";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Page } from "@/lib/types";

export function NewPageForm() {
  const [state, action] = useActionState(createPage, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Page title" htmlFor="new-title">
        <Input id="new-title" name="title" placeholder="e.g. Pricing" required />
      </Field>
      <Field label="Web address (optional)" htmlFor="new-slug" help="Letters, numbers and dashes.">
        <Input id="new-slug" name="slug" placeholder="pricing" />
      </Field>
      <SubmitButton pendingText="Creating…" className="sm:mb-7">
        Create page
      </SubmitButton>
      {state?.error ? <Notice tone="error" className="sm:col-span-3">{state.error}</Notice> : null}
    </form>
  );
}

export function PageSettingsForm({ page }: { page: Page }) {
  const [state, action] = useActionState(updatePage.bind(null, page.id), null);
  const isHome = page.slug === "home";
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" htmlFor="title" help="Shown in the browser tab.">
          <Input id="title" name="title" defaultValue={page.title} required />
        </Field>
        <Field label="Menu label" htmlFor="nav_label">
          <Input id="nav_label" name="nav_label" defaultValue={page.nav_label ?? ""} />
        </Field>
        <Field label="Web address" htmlFor="slug" help={isHome ? "The home page always lives at /." : undefined}>
          <div className="flex items-center rounded-xl border-2 border-ink-100 bg-ink-100/30 pl-3">
            <span className="text-ink-600">/</span>
            <Input
              id="slug"
              name="slug"
              defaultValue={isHome ? "" : page.slug}
              disabled={isHome}
              className="border-0 bg-transparent focus:ring-0"
            />
          </div>
        </Field>
      </div>
      <Field label="Search description" htmlFor="seo_description" help="A sentence for Google results.">
        <Textarea id="seo_description" name="seo_description" defaultValue={page.seo_description ?? ""} rows={2} />
      </Field>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 font-bold">
          <Checkbox name="show_in_nav" defaultChecked={page.show_in_nav} /> Show in menu
        </label>
        {!isHome ? (
          <label className="flex items-center gap-2 font-bold">
            <Checkbox name="published" defaultChecked={page.published} /> Published
          </label>
        ) : null}
      </div>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <SubmitButton variant="secondary" pendingText="Saving…">
        Save page settings
      </SubmitButton>
    </form>
  );
}
