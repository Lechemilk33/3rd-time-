import type { ComponentType } from "react";
import { BookingSection } from "@/components/sections/booking";
import { ContactSection } from "@/components/sections/contact";
import { CtaSection } from "@/components/sections/cta";
import { FaqSection } from "@/components/sections/faq";
import { FeaturesSection } from "@/components/sections/features";
import { GallerySection } from "@/components/sections/gallery";
import { HeroSection } from "@/components/sections/hero";
import { PageHeaderSection } from "@/components/sections/page-header";
import { ServiceAreaSection } from "@/components/sections/service-area";
import { ServicesSection } from "@/components/sections/services";
import { TestimonialsSection } from "@/components/sections/testimonials";
import { TextImageSection } from "@/components/sections/text-image";
import type { Section, SectionData } from "@/lib/types";

const RENDERERS: Record<string, ComponentType<{ data: SectionData }>> = {
  hero: HeroSection,
  page_header: PageHeaderSection,
  features: FeaturesSection,
  services: ServicesSection,
  text_image: TextImageSection,
  gallery: GallerySection,
  service_area: ServiceAreaSection,
  testimonials: TestimonialsSection,
  faq: FaqSection,
  cta: CtaSection,
  booking: BookingSection,
  contact: ContactSection,
};

export function Sections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((section) => {
        const Renderer = RENDERERS[section.type];
        return Renderer ? <Renderer key={section.id} data={section.data ?? {}} /> : null;
      })}
    </>
  );
}
