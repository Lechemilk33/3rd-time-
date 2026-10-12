import { CalendlyEmbed } from "@/components/calendly-embed";
import { RichText } from "@/components/sections/rich-text";
import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import { getNavLinks, getSiteSettings } from "@/lib/content";
import type { SectionData } from "@/lib/types";

export async function BookingSection({ data }: { data: SectionData }) {
  const [settings, links] = await Promise.all([getSiteSettings(), getNavLinks()]);
  const url = (str(data, "bookingUrl") || settings.bookingUrl).trim();
  const isCalendly = /^https:\/\/calendly\.com\//i.test(url);

  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} intro={str(data, "intro")} />
      <div className="mx-auto max-w-4xl">
        {isCalendly ? (
          <CalendlyEmbed url={url} />
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-sea-200 bg-sea-50 px-6 py-12 text-center">
            <PawMark className="mx-auto size-12 text-sea-300" />
            <RichText
              text={str(data, "fallbackText") || "Online booking is coming soon."}
              className="mx-auto mt-4 max-w-lg text-lg text-ink"
            />
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {/^https?:\/\//i.test(url) ? (
                <ButtonLink href={url} target="_blank" rel="noreferrer">
                  Book online
                </ButtonLink>
              ) : null}
              {links.some((l) => l.slug === "contact") ? (
                <ButtonLink href="/contact">Send us a message</ButtonLink>
              ) : null}
              {settings.phone ? (
                <ButtonLink href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} variant="outline">
                  Call {settings.phone}
                </ButtonLink>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}
