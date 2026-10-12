import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  DEFAULT_INTAKE_FORM,
  DEFAULT_PAGES,
  DEFAULT_SERVICES,
  DEFAULT_SETTINGS,
} from "@/lib/defaults";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { sanitizeTheme } from "@/lib/theme";
import type {
  FormDefinition,
  GalleryPhoto,
  Page,
  Section,
  Service,
  SiteSettings,
} from "@/lib/types";

/** Every public content read is tagged with this; admin saves call updateTag(CONTENT_TAG). */
export const CONTENT_TAG = "site-content";

export type NavLink = { slug: string; label: string; href: string };

export function mergeSettings(data: Partial<SiteSettings> | null | undefined): SiteSettings {
  const d = data ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    announcement: { ...DEFAULT_SETTINGS.announcement, ...(d.announcement ?? {}) },
    seo: { ...DEFAULT_SETTINGS.seo, ...(d.seo ?? {}) },
    theme: sanitizeTheme({ ...DEFAULT_SETTINGS.theme, ...(d.theme ?? {}) }),
  };
}

type SettingsState = { seeded: boolean; settings: SiteSettings };

/**
 * The site is "seeded" once the admin has copied the starter content into the
 * database (the settings row exists). Until then visitors see the defaults.
 */
async function loadSettingsState(): Promise<SettingsState> {
  "use cache";
  cacheTag(CONTENT_TAG);

  if (!isSupabaseConfigured()) {
    cacheLife("max");
    return { seeded: false, settings: DEFAULT_SETTINGS };
  }

  const { data, error } = await createPublicClient()
    .from("site_settings")
    .select("data")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load site settings", error.message);
    cacheLife("minutes");
    return { seeded: false, settings: DEFAULT_SETTINGS };
  }

  cacheLife("hours");
  return { seeded: Boolean(data), settings: mergeSettings(data?.data) };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return (await loadSettingsState()).settings;
}

export async function isContentSeeded(): Promise<boolean> {
  return (await loadSettingsState()).seeded;
}

function navLink(page: Pick<Page, "slug" | "title" | "nav_label">): NavLink {
  return {
    slug: page.slug,
    label: page.nav_label || page.title,
    href: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function getNavLinks(): Promise<NavLink[]> {
  "use cache";
  cacheTag(CONTENT_TAG);

  const { seeded } = await loadSettingsState();
  if (!seeded) {
    cacheLife("hours");
    return DEFAULT_PAGES.filter((p) => p.show_in_nav && p.published)
      .sort((a, b) => a.position - b.position)
      .map(navLink);
  }

  const { data, error } = await createPublicClient()
    .from("pages")
    .select("slug, title, nav_label")
    .eq("published", true)
    .eq("show_in_nav", true)
    .order("position");

  if (error) {
    console.error("Failed to load navigation", error.message);
    cacheLife("minutes");
    return [];
  }
  cacheLife("hours");
  return (data ?? []).map(navLink);
}

export type PageContent = { page: Page; sections: Section[] };

function defaultPageContent(slug: string): PageContent | null {
  const def = DEFAULT_PAGES.find((p) => p.slug === slug);
  if (!def) return null;
  const { sections, ...page } = def;
  const id = `default-${slug}`;
  return {
    page: { ...page, id },
    sections: sections
      .map((s, i) => ({ ...s, id: `${id}-${i}`, page_id: id, position: i }))
      .filter((s) => s.visible),
  };
}

export async function getPageContent(slug: string): Promise<PageContent | null> {
  "use cache";
  cacheTag(CONTENT_TAG);

  const { seeded } = await loadSettingsState();
  if (!seeded) {
    cacheLife("hours");
    return defaultPageContent(slug);
  }

  const supabase = createPublicClient();
  const { data: page, error } = await supabase
    .from("pages")
    .select("id, slug, title, nav_label, show_in_nav, published, position, seo_description")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle<Page>();

  if (error) {
    console.error(`Failed to load page "${slug}"`, error.message);
    cacheLife("minutes");
    return defaultPageContent(slug);
  }
  if (!page) {
    cacheLife("hours");
    return null;
  }

  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .select("id, page_id, type, position, visible, data")
    .eq("page_id", page.id)
    .eq("visible", true)
    .order("position");

  if (sectionsError) {
    console.error(`Failed to load sections for "${slug}"`, sectionsError.message);
    cacheLife("minutes");
    return { page, sections: [] };
  }

  cacheLife("hours");
  return { page, sections: (sections ?? []) as Section[] };
}

/** Slugs to prerender at build time (never empty, as Cache Components requires). */
export async function getPublishedSlugs(): Promise<string[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("hours");

  const fallback = DEFAULT_PAGES.map((p) => p.slug).filter((s) => s !== "home");
  const { seeded } = await loadSettingsState();
  if (!seeded) return fallback;

  const { data } = await createPublicClient()
    .from("pages")
    .select("slug")
    .eq("published", true)
    .neq("slug", "home");
  const slugs = (data ?? []).map((p) => p.slug as string);
  return slugs.length ? slugs : fallback;
}

export async function getServices(): Promise<Service[]> {
  "use cache";
  cacheTag(CONTENT_TAG);

  const { seeded } = await loadSettingsState();
  if (!seeded) {
    cacheLife("hours");
    return DEFAULT_SERVICES.map((s, i) => ({ ...s, id: `default-service-${i}` }));
  }

  const { data, error } = await createPublicClient()
    .from("services")
    .select("*")
    .eq("active", true)
    .order("position");

  if (error) {
    console.error("Failed to load services", error.message);
    cacheLife("minutes");
    return [];
  }
  cacheLife("hours");
  return (data ?? []) as Service[];
}

export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  "use cache";
  cacheTag(CONTENT_TAG);

  const { seeded } = await loadSettingsState();
  if (!seeded) {
    cacheLife("hours");
    return [];
  }

  const { data, error } = await createPublicClient()
    .from("gallery_photos")
    .select("*")
    .eq("visible", true)
    .order("position");

  if (error) {
    console.error("Failed to load gallery", error.message);
    cacheLife("minutes");
    return [];
  }
  cacheLife("hours");
  return (data ?? []) as GalleryPhoto[];
}

export async function getForm(slug: string): Promise<FormDefinition | null> {
  "use cache";
  cacheTag(CONTENT_TAG);

  const fallback = slug === DEFAULT_INTAKE_FORM.slug ? DEFAULT_INTAKE_FORM : null;
  const { seeded } = await loadSettingsState();
  if (!seeded) {
    cacheLife("hours");
    return fallback;
  }

  const { data, error } = await createPublicClient()
    .from("forms")
    .select("slug, title, description, fields")
    .eq("slug", slug)
    .maybeSingle<FormDefinition>();

  if (error) {
    console.error(`Failed to load form "${slug}"`, error.message);
    cacheLife("minutes");
    return fallback;
  }
  cacheLife("hours");
  return data ?? fallback;
}

export async function getCopyrightYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
