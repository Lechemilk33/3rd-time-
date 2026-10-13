import { mapEmbedUrl, spotText } from "@/lib/maps";
import { cn } from "@/lib/utils";

/** A small Google map of a spot. Nothing without a Maps key. */
export function MapPreview({ name, address, className }: { name?: string | null; address?: string | null; className?: string }) {
  const src = mapEmbedUrl(name, address);
  if (!src) return null;
  return (
    <iframe
      title={`Map of ${spotText(name, address)}`}
      src={src}
      loading="lazy"
      // Sends the page address so a key restricted to the site's addresses works.
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
      className={cn("block h-40 w-full rounded-2xl border border-ink-100 bg-sea-50", className)}
    />
  );
}
