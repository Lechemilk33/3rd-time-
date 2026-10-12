import { Mail, MapPin, Phone, Clock } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { RichText } from "@/components/sections/rich-text";
import { SectionShell } from "@/components/sections/shell";
import { bool, str } from "@/components/sections/helpers";
import { InstagramIcon } from "@/components/ui/icons";
import { getSiteSettings } from "@/lib/content";
import type { SectionData } from "@/lib/types";
import { safeHref } from "@/lib/utils";

export async function ContactSection({ data }: { data: SectionData }) {
  const settings = await getSiteSettings();
  const showForm = bool(data, "showForm", true);

  const details = [
    settings.phone && {
      icon: Phone,
      label: settings.phone,
      href: `tel:${settings.phone.replace(/[^\d+]/g, "")}`,
    },
    settings.email && { icon: Mail, label: settings.email, href: `mailto:${settings.email}` },
    settings.instagramUrl && { icon: InstagramIcon, label: "Instagram", href: safeHref(settings.instagramUrl) },
    settings.serviceAreaSummary && { icon: MapPin, label: settings.serviceAreaSummary },
    settings.hours && { icon: Clock, label: settings.hours },
  ].filter(Boolean) as { icon: typeof Phone; label: string; href?: string }[];

  return (
    <SectionShell background={str(data, "background")}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          {str(data, "eyebrow") ? (
            <p className="mb-3 inline-flex rounded-full bg-sun-100 px-3 py-1 text-sm font-extrabold tracking-wide text-ink uppercase">
              {str(data, "eyebrow")}
            </p>
          ) : null}
          {str(data, "heading") ? (
            <h2 className="text-3xl leading-tight font-semibold text-ink sm:text-4xl">{str(data, "heading")}</h2>
          ) : null}
          {str(data, "intro") ? <RichText text={str(data, "intro")} className="mt-4 text-lg text-ink-600" /> : null}
          <ul className="mt-8 space-y-3">
            {details.map((d) => {
              const Icon = d.icon;
              const content = (
                <>
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sea-100 text-ocean">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-bold break-all text-ink">{d.label}</span>
                </>
              );
              return (
                <li key={d.label}>
                  {d.href ? (
                    <a
                      href={d.href}
                      className="flex items-center gap-3 rounded-2xl p-1 transition hover:bg-sea-50"
                      {...(d.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                    >
                      {content}
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 p-1">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        {showForm ? (
          <div className="rounded-[2rem] border border-ink-100 bg-white p-6 shadow-lg sm:p-8">
            <ContactForm />
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}
