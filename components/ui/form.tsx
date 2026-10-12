import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-xl border-2 border-ink-100 bg-white px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-400 transition focus:border-ocean focus:outline-none focus:ring-4 focus:ring-sea-100 disabled:bg-ink-100/40";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-bold text-ink", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(control, "leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("size-5 shrink-0 rounded-md border-ink-200 accent-ocean", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  help,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-coral">*</span> : null}
        </Label>
      ) : null}
      {children}
      {help ? <p className="mt-1.5 text-sm text-ink-600">{help}</p> : null}
    </div>
  );
}
