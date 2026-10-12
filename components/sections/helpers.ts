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
