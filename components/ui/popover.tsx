"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Click-to-open popover that closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  align = "start",
  className,
  open: controlledOpen,
  onOpenChange,
  sheetOnMobile,
  defaultOpen = false,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** On phones, show as a sheet pinned to the bottom of the screen instead of hanging off the trigger. */
  sheetOnMobile?: boolean;
  defaultOpen?: boolean;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolled;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setUncontrolled(v));
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setUncontrolled(v));
  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open ? (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 rounded-2xl border border-ink-100 bg-white p-3 shadow-[0_20px_50px_-12px_rgba(15,43,63,0.35)] motion-safe:animate-[pop_120ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
            className,
            sheetOnMobile && "max-sm:fixed max-sm:inset-x-4 max-sm:top-auto max-sm:bottom-4 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none",
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
