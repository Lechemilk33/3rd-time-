/* eslint-disable @next/next/no-img-element -- photos are resized before upload and served from Supabase Storage */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Photo({ className, alt = "", ...props }: ComponentProps<"img">) {
  return <img alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} {...props} />;
}
