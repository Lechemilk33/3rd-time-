"use client";

import {
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  Ellipsis,
  Clock,
  CreditCard,
  House,
  Images,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
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
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = {
  /** Stable id, used to remember whether a collapsible group was left open. */
  id: string;
  title?: string;
  /** Shown under a collapsed group's title so people know what's inside. */
  hint?: string;
  collapsible?: boolean;
  items: NavItem[];
};

const NAV: Record<"portal" | "admin", NavGroup[]> = {
  portal: [
    {
      id: "main",
      items: [
        { href: "/portal", label: "Home", icon: House },
        { href: "/portal/book", label: "Book", icon: CalendarPlus },
        { href: "/portal/visits", label: "My visits", icon: CalendarCheck2 },
        { href: "/portal/pets", label: "My pups", icon: PawPrint },
        { href: "/portal/payments", label: "Payments", icon: CreditCard },
        { href: "/portal/profile", label: "Profile", icon: User },
      ],
    },
  ],
  // Day-to-day work first, then how bookings are set up, then the website (tucked away — it
  // changes rarely), then the one-time technical bits.
  admin: [
    {
      id: "main",
      items: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard },
        { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
        { href: "/admin/clients", label: "Clients", icon: Users },
        { href: "/admin/messages", label: "Messages", icon: Inbox },
        { href: "/admin/payments", label: "Payments", icon: CreditCard },
      ],
    },
    {
      id: "booking",
      title: "Booking",
      items: [
        { href: "/admin/services", label: "Services & prices", icon: Tags },
        { href: "/admin/schedule", label: "Schedule", icon: Clock },
        { href: "/admin/places", label: "Meeting places", icon: MapPin },
        { href: "/admin/intake-form", label: "Booking questions", icon: ClipboardList },
      ],
    },
    {
      id: "website",
      title: "Website",
      hint: "Pages, gallery, look & info",
      collapsible: true,
      items: [
        { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
        { href: "/admin/gallery", label: "Gallery", icon: Images },
        { href: "/admin/settings", label: "Site settings", icon: Palette },
      ],
    },
    {
      id: "setup",
      title: "Setup",
      items: [{ href: "/admin/integrations", label: "Integrations", icon: Plug }],
    },
  ],
};

// Which collapsible groups someone left open, kept in this browser only.
const OPEN_KEY = "wfp:nav-open";
const OPEN_EVENT = "wfp:nav-open";

function readOpen(): string {
  try {
    return localStorage.getItem(OPEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeOpen(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(OPEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(OPEN_EVENT, onChange);
  };
}

function setOpen(id: string, open: boolean) {
  const ids = new Set(readOpen().split(",").filter(Boolean));
  if (open) ids.add(id);
  else ids.delete(id);
  try {
    localStorage.setItem(OPEN_KEY, [...ids].join(","));
  } catch {
    // Private mode: the group still toggles for this visit via the event below.
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/portal" || href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Small count pill next to a nav link (requests waiting, new messages). */
function CountBadge({ n, active }: { n?: number; active?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "ml-auto min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-extrabold",
        active ? "bg-white text-ink" : "bg-amber-500 text-white",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** The nav for an area, minus links that don't apply to this person (e.g. Payments before there's anything to pay). */
function groupsFor(area: "portal" | "admin", hidden: string[] = []) {
  return NAV[area]
    .map((g) => ({ ...g, items: g.items.filter((i) => !hidden.includes(i.href)) }))
    .filter((g) => g.items.length);
}

export function SidebarNav({ area, counts, hidden }: { area: "portal" | "admin"; counts?: Record<string, number>; hidden?: string[] }) {
  const isActive = useIsActive();
  // Server render (and first paint) knows nothing saved, so groups start closed unless you're in them.
  const saved = useSyncExternalStore(subscribeOpen, readOpen, () => "");
  const [session, setSession] = useState<Record<string, boolean>>({});

  return (
    <nav className="space-y-6" aria-label={area === "admin" ? "Admin" : "Portal"}>
      {groupsFor(area, hidden).map((group) => {
        const containsActive = group.items.some((item) => isActive(item.href));
        const remembered = session[group.id] ?? saved.split(",").includes(group.id);
        // A group you're working in stays open; otherwise it's however you left it.
        const open = !group.collapsible || containsActive || remembered;
        const listId = `nav-${group.id}`;
        const groupCount = group.items.reduce((sum, item) => sum + (counts?.[item.href] ?? 0), 0);
        return (
          <div key={group.id}>
            {group.collapsible ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                disabled={containsActive}
                onClick={() => {
                  setSession((cur) => ({ ...cur, [group.id]: !open }));
                  setOpen(group.id, !open);
                }}
                className="group flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left transition hover:bg-sea-50 disabled:hover:bg-transparent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-extrabold tracking-wider text-ink-400 uppercase">{group.title}</span>
                  {!open && group.hint ? <span className="block truncate text-xs font-semibold text-ink-400">{group.hint}</span> : null}
                </span>
                {!open && groupCount ? <CountBadge n={groupCount} /> : null}
                {containsActive ? null : (
                  <ChevronDown className={cn("size-4 shrink-0 text-ink-400 transition", open && "rotate-180")} aria-hidden />
                )}
              </button>
            ) : group.title ? (
              <p className="mb-2 px-3 text-xs font-extrabold tracking-wider text-ink-400 uppercase">{group.title}</p>
            ) : null}
            <ul id={listId} hidden={!open} className={cn("space-y-1", group.collapsible && "mt-2")}>
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
                    <CountBadge n={counts?.[href]} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function MobileTabs({ area, counts, hidden }: { area: "portal" | "admin"; counts?: Record<string, number>; hidden?: string[] }) {
  const isActive = useIsActive();
  // Everyday pages as tabs; the rest (setup, website) tucked under "More" so the row stays short.
  const [main, ...rest] = groupsFor(area, hidden);
  const more = rest.flatMap((g) => g.items);
  const current = more.find((i) => isActive(i.href));
  const tabs = [...(main?.items ?? []), ...(current ? [current] : [])];
  const moreCount = more.reduce((sum, i) => sum + (counts?.[i.href] ?? 0), 0);
  return (
    <div className="-mx-4 flex items-start gap-2 pr-4">
      <nav className="min-w-0 flex-1 overflow-x-auto pb-3 pl-4" aria-label={area === "admin" ? "Admin" : "Portal"}>
        <ul className="flex w-max gap-2">
          {tabs.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                ref={isActive(href) ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap transition",
                  isActive(href) ? "bg-ink text-white" : "bg-sea-50 text-ink-600",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                <CountBadge n={counts?.[href]} active={isActive(href)} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rest.length ? (
        <details className="relative shrink-0">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-sea-50 px-3.5 py-2 text-sm font-bold text-ink-600 [&::-webkit-details-marker]:hidden">
            <Ellipsis className="size-4" aria-hidden />
            More
            <CountBadge n={moreCount} />
          </summary>
          <div className="absolute right-0 z-50 mt-2 w-60 space-y-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-xl">
            {rest.map((group) => (
              <div key={group.id}>
                {group.title ? <p className="mb-1 px-2 text-xs font-extrabold tracking-wider text-ink-400 uppercase">{group.title}</p> : null}
                <ul>
                  {group.items.map(({ href, label, icon: Icon }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={isActive(href) ? "page" : undefined}
                        onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-bold",
                          isActive(href) ? "bg-sea-50 text-ocean" : "text-ink-600 hover:bg-sea-50",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {label}
                        <CountBadge n={counts?.[href]} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function StaticNavFallback() {
  return <div className="h-64" />;
}
