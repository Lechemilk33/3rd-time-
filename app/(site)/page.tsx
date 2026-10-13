import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sections } from "@/components/sections";
import { BusinessSchema } from "@/components/site/business-schema";
import { getPageContent } from "@/lib/content";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const content = await getPageContent("home");
  if (!content) notFound();
  return (
    <>
      <BusinessSchema />
      <Sections sections={content.sections} />
    </>
  );
}
