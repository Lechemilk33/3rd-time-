import { BeachScene } from "@/components/site/beach-scene";
import { RichText } from "@/components/sections/rich-text";
import { SectionShell } from "@/components/sections/shell";
import { str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { Photo } from "@/components/ui/photo";
import type { SectionData } from "@/lib/types";
import { cn, safeHref } from "@/lib/utils";

export function TextImageSection({ data }: { data: SectionData }) {
  const image = str(data, "image");
  const imageLeft = str(data, "imageSide") === "left";

  return (
    <SectionShell background={str(data, "background")}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn(imageLeft && "lg:order-2")}>
          {str(data, "eyebrow") ? (
            <p className="mb-3 inline-flex rounded-full bg-sun-100 px-3 py-1 text-sm font-extrabold tracking-wide text-ink uppercase">
              {str(data, "eyebrow")}
            </p>
          ) : null}
          {str(data, "heading") ? (
            <h2 className="text-3xl leading-tight font-semibold text-ink sm:text-4xl">{str(data, "heading")}</h2>
          ) : null}
          {str(data, "body") ? <RichText text={str(data, "body")} className="mt-5 text-lg text-ink-600" /> : null}
          {str(data, "buttonLabel") ? (
            <ButtonLink href={safeHref(str(data, "buttonHref"), "/")} variant="secondary" className="mt-7">
              {str(data, "buttonLabel")}
            </ButtonLink>
          ) : null}
        </div>
        <div className={cn("relative mx-auto w-full max-w-lg", imageLeft && "lg:order-1")}>
          <div
            className={cn(
              "absolute -bottom-2 h-full w-full rounded-[2rem] bg-sea sm:-bottom-4",
              imageLeft ? "-left-2 sm:-left-4" : "-right-2 sm:-right-4",
            )}
            aria-hidden
          />
          <div className="relative aspect-square overflow-hidden rounded-[2rem] border-4 border-white bg-sea-100 shadow-lg">
            {image ? <Photo src={image} alt="" className="h-full w-full" /> : <BeachScene />}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
