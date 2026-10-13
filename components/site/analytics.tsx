"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

/** Cookie-free visit counts (Vercel Web Analytics). The admin and client portal aren't counted. */
export function Analytics() {
  return (
    <VercelAnalytics
      beforeSend={(event) => (/^\/(admin|portal|api|auth)(\/|$)/.test(new URL(event.url).pathname) ? null : event)}
    />
  );
}
