"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import type { NavLink } from "@/lib/content";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <ul className="hidden items-center gap-1 lg:flex">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={cn(
              "rounded-full px-3.5 py-2 text-[0.95rem] font-bold transition",
              isActive(pathname, link.href) ? "bg-sea-100 text-ink" : "text-ink-600 hover:bg-sea-50 hover:text-ink",
            )}
            aria-current={isActive(pathname, link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StaticDesktopNav({ links }: { links: NavLink[] }) {
  return (
    <ul className="hidden items-center gap-1 lg:flex">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="rounded-full px-3.5 py-2 text-[0.95rem] font-bold text-ink-600">
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MobileNav({
  links,
  ctaLabel,
  ctaHref,
}: {
  links: NavLink[];
  ctaLabel: string;
  ctaHref: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full bg-sea-50 text-ink transition hover:bg-sea-100"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-ink-100 bg-white px-4 pt-2 pb-6 shadow-lg"
        >
          <ul className="space-y-1">
            {[{ slug: "home", label: "Home", href: "/" }, ...links].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
                  className="block rounded-2xl px-4 py-3 font-display text-lg font-medium text-ink hover:bg-sea-50"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href={ctaHref} onClick={close} className={buttonClass("primary", "lg", "w-full")}>
              {ctaLabel}
            </Link>
            <Link href="/portal" onClick={close} className={buttonClass("outline", "lg", "w-full")}>
              Client login
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
