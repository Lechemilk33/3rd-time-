"use server";

import { redirect } from "next/navigation";
import { mergeSettings } from "@/lib/content";
import { DEFAULT_INTAKE_FORM, DEFAULT_PAGES, DEFAULT_SERVICES } from "@/lib/defaults";
import { SECTION_TYPE_MAP } from "@/lib/sections";
import type { ActionResult, Section, SectionData, SiteSettings } from "@/lib/types";
import { slugify } from "@/lib/utils";

const RESERVED_SLUGS = new Set(["admin", "portal", "login", "signup", "api", "auth", "forgot-password", "home", "icon.svg"]);
import { NOT_SEEDED, adminClient, clampText, isSeeded, publishContentChange } from "./shared";

// ---------------------------------------------------------------------------
// Starter content
// ---------------------------------------------------------------------------

export async function seedStarterContent(): Promise<ActionResult> {
  const supabase = await adminClient();
  if (await isSeeded(supabase)) return { ok: true, message: "Starter content is already loaded." };

  for (const def of DEFAULT_PAGES) {
    const { sections, ...page } = def;
    const { data: row, error } = await supabase
      .from("pages")
      .upsert(page, { onConflict: "slug" })
      .select("id")
      .single();
    if (error || !row) return { ok: false, error: error?.message ?? "Could not create pages." };

    const { count } = await supabase
      .from("sections")
      .select("id", { count: "exact", head: true })
      .eq("page_id", row.id);
    if (!count) {
      const { error: sectionError } = await supabase
        .from("sections")
        .insert(sections.map((s, i) => ({ ...s, page_id: row.id, position: i })));
      if (sectionError) return { ok: false, error: sectionError.message };
    }
  }

  const { count: serviceCount } = await supabase.from("services").select("id", { count: "exact", head: true });
  if (!serviceCount) {
    const { error } = await supabase.from("services").insert(DEFAULT_SERVICES);
    if (error) return { ok: false, error: error.message };
  }

  const { error: formError } = await supabase
    .from("forms")
    .upsert(DEFAULT_INTAKE_FORM, { onConflict: "slug", ignoreDuplicates: true });
  if (formError) return { ok: false, error: formError.message };

  // Writing settings last flips the public site over to the database.
  const { error } = await supabase.from("site_settings").insert({ id: 1, data: mergeSettings(null) });
  if (error) return { ok: false, error: error.message };

  publishContentChange();
  return { ok: true, message: "Starter content loaded — everything is editable now!" };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveSettings(input: SiteSettings): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!(await isSeeded(supabase))) return NOT_SEEDED;

  const merged = mergeSettings(input);
  const clean: SiteSettings = {
    ...merged,
    businessName: clampText(merged.businessName, 80) || "Waiting for Paws",
    tagline: clampText(merged.tagline, 200),
    footerBlurb: clampText(merged.footerBlurb, 500),
    announcement: {
      enabled: Boolean(merged.announcement.enabled),
      text: clampText(merged.announcement.text, 200),
      href: clampText(merged.announcement.href, 500),
    },
  };

  const { error } = await supabase.from("site_settings").update({ data: clean }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, message: "Settings saved and live on the site." };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function createPage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!(await isSeeded(supabase))) return NOT_SEEDED;

  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  const slug = slugify(String(formData.get("slug") ?? "") || title);
  if (!title) return { ok: false, error: "Give the page a title." };
  if (!slug || RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Pick a different web address for this page." };
  }

  const { data: last } = await supabase.from("pages").select("position").order("position", { ascending: false }).limit(1);
  const { data: page, error } = await supabase
    .from("pages")
    .insert({ title, slug, nav_label: title, position: (last?.[0]?.position ?? 0) + 1, show_in_nav: true, published: true })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.code === "23505" ? "A page already uses that web address." : error.message };
  }

  await supabase.from("sections").insert({
    page_id: page.id,
    type: "page_header",
    position: 0,
    data: { ...SECTION_TYPE_MAP.page_header.defaults, heading: title },
  });

  publishContentChange();
  redirect(`/admin/pages/${page.id}`);
}

export async function updatePage(pageId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const supabase = await adminClient();
  const { data: existing } = await supabase.from("pages").select("slug").eq("id", pageId).single();
  if (!existing) return { ok: false, error: "Page not found." };

  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!title) return { ok: false, error: "Give the page a title." };
  const slug = existing.slug === "home" ? "home" : slugify(String(formData.get("slug") ?? ""));
  if (!slug) return { ok: false, error: "The web address can’t be empty." };
  if (existing.slug !== "home" && RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "That web address is reserved. Pick a different one." };
  }

  const { error } = await supabase
    .from("pages")
    .update({
      title,
      slug,
      nav_label: String(formData.get("nav_label") ?? "").trim().slice(0, 40) || null,
      seo_description: String(formData.get("seo_description") ?? "").trim().slice(0, 300) || null,
      show_in_nav: formData.get("show_in_nav") === "on",
      published: existing.slug === "home" ? true : formData.get("published") === "on",
    })
    .eq("id", pageId);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Another page already uses that web address." : error.message };
  }
  publishContentChange();
  return { ok: true, message: "Page saved." };
}

export async function movePage(pageId: string, direction: "up" | "down"): Promise<void> {
  const supabase = await adminClient();
  const { data } = await supabase.from("pages").select("id, position").order("position").order("created_at");
  const pages = data ?? [];
  const index = pages.findIndex((p) => p.id === pageId);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= pages.length) return;
  [pages[index], pages[swap]] = [pages[swap], pages[index]];
  await Promise.all(pages.map((p, i) => supabase.from("pages").update({ position: i }).eq("id", p.id)));
  publishContentChange();
}

export async function deletePage(pageId: string): Promise<void> {
  const supabase = await adminClient();
  const { data: page } = await supabase.from("pages").select("slug").eq("id", pageId).single();
  if (!page || page.slug === "home") return;
  await supabase.from("pages").delete().eq("id", pageId);
  publishContentChange();
  redirect("/admin/pages");
}

// ---------------------------------------------------------------------------
// Sections (the page builder)
// ---------------------------------------------------------------------------

async function listSections(supabase: Awaited<ReturnType<typeof adminClient>>, pageId: string) {
  const { data } = await supabase
    .from("sections")
    .select("id, page_id, type, position, visible, data")
    .eq("page_id", pageId)
    .order("position")
    .order("created_at");
  return (data ?? []) as Section[];
}

async function renumber(supabase: Awaited<ReturnType<typeof adminClient>>, sections: Section[]) {
  await Promise.all(
    sections.map((s, i) =>
      s.position === i ? null : supabase.from("sections").update({ position: i }).eq("id", s.id),
    ),
  );
  return sections.map((s, i) => ({ ...s, position: i }));
}

type SectionsResult = ActionResult & { sections?: Section[] };

function sanitizeSectionData(data: SectionData): SectionData | null {
  const json = JSON.stringify(data ?? {});
  if (json.length > 100_000) return null;
  return JSON.parse(json);
}

export async function addSection(pageId: string, type: string, index: number): Promise<SectionsResult> {
  const supabase = await adminClient();
  const def = SECTION_TYPE_MAP[type];
  if (!def) return { ok: false, error: "Unknown section type." };

  const sections = await listSections(supabase, pageId);
  const { data: created, error } = await supabase
    .from("sections")
    .insert({ page_id: pageId, type, position: sections.length, data: def.defaults })
    .select("id, page_id, type, position, visible, data")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not add section." };

  const at = Math.max(0, Math.min(index, sections.length));
  sections.splice(at, 0, created as Section);
  const ordered = await renumber(supabase, sections);
  publishContentChange();
  return { ok: true, sections: ordered };
}

export async function saveSection(sectionId: string, data: SectionData): Promise<ActionResult> {
  const supabase = await adminClient();
  const clean = sanitizeSectionData(data);
  if (!clean) return { ok: false, error: "That section has too much content." };
  const { error } = await supabase.from("sections").update({ data: clean }).eq("id", sectionId);
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true, message: "Saved and live!" };
}

export async function setSectionVisible(sectionId: string, visible: boolean): Promise<ActionResult> {
  const supabase = await adminClient();
  const { error } = await supabase.from("sections").update({ visible }).eq("id", sectionId);
  if (error) return { ok: false, error: error.message };
  publishContentChange();
  return { ok: true };
}

export async function moveSection(pageId: string, sectionId: string, direction: "up" | "down"): Promise<SectionsResult> {
  const supabase = await adminClient();
  const sections = await listSections(supabase, pageId);
  const index = sections.findIndex((s) => s.id === sectionId);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= sections.length) return { ok: true, sections };
  [sections[index], sections[swap]] = [sections[swap], sections[index]];
  const ordered = await renumber(supabase, sections);
  publishContentChange();
  return { ok: true, sections: ordered };
}

export async function duplicateSection(pageId: string, sectionId: string): Promise<SectionsResult> {
  const supabase = await adminClient();
  const sections = await listSections(supabase, pageId);
  const index = sections.findIndex((s) => s.id === sectionId);
  if (index < 0) return { ok: false, error: "Section not found." };
  const source = sections[index];
  const { data: copy, error } = await supabase
    .from("sections")
    .insert({ page_id: pageId, type: source.type, position: sections.length, visible: false, data: source.data })
    .select("id, page_id, type, position, visible, data")
    .single();
  if (error || !copy) return { ok: false, error: error?.message ?? "Could not duplicate." };
  sections.splice(index + 1, 0, copy as Section);
  const ordered = await renumber(supabase, sections);
  publishContentChange();
  return { ok: true, sections: ordered };
}

export async function deleteSection(pageId: string, sectionId: string): Promise<SectionsResult> {
  const supabase = await adminClient();
  const { error } = await supabase.from("sections").delete().eq("id", sectionId).eq("page_id", pageId);
  if (error) return { ok: false, error: error.message };
  const ordered = await renumber(supabase, await listSections(supabase, pageId));
  publishContentChange();
  return { ok: true, sections: ordered };
}
