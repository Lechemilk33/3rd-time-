import { RichText } from "@/components/sections/rich-text";
import { str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import type { SectionData } from "@/lib/types";
import { cn, safeHref } from "@/lib/utils";

const styles: Record<string, { box: string; text: string; muted: string; paw: string; secondary: "light" | "outline" }> = {
  ocean: { box: "bg-ocean", text: "text-white", muted: "text-white/85", paw: "text-white/10", secondary: "light" },
  sun: { box: "bg-sun", text: "text-ink", muted: "text-ink/80", paw: "text-ink/10", secondary: "light" },
  sea: { box: "bg-sea-100", text: "text-ink", muted: "text-ink-600", paw: "text-sea-300", secondary: "outline" },
};

export function CtaSection({ data }: { data: SectionData }) {
  const style = styles[str(data, "style")] ?? styles.ocean;
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page">
        <div className={cn("relative overflow-hidden rounded-[2.5rem] px-6 py-12 text-center sm:px-12 sm:py-16", style.box)}>
          <PawMark className={cn("absolute -top-6 -right-6 size-40 rotate-12", style.paw)} />
          <PawMark className={cn("absolute -bottom-8 -left-6 size-32 -rotate-12", style.paw)} />
          <div className="relative mx-auto max-w-2xl">
            <h2 className={cn("text-3xl leading-tight font-semibold sm:text-4xl", style.text)}>{str(data, "heading")}</h2>
            {str(data, "body") ? <RichText text={str(data, "body")} className={cn("mt-4 text-lg", style.muted)} /> : null}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {str(data, "buttonLabel") ? (
                <ButtonLink href={safeHref(str(data, "buttonHref"), "/book")} size="lg" variant={style.box === "bg-sun" ? "secondary" : "primary"}>
                  {str(data, "buttonLabel")}
                </ButtonLink>
              ) : null}
              {str(data, "secondaryLabel") ? (
                <ButtonLink href={safeHref(str(data, "secondaryHref"), "/")} size="lg" variant={style.secondary}>
                  {str(data, "secondaryLabel")}
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
