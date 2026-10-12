"use client";

import {
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Clock,
  CreditCard,
  House,
  Images,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  Palette,
  PawPrint,
  Plug,
  Tags,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { title?: string; items: NavItem[] };

const NAV: Record<"portal" | "admin", NavGroup[]> = {
  portal: [
    {
      items: [
        { href: "/portal", label: "Home", icon: House },
        { href: "/portal/book", label: "Book", icon: CalendarPlus },
        { href: "/portal/visits", label: "My visits", icon: CalendarCheck2 },
        { href: "/portal/pets", label: "My pups", icon: PawPrint },
        { href: "/portal/intake", label: "Intake form", icon: ClipboardList },
        { href: "/portal/payments", label: "Payments", icon: CreditCard },
        { href: "/portal/profile", label: "Profile", icon: User },
      ],
    },
  ],
  admin: [
    {
      items: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard },
        { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
      ],
    },
    {
      title: "Website",
      items: [
        { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
        { href: "/admin/services", label: "Services", icon: Tags },
        { href: "/admin/gallery", label: "Gallery", icon: Images },
        { href: "/admin/settings", label: "Settings & colors", icon: Palette },
      ],
    },
    {
      title: "Business",
      items: [
        { href: "/admin/clients", label: "Clients", icon: Users },
        { href: "/admin/messages", label: "Messages", icon: Inbox },
        { href: "/admin/payments", label: "Payments", icon: CreditCard },
        { href: "/admin/intake-form", label: "Intake form", icon: ClipboardList },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: "/admin/schedule", label: "Schedule & availability", icon: Clock },
        { href: "/admin/integrations", label: "Integrations", icon: Plug },
      ],
    },
  ],
};

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/portal" || href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ area }: { area: "portal" | "admin" }) {
  const isActive = useIsActive();
  return (
    <nav className="space-y-6" aria-label={area === "admin" ? "Admin" : "Portal"}>
      {NAV[area].map((group, i) => (
        <div key={i}>
          {group.title ? (
            <p className="mb-2 px-3 text-xs font-extrabold tracking-wider text-ink-400 uppercase">{group.title}</p>
          ) : null}
          <ul className="space-y-1">
            {group.items.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition",
                    isActive(href) ? "bg-sea-100 text-ink" : "text-ink-600 hover:bg-sea-50 hover:text-ink",
                  )}
                >
                  <Icon className={cn("size-[1.15rem]", isActive(href) ? "text-ocean" : "")} aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MobileTabs({ area }: { area: "portal" | "admin" }) {
  const isActive = useIsActive();
  const items = NAV[area].flatMap((g) => g.items);
  return (
    <nav className="-mx-4 overflow-x-auto px-4 pb-3" aria-label={area === "admin" ? "Admin" : "Portal"}>
      <ul className="flex w-max gap-2">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap transition",
                isActive(href) ? "bg-ink text-white" : "bg-sea-50 text-ink-600",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function StaticNavFallback() {
  return <div className="h-64" />;
}
