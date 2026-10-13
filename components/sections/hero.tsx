import { Check } from "lucide-react";
import { BeachScene } from "@/components/site/beach-scene";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import { HeroBadge, HeroFrame } from "@/components/sections/hero-frame";
import { HeroSlideshow } from "@/components/sections/hero-slideshow";
import { num, photos as photoList, str, strings } from "@/components/sections/helpers";
import type { SectionData } from "@/lib/types";
import { safeHref } from "@/lib/utils";

export function HeroSection({ data }: { data: SectionData }) {
  // Photos (older pages saved a single "image").
  const photos = Array.isArray(data.images) ? photoList(data, "images") : str(data, "image") ? [{ url: str(data, "image"), name: "" }] : [];
  const seconds = Math.min(15, Math.max(3, num(data, "seconds", 5)));
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

        {photos.length ? (
          <HeroSlideshow photos={photos} seconds={seconds} />
        ) : (
          <HeroFrame badge={<HeroBadge title="Tails wagging" subtitle="in Ocean Beach" />}>
            <BeachScene />
          </HeroFrame>
        )}
      </div>
    </section>
  );
}
