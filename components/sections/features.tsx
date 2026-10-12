import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { items, str } from "@/components/sections/helpers";
import type { SectionData } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FeaturesSection({ data }: { data: SectionData }) {
  const cards = items(data, "items");
  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} intro={str(data, "intro")} />
      <ul
        className={cn(
          "grid gap-5 sm:grid-cols-2",
          cards.length === 3 ? "lg:grid-cols-3" : cards.length >= 4 ? "lg:grid-cols-4" : "",
        )}
      >
        {cards.map((card, i) => (
          <li
            key={i}
            className="rounded-3xl border border-ink-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            {str(card, "icon") ? (
              <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-sea-100 text-2xl" aria-hidden>
                {str(card, "icon")}
              </span>
            ) : null}
            <h3 className="text-xl font-semibold text-ink">{str(card, "title")}</h3>
            {str(card, "body") ? <p className="mt-2 leading-relaxed text-ink-600">{str(card, "body")}</p> : null}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
