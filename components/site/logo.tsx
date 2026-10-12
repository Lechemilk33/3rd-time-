import Link from "next/link";
import { PawMark } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/utils";

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
      {logoUrl ? (
        <Photo src={logoUrl} alt="" className="size-11 rounded-full" loading="eager" />
      ) : (
        <span className="grid size-11 place-items-center rounded-full bg-sea shadow-[inset_0_-3px_0_rgba(0,0,0,0.08)] transition group-hover:rotate-[-8deg]">
          <PawMark className="size-6 text-ink" />
        </span>
      )}
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
