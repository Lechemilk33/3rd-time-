import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { num, str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { getGalleryPhotos } from "@/lib/content";
import type { SectionData } from "@/lib/types";
import { isExternalHref, safeHref } from "@/lib/utils";

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
        <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl bg-sea-50 px-6 py-10 text-center">
          <PawMark className="size-10 -rotate-12 text-sea-300" />
          <p className="mt-3 font-semibold text-ink-600">Fresh pup photos are on the way.</p>
        </div>
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
