"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (options: {
        url: string;
        parentElement: HTMLElement;
        prefill?: { name?: string; email?: string };
      }) => void;
    };
  }
}

const SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";

function loadCalendly(): Promise<void> {
  if (window.Calendly) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Calendly failed to load")), { once: true });
  });
}

function themedUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("hide_gdpr_banner", "1");
    const styles = getComputedStyle(document.documentElement);
    const ocean = styles.getPropertyValue("--brand-ocean").trim().replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(ocean)) u.searchParams.set("primary_color", ocean);
    return u.toString();
  } catch {
    return url;
  }
}

export function CalendlyEmbed({
  url,
  name,
  email,
  onScheduled,
}: {
  url: string;
  name?: string;
  email?: string;
  onScheduled?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scheduled, setScheduled] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    loadCalendly()
      .then(() => {
        if (cancelled || !window.Calendly) return;
        el.innerHTML = "";
        window.Calendly.initInlineWidget({
          url: themedUrl(url),
          parentElement: el,
          prefill: { name: name || undefined, email: email || undefined },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      el.innerHTML = "";
    };
  }, [url, name, email]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== "https://calendly.com") return;
      if (e.data?.event === "calendly.event_scheduled") {
        setScheduled(true);
        onScheduled?.();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onScheduled]);

  return (
    <div className="space-y-4">
      {scheduled ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-bold text-emerald-900">
          <CircleCheck className="size-5" aria-hidden /> You’re booked! Check your email for the details.
        </p>
      ) : null}
      {failed ? (
        <p className="rounded-2xl bg-sun-100 px-4 py-3 text-ink">
          The scheduler didn’t load.{" "}
          <a href={url} target="_blank" rel="noreferrer" className="font-bold text-ocean underline">
            Open it in a new tab
          </a>
          .
        </p>
      ) : null}
      <div
        ref={ref}
        className="min-h-[700px] overflow-hidden rounded-3xl border border-ink-100 bg-white"
        aria-label="Booking calendar"
      />
    </div>
  );
}
