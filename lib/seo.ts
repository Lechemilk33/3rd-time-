import { lengthOptions } from "@/lib/booking";
import type { Service, SiteSettings } from "@/lib/types";

/**
 * Where the business is, for search engines. It's a service-area business run from home, so only
 * the neighborhood is published, never a street address.
 */
export const BUSINESS_LOCATION = {
  locality: "San Diego",
  neighborhood: "Ocean Beach",
  region: "CA",
  postalCode: "92107",
  country: "US",
  latitude: 32.7492,
  longitude: -117.2489,
};

/**
 * schema.org description of the business (name, logo, contact, the neighborhoods it serves and its
 * services with prices), so Google can show it accurately in search and on Maps.
 */
export function businessJsonLd({
  url,
  settings,
  services,
  areas,
}: {
  url: string;
  settings: SiteSettings;
  services: Service[];
  areas: string[];
}) {
  const logo = settings.logoUrl || `${url}/brand/logo.png`;
  const offers = services
    .filter((s) => s.bookable || s.price_cents != null)
    .map((s) => {
      const prices = lengthOptions(s)
        .map((o) => o.price_cents)
        .filter((p): p is number => typeof p === "number" && p > 0);
      const low = prices.length ? Math.min(...prices) : s.price_cents;
      return {
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.name, ...(s.description ? { description: s.description } : {}) },
        ...(low != null && low > 0 ? { price: (low / 100).toFixed(2), priceCurrency: "USD" } : {}),
      };
    });

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}/#business`,
    name: settings.businessName,
    description: settings.seo.description,
    url,
    logo,
    image: settings.seo.imageUrl || `${url}/brand/og.png`,
    ...(settings.phone ? { telephone: settings.phone } : {}),
    ...(settings.email ? { email: settings.email } : {}),
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      addressLocality: BUSINESS_LOCATION.locality,
      addressRegion: BUSINESS_LOCATION.region,
      postalCode: BUSINESS_LOCATION.postalCode,
      addressCountry: BUSINESS_LOCATION.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: BUSINESS_LOCATION.latitude, longitude: BUSINESS_LOCATION.longitude },
    areaServed: areas.map((name) => ({ "@type": "Place", name: `${name}, San Diego, CA` })),
    ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
    ...(offers.length
      ? { hasOfferCatalog: { "@type": "OfferCatalog", name: "Dog walking and pet care", itemListElement: offers } }
      : {}),
  };
}

/** JSON for a <script type="application/ld+json">, safe to drop into HTML. */
export function jsonLdString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
