import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/dashboard/shell";
import { AddServiceForm } from "@/components/portal/add-service-form";
import { requireUser } from "@/lib/auth";
import { getForm } from "@/lib/content";
import { formatDuration, formatPrice } from "@/lib/format";
import { fieldsForService } from "@/lib/intake";
import { createClient } from "@/lib/supabase/server";
import type { FormAnswers, Service } from "@/lib/types";

export default async function AddServicePage({ params }: PageProps<"/portal/services/[id]">) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [serviceRes, submissionRes, form] = await Promise.all([
    supabase.from("services").select("*").eq("id", id).eq("active", true).maybeSingle<Service>(),
    supabase.from("form_submissions").select("answers, service_ids").eq("form_slug", "intake").eq("user_id", user.id).maybeSingle(),
    getForm("intake"),
  ]);
  const service = serviceRes.data;
  if (!service) notFound();

  const fields = form ? fieldsForService(form.fields, service.id) : [];
  const already = ((submissionRes.data?.service_ids as string[] | undefined) ?? []).includes(service.id);
  const canBook = service.bookable && (user.isAdmin || user.profile.booking_approved || service.audience === "everyone");

  return (
    <>
      <Link href="/portal" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ocean hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <PageTitle
        title={already ? service.name : `Add ${service.name}`}
        description={[formatPrice(service.price_cents, service.price_label), formatDuration(service.duration_minutes)].filter(Boolean).join(" · ")}
      />
      <AddServiceForm
        service={{ id: service.id, name: service.name, description: service.description }}
        fields={fields}
        answers={(submissionRes.data?.answers as FormAnswers | undefined) ?? {}}
        already={already}
        canBook={canBook}
      />
    </>
  );
}
