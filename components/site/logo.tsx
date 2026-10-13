import Link from "next/link";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/utils";

/** The Waiting for Paws logo, used until a different one is uploaded in Site settings. */
export const DEFAULT_LOGO = "/brand/logo.webp";

export function Logo({
  name,
  logoUrl,
  href = "/",
  inverted = false,
}: {
  name: string;
  logoUrl?: string;
  href?: string;
  inverted?: boolean;
}) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label={`${name} home`}>
      <Photo
        src={logoUrl || DEFAULT_LOGO}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-full transition group-hover:rotate-[-6deg]"
        loading="eager"
      />
      <span
        className={cn(
          "font-display text-xl leading-none font-semibold tracking-tight",
          inverted ? "text-white" : "text-ink",
        )}
      >
        {name}
      </span>
    </Link>
  );
}
