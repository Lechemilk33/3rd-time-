"use client";

import { CircleCheck, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Welcome for clients arriving from their confirmation email (?confirmed=1, see app/auth/callback). */
export function EmailConfirmed() {
  const params = useSearchParams();
  const [show, setShow] = useState(() => params.has("confirmed"));

  useEffect(() => {
    if (!params.has("confirmed")) return;
    // Out of the address bar, so a refresh doesn't say it again.
    const url = new URL(window.location.href);
    url.searchParams.delete("confirmed");
    window.history.replaceState(null, "", url);
  }, [params]);

  if (!show) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 motion-safe:animate-[pop_200ms_ease-out]"
    >
      <CircleCheck className="size-5 shrink-0" aria-hidden />
      <p className="flex-1 font-bold">Your email is confirmed. Welcome to the pack! 🐾</p>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-emerald-100"
        aria-label="Dismiss"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
