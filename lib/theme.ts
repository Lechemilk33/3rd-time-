import type { ThemeColors } from "@/lib/types";

/**
 * Ocean Beach palette. Dogs see the world mostly in blues and yellows, so the
 * brand leans on light sky blue and tennis-ball yellow, grounded by a deep
 * ocean navy and warm sand.
 */
export const DEFAULT_THEME: ThemeColors = {
  sea: "#8ECDF0",
  ocean: "#1A6FA0",
  ink: "#0F2B3F",
  sun: "#FFC845",
  sand: "#FFF7EA",
  coral: "#FF8A65",
};

export const THEME_LABELS: Record<keyof ThemeColors, { label: string; help: string }> = {
  sea: { label: "Light blue (main)", help: "Backgrounds, highlights, soft accents" },
  ocean: { label: "Ocean blue", help: "Links and secondary buttons (keep it dark enough for white text)" },
  ink: { label: "Navy text", help: "Headings, body text, footer" },
  sun: { label: "Sunshine yellow", help: "Main call-to-action buttons" },
  sand: { label: "Sand", help: "Warm page background" },
  coral: { label: "Sunset coral", help: "Small playful accents" },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function sanitizeTheme(theme: Partial<ThemeColors> | undefined): ThemeColors {
  const result = { ...DEFAULT_THEME };
  if (!theme) return result;
  for (const key of Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]) {
    const value = theme[key];
    if (typeof value === "string" && HEX.test(value.trim())) result[key] = value.trim();
  }
  return result;
}

/** CSS custom properties consumed by globals.css. Values are validated hex only. */
export function themeToCss(theme: ThemeColors) {
  const t = sanitizeTheme(theme);
  return `:root{--brand-sea:${t.sea};--brand-ocean:${t.ocean};--brand-ink:${t.ink};--brand-sun:${t.sun};--brand-sand:${t.sand};--brand-coral:${t.coral};}`;
}
