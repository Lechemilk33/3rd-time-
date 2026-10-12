import type { ReactNode } from "react";
import { RichText } from "@/components/sections/rich-text";
import { cn } from "@/lib/utils";

const backgrounds: Record<string, string> = {
  white: "bg-white",
  sand: "bg-sand",
  sea: "bg-sea-50",
};

export function SectionShell({
  background = "white",
  className,
  children,
}: {
  background?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(backgrounds[background] ?? backgrounds.white, "py-16 sm:py-20", className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  heading,
  intro,
  align = "center",
  as: Tag = "h2",
}: {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  align?: "center" | "left";
  as?: "h1" | "h2";
}) {
  if (!eyebrow && !heading && !intro) return null;
  return (
    <div className={cn("mb-10 max-w-2xl", align === "center" ? "mx-auto text-center" : "")}>
      {eyebrow ? (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-sun-100 px-3 py-1 text-sm font-extrabold tracking-wide text-ink uppercase">
          {eyebrow}
        </p>
      ) : null}
      {heading ? (
        <Tag className="text-3xl leading-tight font-semibold text-ink sm:text-4xl">{heading}</Tag>
      ) : null}
      {intro ? <RichText text={intro} className="mt-4 text-lg text-ink-600" /> : null}
    </div>
  );
}
