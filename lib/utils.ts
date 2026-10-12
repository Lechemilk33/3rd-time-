import { twMerge } from "tailwind-merge";

export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(" "));
}
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Reads a trimmed string from FormData; empty strings become null. */
export function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Only allow relative paths or http(s) links in admin-entered hrefs. */
export function safeHref(href: string | null | undefined, fallback = "#") {
  if (!href) return fallback;
  const value = href.trim();
  if (value.startsWith("/") || value.startsWith("#")) return value;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  return fallback;
}

export function isExternalHref(href: string) {
  return /^(https?:)?\/\//i.test(href);
}
