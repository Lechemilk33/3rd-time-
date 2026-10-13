/** Where a visitor first came from, remembered in their browser until they sign up. */
export const SOURCE_KEY = "wfp:source";

const LABELS: Record<string, string> = {
  flyer: "Flyer",
  sticker: "Sticker",
  card: "Business card",
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  instagram: "Instagram",
  facebook: "Facebook",
  nextdoor: "Nextdoor",
  yelp: "Yelp",
  tiktok: "TikTok",
};

/** "flyer" → "Flyer", "google" → "Google", anything else as given. */
export function sourceLabel(source: string | null | undefined) {
  if (!source) return "Unknown";
  return LABELS[source] ?? source;
}

/** Lowercase letters, digits, dots, dashes and spaces only; 40 characters at most. */
export function cleanSource(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9. _-]/g, "").trim().slice(0, 40);
}

const REFERRERS: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook|fb)\.com$/, "facebook"],
  [/(^|\.)nextdoor\.com$/, "nextdoor"],
  [/(^|\.)yelp\.com$/, "yelp"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
];

/** A source from ?src= / ?utm_source=, else the site that linked here. */
export function detectSource(search: string, referrer: string, ownHost: string) {
  const params = new URLSearchParams(search);
  const tagged = cleanSource(params.get("src") ?? params.get("utm_source"));
  if (tagged) return tagged;
  if (!referrer) return "";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (!host || host === ownHost.replace(/^www\./, "")) return "";
    return REFERRERS.find(([re]) => re.test(host))?.[1] ?? cleanSource(host);
  } catch {
    return "";
  }
}
