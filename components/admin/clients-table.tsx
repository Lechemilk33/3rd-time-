"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  role: "client" | "admin";
  approved: boolean;
  intake: "submitted" | "reviewed" | "approved" | null;
  pets: { name: string; breed: string | null }[];
  joined: string;
};

const INTAKE: Record<NonNullable<ClientRow["intake"]>, { tone: "sun" | "sea" | "green"; label: string }> = {
  submitted: { tone: "sun", label: "Intake to review" },
  reviewed: { tone: "sea", label: "Intake reviewed" },
  approved: { tone: "green", label: "Intake approved" },
};

type Filter = "all" | "review" | "new" | "approved";

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (filter === "review" && r.intake !== "submitted") return false;
      if (filter === "new" && (r.approved || r.role === "admin")) return false;
      if (filter === "approved" && !r.approved) return false;
      if (!words.length) return true;
      const hay = [r.name, r.email, r.phone, (r.phone ?? "").replace(/\D/g, ""), r.address, ...r.pets.flatMap((p) => [p.name, p.breed])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, query, filter]);

  const counts = {
    all: rows.length,
    review: rows.filter((r) => r.intake === "submitted").length,
    new: rows.filter((r) => !r.approved && r.role !== "admin").length,
    approved: rows.filter((r) => r.approved).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, pup, breed, phone, address…"
            aria-label="Search clients"
            className="h-11 w-full rounded-full border-2 border-ink-100 bg-white pr-4 pl-10 text-sm font-semibold placeholder:text-ink-400 focus:border-ocean focus:ring-4 focus:ring-sea-100 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Everyone"],
              ["review", "Intake to review"],
              ["new", "Not approved"],
              ["approved", "Approved"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-bold transition",
                filter === key ? "bg-ink text-white" : "bg-white text-ink-600 ring-1 ring-ink-100 hover:text-ink",
              )}
            >
              {label} <span className="opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="p-0 sm:p-0">
        {filtered.length ? (
          <ul className="divide-y divide-ink-100">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/clients/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-4 hover:bg-sea-50 sm:px-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sun font-display font-semibold">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {p.name}
                      {p.role === "admin" ? <Badge tone="coral">Admin</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-ink-600">{[p.email, p.phone, p.address].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="text-sm font-bold text-ink-600">🐾 {p.pets.length ? p.pets.map((x) => x.name).join(", ") : "No pups"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.role === "client" ? (
                      p.approved ? <Badge tone="green">Can book walks</Badge> : <Badge tone="gray">Not approved</Badge>
                    ) : null}
                    {p.intake ? <Badge tone={INTAKE[p.intake].tone}>{INTAKE[p.intake].label}</Badge> : <Badge tone="gray">No intake</Badge>}
                  </div>
                  <span className="hidden text-sm text-ink-400 md:inline">Joined {p.joined}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-12 text-center text-ink-600">No clients match{query ? ` “${query}”` : ""}.</p>
        )}
      </Card>
    </div>
  );
}
