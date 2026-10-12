import { ExternalLink, LogOut, Shield, User } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export async function UserMenu({ area }: { area: "portal" | "admin" }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const name = user.profile.full_name || user.email;
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl bg-sand px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sun font-display font-semibold text-ink">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{name}</p>
          <p className="truncate text-xs text-ink-600">{user.isAdmin ? "Admin" : "Client"}</p>
        </div>
      </div>
      <div className="grid gap-1 text-sm font-bold">
        {user.isAdmin && area === "portal" ? (
          <Link href="/admin" className="flex items-center gap-2 rounded-xl px-3 py-2 text-ocean hover:bg-sea-50">
            <Shield className="size-4" aria-hidden /> Admin portal
          </Link>
        ) : null}
        {area === "admin" ? (
          <Link href="/portal" className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink-600 hover:bg-sea-50">
            <User className="size-4" aria-hidden /> Client view
          </Link>
        ) : null}
        <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink-600 hover:bg-sea-50">
          <ExternalLink className="size-4" aria-hidden /> View website
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-ink-600 hover:bg-sea-50"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

export async function MobileUserMenu({ area }: { area: "portal" | "admin" }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const initial = (user.profile.full_name || user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <details className="relative">
      <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-sun font-display font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Account menu</span>
        {initial}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-ink-100 bg-white p-3 shadow-xl">
        <UserMenu area={area} />
      </div>
    </details>
  );
}
