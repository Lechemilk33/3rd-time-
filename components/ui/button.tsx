import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition duration-150 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-sun text-ink shadow-[0_3px_0_0_var(--color-sun-600)] hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_var(--color-sun-600)] active:translate-y-0 active:shadow-none",
  secondary: "bg-ocean text-white hover:bg-ocean-700",
  outline: "border-2 border-ink-200 bg-white text-ink hover:border-ocean hover:text-ocean",
  ghost: "text-ocean hover:bg-sea-50",
  danger: "border-2 border-red-200 bg-white text-red-700 hover:bg-red-50",
  light: "bg-white text-ink hover:bg-sea-50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
