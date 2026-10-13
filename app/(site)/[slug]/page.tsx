import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Sections } from "@/components/sections";
import { getPageContent, getPublishedSlugs } from "@/lib/content";

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const content = await getPageContent(slug);
  if (!content) return {};
  return {
    title: content.page.title,
    description: content.page.seo_description ?? undefined,
    alternates: { canonical: `/${slug}` },
  };
}

// Params are awaited inside <Suspense> so pages added later in the admin
// still get a prerendered shell. Unknown addresses render the not-found page
// with a noindex tag.
export default function ContentPage({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-[60vh] animate-pulse bg-sea-50" />}>
      <PageBody params={params} />
    </Suspense>
  );
}

async function PageBody({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  if (slug === "home") notFound();
  const content = await getPageContent(slug);
  if (!content) notFound();
  return <Sections sections={content.sections} />;
}
