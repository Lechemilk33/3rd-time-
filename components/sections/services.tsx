import { Car, Clock, Moon } from "lucide-react";
import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { bool, str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { PawMark } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { getServices, getSiteSettings } from "@/lib/content";
import { hasLengthChoice, priceUnitLabel, servicePrice, serviceTiming } from "@/lib/booking";
import { formatMoney } from "@/lib/format";
import type { SectionData } from "@/lib/types";
import { safeHref } from "@/lib/utils";

export async function ServicesSection({ data }: { data: SectionData }) {
  const [services, settings] = await Promise.all([getServices(), getSiteSettings()]);
  const showBook = bool(data, "showBookButton", true);
  // Placeholder art only keeps a row aligned when some cards have photos; with none it's just empty space.
  const anyPhotos = services.some((s) => s.image_url);

  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading")} intro={str(data, "intro")} />
      {services.length === 0 ? (
        <p className="text-center text-ink-600">Services are coming soon.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => {
            const href = service.bookable
              ? `/portal/book?service=${service.id}`
              : safeHref(settings.headerCtaHref || "/book", "/book");
            return (
              <li
                key={service.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm"
              >
                {service.image_url ? (
                  <Photo src={service.image_url} alt="" className="aspect-[16/10] w-full" />
                ) : anyPhotos ? (
                  <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-sea-100">
                    <PawMark className="size-16 text-sea-300" />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-5">
                  {anyPhotos ? null : (
                    <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-sea-100 text-ocean" aria-hidden>
                      {service.kind === "stay" ? <Moon className="size-5" /> : <PawMark className="size-6" />}
                    </span>
                  )}
                  <h3 className="text-xl font-semibold text-ink">{service.name}</h3>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-2xl font-semibold text-ocean">
                      {hasLengthChoice(service)
                        ? servicePrice({ ...service, price_label: null, price_unit: "flat" }) || service.price_label
                        : service.price_cents == null
                          ? service.price_label
                          : service.price_cents === 0
                            ? "Free"
                            : formatMoney(service.price_cents)}
                    </span>
                    {service.price_cents ? (
                      <span className="text-sm font-bold text-ink-600">{priceUnitLabel(service)}</span>
                    ) : null}
                  </div>
                  {serviceTiming(service) ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-ink-600">
                      {service.kind === "stay" ? (
                        <Moon className="size-4" aria-hidden />
                      ) : (
                        <Clock className="size-4" aria-hidden />
                      )}{" "}
                      {serviceTiming(service)}
                    </p>
                  ) : null}
                  {service.handoff_options.length ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-ink-600">
                      <Car className="size-4" aria-hidden />
                      {service.handoff_options.length > 1
                        ? "Pick-up or drop-off"
                        : service.handoff_options[0] === "pickup"
                          ? "We pick up from home"
                          : "Drop-off"}
                    </p>
                  ) : null}
                  {service.description ? (
                    <p className="mt-3 flex-1 leading-relaxed text-ink-600">{service.description}</p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  {showBook ? (
                    <ButtonLink href={href} variant="secondary" className="mt-5 w-full">
                      Book
                    </ButtonLink>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionShell>
  );
}
