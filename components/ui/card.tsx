import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-3xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6", className)}
      {...props}
    />
  );
}
