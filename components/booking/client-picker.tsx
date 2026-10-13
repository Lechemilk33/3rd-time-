"use client";

import { PawPrint, Search, UserRound, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { PetAvatar } from "@/components/calendar/event-bits";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PickerPet = { id: string; name: string; breed: string | null; photo_url: string | null };
export type PickerClient = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  booking_approved: boolean;
  role: "client" | "admin";
  pets: PickerPet[];
};

type Result =
  | { kind: "pet"; key: string; client: PickerClient; pet: PickerPet; score: number }
  | { kind: "client"; key: string; client: PickerClient; score: number };

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function displayName(c: PickerClient) {
  return c.full_name || c.email || "No name yet";
}

/** Scores how well a client (and each of their pups) matches every word typed. */
function search(clients: PickerClient[], query: string): Result[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [...clients]
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      .slice(0, 8)
      .map((client) => ({ kind: "client", key: `c-${client.id}`, client, score: 0 }));
  }
  const results: Result[] = [];
  for (const client of clients) {
    const name = (client.full_name ?? "").toLowerCase();
    const clientHay = [name, client.email, client.address, digits(client.phone)].join(" ").toLowerCase();
    const petHay = client.pets.map((p) => `${p.name} ${p.breed ?? ""}`.toLowerCase()).join(" ");

    // Pup hits: every word matches the pup or its owner, and at least one hits the pup.
    for (const pet of client.pets) {
      const pName = pet.name.toLowerCase();
      const pHay = `${pName} ${(pet.breed ?? "").toLowerCase()}`;
      const ok = words.every((w) => pHay.includes(w) || clientHay.includes(w) || (digits(w) && digits(client.phone).includes(digits(w))));
      if (!ok || !words.some((w) => pHay.includes(w))) continue;
      const score = (pName.startsWith(words[0]) ? 30 : 0) + (pName === words.join(" ") ? 40 : 0) + 10;
      results.push({ kind: "pet", key: `p-${pet.id}`, client, pet, score });
    }

    const ok = words.every((w) => clientHay.includes(w) || petHay.includes(w) || (digits(w) && digits(client.phone).includes(digits(w))));
    if (!ok) continue;
    const score =
      (name.startsWith(words[0]) ? 25 : 0) +
      (name.split(" ").some((part) => part.startsWith(words[0])) ? 10 : 0) +
      (words.every((w) => clientHay.includes(w)) ? 5 : 0);
    results.push({ kind: "client", key: `c-${client.id}`, client, score });
  }
  return results.sort((a, b) => b.score - a.score || displayName(a.client).localeCompare(displayName(b.client))).slice(0, 10);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const w of words) {
    let i = lower.indexOf(w);
    while (i !== -1) {
      for (let j = i; j < i + w.length; j++) marks[j] = true;
      i = lower.indexOf(w, i + w.length);
    }
  }
  const out: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const on = marks[i];
    let j = i;
    while (j < text.length && marks[j] === on) j++;
    out.push(on ? <mark key={i} className="rounded bg-sun-300/70 px-0.5 text-ink">{text.slice(i, j)}</mark> : text.slice(i, j));
    i = j;
  }
  return <>{out}</>;
}

export function ClientPicker({
  clients,
  selected,
  onSelect,
  onClear,
  autoFocus,
}: {
  clients: PickerClient[];
  selected: PickerClient | null;
  onSelect: (client: PickerClient, pet?: PickerPet) => void;
  onClear: () => void;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(clients, query), [clients, query]);

  function choose(r: Result) {
    onSelect(r.client, r.kind === "pet" ? r.pet : undefined);
    setQuery("");
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-ocean/40 bg-sea-50 p-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sun font-display text-lg font-semibold">
          {displayName(selected).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-extrabold">
            {displayName(selected)}
            {selected.booking_approved ? <Badge tone="green">Approved</Badge> : <Badge tone="sun">New client</Badge>}
          </p>
          <p className="truncate text-sm text-ink-600">{[selected.phone, selected.email, selected.address].filter(Boolean).join(" · ")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onClear();
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-ocean hover:bg-white"
        >
          <X className="size-4" aria-hidden /> Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].key}` : undefined}
        aria-label="Search clients and pups"
        autoFocus={autoFocus}
        value={query}
        placeholder="Search by pup, breed, owner, phone, email or address…"
        // The list opens when someone clicks or types in the box, not just because it has focus.
        onClick={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-13 w-full rounded-2xl border-2 border-ink-100 bg-white pr-4 pl-12 text-base font-semibold placeholder:font-normal placeholder:text-ink-400 focus:border-ocean focus:ring-4 focus:ring-sea-100 focus:outline-none"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching clients and pups"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-ink-100 bg-white p-1.5 shadow-[0_20px_50px_-12px_rgba(15,43,63,0.35)]"
        >
          {!query.trim() ? (
            <li className="px-3 pt-1 pb-2 text-xs font-extrabold tracking-wider text-ink-400 uppercase">Clients</li>
          ) : null}
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ink-600">
              No one matches “{query}”. Try a pup’s name, a street or the last 4 of a phone number.
            </li>
          ) : null}
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`${listId}-${r.key}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5", i === active && "bg-sea-50")}
            >
              {r.kind === "pet" ? (
                <>
                  <PetAvatar pet={r.pet} size={40} ring={false} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-extrabold">
                      <PawPrint className="size-3.5 text-ocean" aria-hidden />
                      <Highlight text={r.pet.name} query={query} />
                      {r.pet.breed ? (
                        <span className="font-semibold text-ink-600">
                          · <Highlight text={r.pet.breed} query={query} />
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-sm text-ink-600">
                      <Highlight text={displayName(r.client)} query={query} />
                      {r.client.address ? (
                        <>
                          {" · "}
                          <Highlight text={r.client.address} query={query} />
                        </>
                      ) : null}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sun font-display font-semibold">
                    {displayName(r.client).charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-extrabold">
                      <UserRound className="size-3.5 text-ocean" aria-hidden />
                      <Highlight text={displayName(r.client)} query={query} />
                      {r.client.role === "admin" ? <Badge tone="coral">Team</Badge> : null}
                    </span>
                    <span className="block truncate text-sm text-ink-600">
                      {r.client.pets.length ? `🐾 ${r.client.pets.map((p) => p.name).join(", ")} · ` : "No pups yet · "}
                      <Highlight text={[r.client.phone, r.client.email].filter(Boolean).join(" · ")} query={query} />
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
