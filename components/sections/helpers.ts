import type { SectionData } from "@/lib/types";

export function str(data: SectionData, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v : "";
}

export function bool(data: SectionData, key: string, fallback = false): boolean {
  const v = data[key];
  return typeof v === "boolean" ? v : fallback;
}

export function num(data: SectionData, key: string, fallback = 0): number {
  const v = data[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function strings(data: SectionData, key: string): string[] {
  const v = data[key];
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
}

export function items(data: SectionData, key: string): SectionData[] {
  const v = data[key];
  return Array.isArray(v) ? v.filter((i): i is SectionData => typeof i === "object" && i !== null) : [];
}

export type HeroPhoto = { url: string; name: string };

/** A list of photos, each with an optional name. Older pages saved plain URLs. */
export function photos(data: SectionData, key: string): HeroPhoto[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v.flatMap((p): HeroPhoto[] => {
    if (typeof p === "string") return p.trim() ? [{ url: p, name: "" }] : [];
    if (p && typeof p === "object" && typeof p.url === "string" && p.url.trim()) {
      return [{ url: p.url, name: typeof p.name === "string" ? p.name.trim().slice(0, 40) : "" }];
    }
    return [];
  });
}
