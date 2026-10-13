import { Mail, MapPin, Phone, Clock } from "lucide-react";
import Link from "next/link";
import { InstagramIcon } from "@/components/ui/icons";
import { Logo } from "@/components/site/logo";
import { getCopyrightYear, getNavLinks, getSiteSettings } from "@/lib/content";
import { instagramHandle, safeHref } from "@/lib/utils";

export async function Footer() {
  const [settings, links, year] = await Promise.all([getSiteSettings(), getNavLinks(), getCopyrightYear()]);

  return (
    <footer className="relative mt-auto bg-ink text-white">
      <svg
        viewBox="0 0 1440 48"
        preserveAspectRatio="none"
        className="absolute top-px left-0 h-6 w-full -translate-y-full text-ink sm:h-10"
        aria-hidden
      >
        <path d="M0 48h1440V20c-120 18-240 26-360 18S840 4 720 6 480 34 360 36 120 22 0 12z" fill="currentColor" />
      </svg>
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo name={settings.businessName} logoUrl={settings.logoUrl} inverted />
          {settings.footerBlurb ? <p className="max-w-sm text-white/75">{settings.footerBlurb}</p> : null}
          {settings.instagramUrl ? (
            <a
              href={safeHref(settings.instagramUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold transition hover:bg-white/20"
            >
              <InstagramIcon className="size-4" />
              {instagramHandle(settings.instagramUrl) || "Instagram"}
            </a>
          ) : null}
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg text-sun">Explore</h2>
          <ul className="space-y-2.5 text-white/80">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/portal" className="hover:text-white">
                Client login
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg text-sun">Say hi</h2>
          <ul className="space-y-3 text-white/80">
            {settings.phone ? (
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-sea" aria-hidden />
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="hover:text-white">
                  {settings.phone}
                </a>
              </li>
            ) : null}
            {settings.email ? (
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-sea" aria-hidden />
                <a href={`mailto:${settings.email}`} className="break-all hover:text-white">
                  {settings.email}
                </a>
              </li>
            ) : null}
            {settings.serviceAreaSummary ? (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-sea" aria-hidden />
                <span>{settings.serviceAreaSummary}</span>
              </li>
            ) : null}
            {settings.hours ? (
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-sea" aria-hidden />
                <span>{settings.hours}</span>
              </li>
            ) : null}
            {links.some((l) => l.slug === "contact") ? (
              <li>
                <Link href="/contact" className="font-bold text-sun hover:underline">
                  Send us a message →
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-sm text-white/60 sm:flex-row sm:justify-between">
          <p>
            © {year} {settings.businessName}. Made with 🐾 in Ocean Beach.
          </p>
          <p>{settings.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
