import { Suspense } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { DesktopNav, MobileNav, StaticDesktopNav } from "@/components/site/nav-links";
import { Logo } from "@/components/site/logo";
import { getNavLinks, getSiteSettings } from "@/lib/content";
import { safeHref } from "@/lib/utils";

export async function Header() {
  const [settings, links] = await Promise.all([getSiteSettings(), getNavLinks()]);
  const ctaHref = safeHref(settings.headerCtaHref, "/book");

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/90 backdrop-blur-md">
      <nav className="container-page relative flex h-[4.5rem] items-center justify-between gap-4" aria-label="Main">
        <Logo name={settings.businessName} logoUrl={settings.logoUrl} />
        <Suspense fallback={<StaticDesktopNav links={links} />}>
          <DesktopNav links={links} />
        </Suspense>
        <div className="flex items-center gap-2">
          <Link
            href="/portal"
            className="hidden rounded-full px-3.5 py-2 text-[0.95rem] font-bold text-ocean hover:bg-sea-50 sm:inline-flex"
          >
            Client login
          </Link>
          {settings.headerCtaLabel ? (
            <ButtonLink href={ctaHref} className="hidden sm:inline-flex">
              {settings.headerCtaLabel}
            </ButtonLink>
          ) : null}
          <MobileNav links={links} ctaLabel={settings.headerCtaLabel || "Book"} ctaHref={ctaHref} />
        </div>
      </nav>
    </header>
  );
}
