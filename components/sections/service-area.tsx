import { MapPin } from "lucide-react";
import Link from "next/link";
import { RichText } from "@/components/sections/rich-text";
import { SectionShell } from "@/components/sections/shell";
import { str, strings } from "@/components/sections/helpers";
import { AREA_LINKS } from "@/lib/local-pages";
import type { SectionData } from "@/lib/types";

export function ServiceAreaSection({ data }: { data: SectionData }) {
  const areas = strings(data, "areas");
  return (
    <SectionShell background={str(data, "background")}>
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          {str(data, "eyebrow") ? (
            <p className="mb-3 inline-flex rounded-full bg-sun-100 px-3 py-1 text-sm font-extrabold tracking-wide text-ink uppercase">
              {str(data, "eyebrow")}
            </p>
          ) : null}
          <h2 className="text-3xl leading-tight font-semibold text-ink sm:text-4xl">{str(data, "heading")}</h2>
          {str(data, "body") ? <RichText text={str(data, "body")} className="mt-4 text-lg text-ink-600" /> : null}
        </div>
        <ul className="flex flex-wrap gap-3">
          {areas.map((area) => {
            const chip = (
              <>
                <MapPin className="size-4 text-coral" aria-hidden />
                {area}
              </>
            );
            const cls = "inline-flex items-center gap-2 rounded-full border-2 border-white bg-white px-4 py-2.5 font-bold text-ink shadow-sm";
            // Neighborhoods with their own page link to it.
            const href = AREA_LINKS[area];
            return (
              <li key={area}>
                {href ? (
                  <Link href={href} className={`${cls} transition hover:border-sea-200 hover:text-ocean`}>
                    {chip}
                  </Link>
                ) : (
                  <span className={cls}>{chip}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
