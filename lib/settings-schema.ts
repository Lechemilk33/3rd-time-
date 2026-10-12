import type { FieldDef } from "@/lib/sections";
import { THEME_LABELS } from "@/lib/theme";
import type { ThemeColors } from "@/lib/types";

export type SettingsGroup = { title: string; description?: string; fields: FieldDef[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Business",
    fields: [
      { key: "businessName", label: "Business name", type: "text" },
      { key: "tagline", label: "Tagline", type: "text", help: "Shown in the footer and when people log in." },
      { key: "logoUrl", label: "Logo", type: "image", help: "Square works best. Leave empty for the paw logo." },
    ],
  },
  {
    title: "Contact info",
    description: "Shown in the footer and on the contact page. Leave anything blank to hide it.",
    fields: [
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "instagramUrl", label: "Instagram link", type: "url" },
      { key: "serviceAreaSummary", label: "Service area (short)", type: "text" },
      { key: "hours", label: "Hours", type: "text", placeholder: "e.g. Mon–Fri, 8am–6pm" },
    ],
  },
  {
    title: "Header button",
    description: "The big button at the top of every page. Availability and booking rules live in Schedule & availability.",
    fields: [
      { key: "headerCtaLabel", label: "Button text", type: "text" },
      { key: "headerCtaHref", label: "Button link", type: "url", placeholder: "/book" },
    ],
  },
  {
    title: "Announcement bar",
    description: "The skinny banner at the very top of every page.",
    fields: [
      {
        key: "announcement",
        label: "Announcement",
        type: "group",
        fields: [
          { key: "enabled", label: "Show the announcement bar", type: "boolean" },
          { key: "text", label: "Text", type: "text" },
          { key: "href", label: "Link (optional)", type: "url" },
        ],
      },
    ],
  },
  {
    title: "Footer",
    fields: [{ key: "footerBlurb", label: "Footer blurb", type: "textarea" }],
  },
  {
    title: "Search & sharing",
    description: "How the site appears on Google and when shared by text or social.",
    fields: [
      {
        key: "seo",
        label: "Search & sharing",
        type: "group",
        fields: [
          { key: "title", label: "Site title", type: "text" },
          { key: "description", label: "Description", type: "textarea" },
          { key: "imageUrl", label: "Share image", type: "image", help: "1200×630 looks best." },
        ],
      },
    ],
  },
  {
    title: "Colors",
    description: "Dogs see blues and yellows best — the default palette leans into that. Changes apply site-wide.",
    fields: [
      {
        key: "theme",
        label: "Brand colors",
        type: "group",
        fields: (Object.keys(THEME_LABELS) as (keyof ThemeColors)[]).map((key) => ({
          key,
          label: THEME_LABELS[key].label,
          help: THEME_LABELS[key].help,
          type: "color" as const,
        })),
      },
    ],
  },
];
