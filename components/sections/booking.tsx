import { CalendarHeart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { RichText } from "@/components/sections/rich-text";
import { SectionHeading, SectionShell } from "@/components/sections/shell";
import { items, str } from "@/components/sections/helpers";
import { ButtonLink } from "@/components/ui/button";
import { getNavLinks } from "@/lib/content";
import { DEFAULT_BOOKING_STEPS } from "@/lib/sections";
import type { SectionData } from "@/lib/types";

/** Explains how booking works and sends people to the client portal to book. */
export async function BookingSection({ data }: { data: SectionData }) {
  const links = await getNavLinks();
  const saved = items(data, "steps").filter((s) => str(s, "title"));
  const steps = saved.length ? saved : DEFAULT_BOOKING_STEPS;

  return (
    <SectionShell background={str(data, "background")}>
      <SectionHeading eyebrow={str(data, "eyebrow")} heading={str(data, "heading") || "Booking is easy"} intro={str(data, "intro")} />
      <ol className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={i} className="relative rounded-3xl border border-ink-100 bg-white p-6 shadow-sm">
            <span className="grid size-11 place-items-center rounded-2xl bg-sun font-display text-xl font-semibold text-ink">{i + 1}</span>
            <h3 className="mt-4 text-xl font-semibold text-ink">{str(step, "title")}</h3>
            {str(step, "body") ? <RichText text={str(step, "body")} className="mt-2 text-ink-600" /> : null}
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/signup?next=/portal/book" size="lg">
            <CalendarHeart className="size-5" aria-hidden /> {str(data, "buttonLabel") || "Get started"}
          </ButtonLink>
          <ButtonLink href="/login?next=/portal/book" size="lg" variant="outline">
            I have an account
          </ButtonLink>
        </div>
        {links.some((l) => l.slug === "contact") ? (
          <Link href="/contact" className="inline-flex items-center gap-1.5 font-bold text-ocean hover:underline">
            <MessageCircle className="size-4" aria-hidden /> Questions first? Send us a message
          </Link>
        ) : null}
      </div>
    </SectionShell>
  );
}
