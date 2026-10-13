/**
 * Google Maps. Links work everywhere; address suggestions and map previews need a browser key in
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JavaScript API, Places API (New) and Maps Embed API).
 */

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** Ocean Beach, San Diego: address suggestions favor spots around here. */
export const MAPS_HOME = { lat: 32.7486, lng: -117.247 };

/** "OB Dog Park, 5156 W Point Loma Blvd" */
export function spotText(...parts: (string | null | undefined)[]) {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}

/** What to look up: the address when there is one (a nickname like "the usual bench" would throw Google off). */
function mapQuery(name: string | null | undefined, address?: string | null) {
  return address?.trim() || name?.trim() || "";
}

/** Google Maps search for a spot (its name and address) or a plain address. */
export function mapsUrl(name: string | null | undefined, address?: string | null) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(name, address))}`;
}

/** An embeddable map of a spot (Maps Embed API, no usage charge), or null without a key. */
export function mapEmbedUrl(name: string | null | undefined, address?: string | null) {
  const q = mapQuery(name, address);
  return GOOGLE_MAPS_KEY && q
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&q=${encodeURIComponent(q)}`
    : null;
}
