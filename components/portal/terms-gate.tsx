import type { ReactNode } from "react";
import { AcceptTerms } from "@/components/portal/accept-terms";
import { getCurrentUser } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/legal";

/** Clients who haven't agreed to the current terms are asked once before using the portal. */
export async function TermsGate({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin || user.profile.terms_version === TERMS_VERSION) return children;
  return <AcceptTerms updated={Boolean(user.profile.terms_version)} />;
}
