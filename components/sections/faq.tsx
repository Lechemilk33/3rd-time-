import { ChevronDown } from "lucide-react";
import { RichText } from "@/components/sections/rich-text";
import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { items, str } from "@/components/sections/helpers";
import type { SectionData } from "@/lib/types";

export function FaqSection({ data }: { data: SectionData }) {
  const faqs = items(data, "items").filter((f) => str(f, "question"));
  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} />
      <div className="mx-auto max-w-3xl space-y-3">
        {faqs.map((faq, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-ink-100 bg-white px-5 shadow-sm open:shadow-md"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
              {str(faq, "question")}
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sea-50 transition group-open:rotate-180 group-open:bg-sun">
                <ChevronDown className="size-4" aria-hidden />
              </span>
            </summary>
            <RichText text={str(faq, "answer")} className="pb-5 text-ink-600" />
          </details>
        ))}
      </div>
    </SectionShell>
  );
}
