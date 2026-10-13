import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePage } from "@/app/admin/_actions/content";
import { adminData } from "@/app/admin/_lib";
import { PageSettingsForm } from "@/components/admin/page-forms";
import { SectionsEditor } from "@/components/admin/sections-editor";
import { PageTitle } from "@/components/dashboard/shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { Page, Section } from "@/lib/types";

export default async function EditPagePage({ params }: PageProps<"/admin/pages/[id]">) {
  const [{ id }, { supabase }] = await Promise.all([params, adminData()]);
  const { data: page } = await supabase.from("pages").select("*").eq("id", id).maybeSingle<Page>();
  if (!page) notFound();
  const { data: sections } = await supabase
    .from("sections")
    .select("id, page_id, type, position, visible, data")
    .eq("page_id", id)
    .order("position")
    .order("created_at");

  const href = page.slug === "home" ? "/" : `/${page.slug}`;

  return (
    <>
      <Link href="/admin/pages" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ocean hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All pages
      </Link>
      <PageTitle
        title={page.title}
        description="Click a section to edit it. Changes go live as soon as you save."
        actions={
          <ButtonLink href={href} target="_blank" variant="outline">
            <ExternalLink className="size-4" aria-hidden /> View page
          </ButtonLink>
        }
      />
      <SectionsEditor pageId={page.id} initialSections={(sections ?? []) as Section[]} />

      <details className="mt-10 rounded-3xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
        <summary className="cursor-pointer font-display text-xl font-semibold">Page settings</summary>
        <div className="mt-5">
          <PageSettingsForm page={page} />
        </div>
      </details>

      {page.slug !== "home" ? (
        <Card className="mt-6 border-red-100">
          <h2 className="font-semibold">Delete this page</h2>
          <p className="mt-1 mb-4 text-sm text-ink-600">Removes the page and all of its sections. This can’t be undone.</p>
          <form action={deletePage.bind(null, page.id)}>
            <ConfirmSubmit
              message={`Delete “${page.title}” and all its sections? This can’t be undone.`}
              className="inline-flex items-center gap-2 rounded-full border-2 border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="size-4" aria-hidden /> Delete page
            </ConfirmSubmit>
          </form>
        </Card>
      ) : null}
    </>
  );
}
