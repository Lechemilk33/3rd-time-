import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, LoadingPanel } from "@/components/dashboard/shell";
import { TermsGate } from "@/components/portal/terms-gate";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <DashboardShell area="portal">
      <Suspense fallback={<LoadingPanel />}>
        <TermsGate>{children}</TermsGate>
      </Suspense>
    </DashboardShell>
  );
}
