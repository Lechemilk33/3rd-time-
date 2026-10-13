import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { getSiteSettings } from "@/lib/content";
import { themeToCss } from "@/lib/theme";
import "./globals.css";

const display = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

const sans = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  // Link previews (texts, social posts): the uploaded share image, else the logo card.
  const images = settings.seo.imageUrl ? [{ url: settings.seo.imageUrl }] : [{ url: "/brand/og.png", width: 1200, height: 630 }];
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: settings.seo.title, template: `%s · ${settings.businessName}` },
    description: settings.seo.description,
    openGraph: {
      title: settings.seo.title,
      description: settings.seo.description,
      siteName: settings.businessName,
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#8ecdf0",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await getSiteSettings();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <style dangerouslySetInnerHTML={{ __html: themeToCss(settings.theme) }} />
        {children}
      </body>
    </html>
  );
}
