import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/content";

/** Lets clients and the team add the site to their phone's home screen with the logo as the icon. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings();
  return {
    name: settings.businessName,
    short_name: "Paws",
    start_url: "/",
    display: "standalone",
    background_color: "#fff7ea",
    theme_color: "#8ecdf0",
    icons: [
      { src: "/brand/logo-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
