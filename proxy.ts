import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only auth-aware routes run through the proxy so the public site stays static.
  matcher: ["/portal/:path*", "/admin/:path*", "/login", "/signup", "/auth/:path*"],
};
