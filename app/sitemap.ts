import type { MetadataRoute } from "next";
import { getPublishedSlugs } from "@/lib/content";
import { BUILT_IN_PAGES } from "@/lib/defaults";
import { siteUrl } from "@/lib/site-url";

/** Every public page, for Google and Bing (submit /sitemap.xml in Search Console). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = siteUrl();
  const slugs = await getPublishedSlugs();
  return [
    { url, changeFrequency: "weekly", priority: 1 },
    ...slugs.map((slug) => ({
      url: `${url}/${slug}`,
      changeFrequency: BUILT_IN_PAGES.includes(slug) ? ("yearly" as const) : ("monthly" as const),
      priority: BUILT_IN_PAGES.includes(slug) ? 0.2 : slug === "services" || slug === "book" ? 0.9 : 0.7,
    })),
  ];
}
