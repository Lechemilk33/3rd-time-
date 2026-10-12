import { ArrowDown, ArrowUp, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { movePage } from "@/app/admin/_actions/content";
import { adminData } from "@/app/admin/_lib";
import { NewPageForm } from "@/components/admin/page-forms";
import { SeedPanel } from "@/components/admin/seed-panel";
import { PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Page } from "@/lib/types";

export default async function PagesPage() {
  const { supabase, seeded } = await adminData();
  if (!seeded) {
    return (
      <>
        <PageTitle title="Pages" />
        <SeedPanel />
      </>
    );
  }
  const { data } = await supabase.from("pages").select("*").order("position").order("created_at");
  const pages = (data ?? []) as Page[];

  return (
    <>
      <PageTitle
        title="Pages"
        description="Every page on your site. Open one to rearrange its sections, change text and swap photos."
      />
      <Card className="mb-6 p-0 sm:p-0">
        <ul className="divide-y divide-ink-100">
          {pages.map((page, index) => (
            <li key={page.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {page.title}
                  {page.slug === "home" ? <Badge tone="sun">Home</Badge> : null}
                  {!page.published ? <Badge tone="gray">Draft</Badge> : null}
                  {page.show_in_nav ? <Badge tone="sea">In menu</Badge> : null}
                </p>
                <p className="text-sm text-ink-600">/{page.slug === "home" ? "" : page.slug}</p>
              </div>
              <div className="flex items-center gap-1">
                <form action={movePage.bind(null, page.id, "up")}>
                  <button type="submit" disabled={index === 0} aria-label={`Move ${page.title} up`} className="grid size-9 place-items-center rounded-xl text-ink-600 hover:bg-sea-50 disabled:opacity-30">
                    <ArrowUp className="size-4" />
                  </button>
                </form>
                <form action={movePage.bind(null, page.id, "down")}>
                  <button type="submit" disabled={index === pages.length - 1} aria-label={`Move ${page.title} down`} className="grid size-9 place-items-center rounded-xl text-ink-600 hover:bg-sea-50 disabled:opacity-30">
                    <ArrowDown className="size-4" />
                  </button>
                </form>
                <Link
                  href={page.slug === "home" ? "/" : `/${page.slug}`}
                  target="_blank"
                  aria-label={`View ${page.title}`}
                  className="grid size-9 place-items-center rounded-xl text-ink-600 hover:bg-sea-50"
                >
                  <ExternalLink className="size-4" />
                </Link>
                <ButtonLink href={`/admin/pages/${page.id}`} size="sm" variant="secondary">
                  <Pencil className="size-4" aria-hidden /> Edit
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-4 text-xl font-semibold">Add a page</h2>
        <NewPageForm />
      </Card>
    </>
  );
}
