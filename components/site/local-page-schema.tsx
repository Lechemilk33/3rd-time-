import { getSiteSettings } from "@/lib/content";
import { AREA_PAGES, GUIDE_PAGES } from "@/lib/local-pages";
import { jsonLdString } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";

/** Structured data for a neighborhood page (the service in that area) or a guide (an article). */
export async function LocalPageSchema({ slug }: { slug: string }) {
  const area = AREA_PAGES.find((p) => p.slug === slug);
  const guide = GUIDE_PAGES.find((p) => p.slug === slug);
  if (!area && !guide) return null;

  const settings = await getSiteSettings();
  const url = siteUrl();
  const business = { "@type": "LocalBusiness", "@id": `${url}/#business`, name: settings.businessName, url };
  const data = area
    ? {
        "@context": "https://schema.org",
        "@type": "Service",
        serviceType: "Dog walking",
        name: area.title,
        description: area.seo,
        url: `${url}/${slug}`,
        areaServed: { "@type": "Place", name: `${area.area}, San Diego, CA` },
        provider: business,
      }
    : {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: guide!.title,
        description: guide!.seo,
        url: `${url}/${slug}`,
        mainEntityOfPage: `${url}/${slug}`,
        dateModified: "2026-10-13",
        author: business,
        publisher: { ...business, logo: `${url}/brand/logo.png` },
        image: `${url}/brand/og.png`,
      };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
