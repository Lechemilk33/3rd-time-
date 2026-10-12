import { Check } from "lucide-react";
import { BeachScene } from "@/components/site/beach-scene";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { str, strings } from "@/components/sections/helpers";
import type { SectionData } from "@/lib/types";
import { safeHref } from "@/lib/utils";

export function HeroSection({ data }: { data: SectionData }) {
  const image = str(data, "image");
  const badges = strings(data, "badges");

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sea-100 via-sea-50 to-white">
      <PawMark className="pointer-events-none absolute -top-6 -left-8 size-40 rotate-[-20deg] text-sea-200" />
      <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          {str(data, "eyebrow") ? (
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-ocean shadow-sm">
              <span className="size-2 rounded-full bg-sun" aria-hidden />
              {str(data, "eyebrow")}
            </p>
          ) : null}
          <h1 className="text-4xl leading-[1.05] font-semibold text-ink sm:text-5xl lg:text-6xl">
            {str(data, "heading")}
          </h1>
          {str(data, "subheading") ? (
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600 sm:text-xl">{str(data, "subheading")}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            {str(data, "primaryLabel") ? (
              <ButtonLink href={safeHref(str(data, "primaryHref"), "/book")} size="lg">
                {str(data, "primaryLabel")}
              </ButtonLink>
            ) : null}
            {str(data, "secondaryLabel") ? (
              <ButtonLink href={safeHref(str(data, "secondaryHref"), "/services")} variant="outline" size="lg">
                {str(data, "secondaryLabel")}
              </ButtonLink>
            ) : null}
          </div>
          {badges.length ? (
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
              {badges.map((badge) => (
                <li key={badge} className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="grid size-5 place-items-center rounded-full bg-sun">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  {badge}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -right-2 -bottom-2 h-full w-full rounded-[2.5rem] bg-sun sm:-right-4 sm:-bottom-4" aria-hidden />
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] border-4 border-white bg-sea-100 shadow-xl">
            {image ? (
              <Photo src={image} alt="" loading="eager" fetchPriority="high" className="h-full w-full" />
            ) : (
              <BeachScene />
            )}
          </div>
          <div className="animate-float absolute -bottom-5 -left-3 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg sm:-left-6">
            <span className="grid size-9 place-items-center rounded-full bg-sea-100">
              <PawMark className="size-5 text-ocean" />
            </span>
            <span className="text-sm leading-tight font-bold text-ink">
              Tails wagging
              <br />
              <span className="font-semibold text-ink-600">in Ocean Beach</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
