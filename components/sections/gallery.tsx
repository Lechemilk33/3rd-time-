import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { num, str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { getGalleryPhotos } from "@/lib/content";
import type { SectionData } from "@/lib/types";
import { isExternalHref, safeHref } from "@/lib/utils";

const PLACEHOLDER_TILES = ["bg-sea-100", "bg-sun-100", "bg-sand", "bg-sea-200"];

export async function GallerySection({ data }: { data: SectionData }) {
  const all = await getGalleryPhotos();
  const limit = num(data, "limit", 0);
  const photos = limit > 0 ? all.slice(0, limit) : all;
  const buttonHref = safeHref(str(data, "buttonHref"), "");

  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} intro={str(data, "intro")} />
      {photos.length ? (
        <ul className="columns-2 gap-4 md:columns-3 lg:columns-4">
          {photos.map((photo, i) => (
            <li key={photo.id} className="mb-4 break-inside-avoid">
              <figure className="overflow-hidden rounded-3xl bg-sea-50 shadow-sm">
                {/* Chrome can skip lazy images inside CSS columns, so load the first batch eagerly. */}
                <Photo
                  src={photo.image_url}
                  alt={photo.caption ?? ""}
                  className="min-h-24 w-full"
                  loading={i < 8 ? "eager" : "lazy"}
                />
                {photo.caption ? (
                  <figcaption className="px-4 py-3 text-sm font-semibold text-ink-600">{photo.caption}</figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Photos coming soon">
          {PLACEHOLDER_TILES.map((bg, i) => (
            <li key={bg} className={`grid aspect-square place-items-center rounded-3xl ${bg}`}>
              <PawMark className={`size-14 text-ink/15 ${i % 2 ? "rotate-12" : "-rotate-12"}`} />
            </li>
          ))}
        </ul>
      )}
      {str(data, "buttonLabel") && buttonHref ? (
        <div className="mt-10 text-center">
          <ButtonLink
            href={buttonHref}
            variant="outline"
            {...(isExternalHref(buttonHref) ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {str(data, "buttonLabel")}
          </ButtonLink>
        </div>
      ) : null}
    </SectionShell>
  );
}
