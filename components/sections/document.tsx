import { RichText } from "@/components/sections/rich-text";
import { SectionShell } from "@/components/sections/shell";
import { str } from "@/components/sections/helpers";
import { getBookingPolicy, getSiteSettings } from "@/lib/content";
import type { SectionData } from "@/lib/types";

/** Long-form text such as the Terms of Service, with the live business details filled in. */
export async function DocumentSection({ data }: { data: SectionData }) {
  const [settings, policy] = await Promise.all([getSiteSettings(), getBookingPolicy()]);
  const values: Record<string, string> = {
    business: settings.businessName,
    email: settings.email || "us",
    cancel_hours: String(policy.cancel_cutoff_hours),
  };
  const body = str(data, "body").replace(/\{(business|email|cancel_hours)\}/g, (_, key: string) => values[key]);
  const updated = str(data, "updated");

  return (
    <SectionShell background={str(data, "background")}>
      <article className="mx-auto max-w-3xl">
        {updated ? <p className="mb-6 text-sm font-bold text-ink-400">{updated}</p> : null}
        <RichText text={body} className="text-[1.05rem] text-ink-600" />
      </article>
    </SectionShell>
  );
}
