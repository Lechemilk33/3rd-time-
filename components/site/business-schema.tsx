import { getPageContent, getServices, getSiteSettings } from "@/lib/content";
import { SERVICE_AREAS } from "@/lib/defaults";
import { businessJsonLd, jsonLdString } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";

/** The business described for search engines (structured data), on the home page. */
export async function BusinessSchema() {
  const [settings, services, home] = await Promise.all([getSiteSettings(), getServices(), getPageContent("home")]);
  // The neighborhoods listed in the home page's "Service area" section, as edited by the team.
  const listed = home?.sections.find((s) => s.type === "service_area")?.data?.areas;
  const areas = Array.isArray(listed) && listed.length ? listed.filter((a): a is string => typeof a === "string") : SERVICE_AREAS;
  const data = businessJsonLd({ url: siteUrl(), settings, services, areas });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
