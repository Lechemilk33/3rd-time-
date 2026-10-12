import Link from "next/link";
import { getSiteSettings } from "@/lib/content";
import { safeHref } from "@/lib/utils";

export async function AnnouncementBar() {
  const { announcement } = await getSiteSettings();
  if (!announcement.enabled || !announcement.text) return null;

  const content = <span className="font-bold">{announcement.text}</span>;
  return (
    <div className="bg-ink px-4 py-2 text-center text-sm text-white">
      {announcement.href ? (
        <Link href={safeHref(announcement.href, "/")} className="underline-offset-4 hover:underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}
