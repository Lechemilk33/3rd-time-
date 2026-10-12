import { notFound } from "next/navigation";
import { Sections } from "@/components/sections";
import { getPageContent } from "@/lib/content";

export default async function HomePage() {
  const content = await getPageContent("home");
  if (!content) notFound();
  return <Sections sections={content.sections} />;
}
