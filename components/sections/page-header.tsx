import { RichText } from "@/components/sections/rich-text";
import { str } from "@/components/sections/helpers";
import type { SectionData } from "@/lib/types";
import { cn } from "@/lib/utils";

const backgrounds: Record<string, string> = {
  white: "bg-white",
  sand: "bg-sand",
  sea: "bg-gradient-to-b from-sea-100 to-sea-50",
};

export function PageHeaderSection({ data }: { data: SectionData }) {
  const bg = str(data, "background") || "sea";
  return (
    <section className={cn("relative overflow-hidden", backgrounds[bg] ?? backgrounds.sea)}>
      <div className="container-page relative py-14 text-center sm:py-20">
        {str(data, "eyebrow") ? (
          <p className="mb-4 inline-flex rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-ocean uppercase shadow-sm">
            {str(data, "eyebrow")}
          </p>
        ) : null}
        <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold text-ink sm:text-5xl">
          {str(data, "heading")}
        </h1>
        {str(data, "intro") ? (
          <RichText text={str(data, "intro")} className="mx-auto mt-5 max-w-2xl text-lg text-ink-600" />
        ) : null}
      </div>
      <svg viewBox="0 0 1440 40" preserveAspectRatio="none" className="block h-6 w-full text-white sm:h-8" aria-hidden>
        <path d="M0 40h1440V18c-160 16-320 22-480 12S640 0 480 2 160 26 0 16z" fill="currentColor" />
      </svg>
    </section>
  );
}
