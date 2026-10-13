"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// While any save bar has unsaved changes, ask before leaving the page — by reload/close (beforeunload)
// or by an in-app link (caught before Next's <Link> handles the click).
let dirtyBars = 0;

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "";
}

function onLinkClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;
  if (!window.confirm("You have unsaved changes. Leave without saving?")) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    if (dirtyBars++ === 0) {
      window.addEventListener("beforeunload", onBeforeUnload);
      document.addEventListener("click", onLinkClick, true);
    }
    return () => {
      if (--dirtyBars === 0) {
        window.removeEventListener("beforeunload", onBeforeUnload);
        document.removeEventListener("click", onLinkClick, true);
      }
    };
  }, [dirty]);
}

export function SaveBar({
  dirty,
  pending,
  onSave,
  onReset,
  message,
  error,
  label = "Save changes",
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onReset?: () => void;
  message?: string | null;
  error?: string | null;
  label?: string;
}) {
  useLeaveGuard(dirty);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onSave} disabled={!dirty || pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : label}
      </Button>
      {onReset && dirty && !pending ? (
        <Button variant="ghost" onClick={onReset}>
          Discard changes
        </Button>
      ) : null}
      {error ? <span className="text-sm font-bold text-red-700">{error}</span> : null}
      {!error && message && !dirty ? (
        <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
          <CircleCheck className="size-4" aria-hidden /> {message}
        </span>
      ) : null}
      {dirty && !pending ? <span className="text-sm font-bold text-coral">Unsaved changes</span> : null}
    </div>
  );
}
