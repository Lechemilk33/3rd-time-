import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "sea" | "sun" | "green" | "gray" | "coral" | "red";

const tones: Record<Tone, string> = {
  sea: "bg-sea-100 text-ocean-700",
  sun: "bg-sun-100 text-ink",
  green: "bg-emerald-100 text-emerald-800",
  gray: "bg-ink-100 text-ink-600",
  coral: "bg-coral-100 text-ink",
  red: "bg-red-100 text-red-800",
};

export function Badge({ tone = "sea", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
