import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/shell";

export const metadata: Metadata = { title: "Client portal", robots: { index: false } };

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return <DashboardShell area="portal">{children}</DashboardShell>;
}
