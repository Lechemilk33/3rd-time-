"use client";

import { useEffect } from "react";
import { SOURCE_KEY, detectSource } from "@/lib/source";

/**
 * Remembers how a visitor first found the site (a flyer's QR code, Google, Instagram…) so sign-up
 * can save it on their profile. Kept only in this browser; nothing is sent until they sign up.
 */
export function SourceTracker() {
  useEffect(() => {
    try {
      if (localStorage.getItem(SOURCE_KEY)) return;
      const source = detectSource(location.search, document.referrer, location.hostname);
      if (source) localStorage.setItem(SOURCE_KEY, source);
    } catch {
      // Storage blocked (private mode): nothing to remember.
    }
  }, []);
  return null;
}
