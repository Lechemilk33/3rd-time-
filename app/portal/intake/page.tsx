import { PageTitle } from "@/components/dashboard/shell";
import { IntakeForm } from "@/components/portal/intake-form";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { getForm } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { askedEachBooking } from "@/lib/intake";
import { createClient } from "@/lib/supabase/server";
import type { FormSubmission } from "@/lib/types";

const STATUS = {
  submitted: { tone: "sun", label: "Submitted — waiting for review" },
  reviewed: { tone: "sea", label: "Reviewed" },
  approved: { tone: "green", label: "Approved" },
} as const;

export default async function IntakePage() {
  const user = await requireUser();
  const form = await getForm("intake");
  if (!form) {
    return (
      <>
        <PageTitle title="Intake form" />
        <Notice>The intake form isn’t available yet. Check back soon!</Notice>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: submission }, servicesRes] = await Promise.all([
    supabase.from("form_submissions").select("*").eq("form_slug", form.slug).eq("user_id", user.id).maybeSingle<FormSubmission>(),
    supabase
      .from("services")
      .select("id, name, description, price_cents, price_label, price_unit, duration_minutes, kind, start_minute, end_minute")
      .eq("active", true)
      .order("position"),
  ]);

  return (
    <>
      <PageTitle
        title={form.title}
        description={form.description}
        actions={
          submission ? (
            <Badge tone={STATUS[submission.status].tone} className="px-3 py-1 text-sm">
              {STATUS[submission.status].label} · {formatDate(submission.updated_at)}
            </Badge>
          ) : null
        }
      />
      <IntakeForm
        fields={form.fields.filter((f) => !askedEachBooking(f))}
        answers={submission?.answers ?? {}}
        services={servicesRes.data ?? []}
        selectedServiceIds={submission?.service_ids ?? []}
        submitted={Boolean(submission)}
      />
    </>
  );
}
