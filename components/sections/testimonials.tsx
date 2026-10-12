import { Quote } from "lucide-react";
import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { items, str } from "@/components/sections/helpers";
import type { SectionData } from "@/lib/types";

export function TestimonialsSection({ data }: { data: SectionData }) {
  const reviews = items(data, "items").filter((r) => str(r, "quote"));
  if (!reviews.length) return null;
  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} />
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review, i) => (
          <li key={i} className="flex flex-col rounded-3xl bg-white p-6 shadow-sm">
            <Quote className="size-8 text-sun" aria-hidden />
            <blockquote className="mt-3 flex-1 text-lg leading-relaxed text-ink">{str(review, "quote")}</blockquote>
            <p className="mt-5 font-bold text-ink">
              {str(review, "name")}
              {str(review, "pup") ? <span className="font-semibold text-ink-600"> · {str(review, "pup")}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
