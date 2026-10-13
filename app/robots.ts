import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Search engines get the public site; the admin, portal and account pages stay out of results. */
export default function robots(): MetadataRoute.Robots {
  const url = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/portal", "/api", "/auth", "/login", "/signup", "/forgot-password"],
      },
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
