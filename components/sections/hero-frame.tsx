import type { ReactNode } from "react";
import { PawMark } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** The rounded photo frame on the home page, with its sunny shadow and the little card on the corner. */
export function HeroFrame({ badge, children }: { badge: ReactNode; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -right-2 -bottom-2 h-full w-full rounded-[2.5rem] bg-sun sm:-right-4 sm:-bottom-4" aria-hidden />
      {/* isolate + translateZ keep Safari clipping the photos to the rounded corners while they fade. */}
      <div className="relative isolate aspect-[4/3] overflow-hidden rounded-[2.5rem] border-4 border-white bg-sea-100 shadow-xl [transform:translateZ(0)]">
        {children}
      </div>
      <div className="animate-float absolute -bottom-5 -left-3 sm:-left-6">{badge}</div>
    </div>
  );
}

export function HeroBadge({ title, subtitle, pop = false }: { title: string; subtitle: string; pop?: boolean }) {
  return (
    <div
      className={cn(
        "flex max-w-[16rem] items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg",
        pop && "motion-safe:animate-[pop_350ms_ease-out]",
      )}
      aria-live="off"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sea-100">
        <PawMark className="size-5 text-ocean" />
      </span>
      <span className="min-w-0 text-sm leading-tight font-bold text-ink">
        <span className="block truncate">{title}</span>
        <span className="block font-semibold text-ink-600">{subtitle}</span>
      </span>
    </div>
  );
}
