import { Badge } from "@/components/ui/badge";

const META: Record<string, { tone: "green" | "red" | "gray" | "sun"; label: string }> = {
  paid: { tone: "green", label: "Paid" },
  refunded: { tone: "gray", label: "Refunded" },
  "partially refunded": { tone: "green", label: "Part refunded" },
  failed: { tone: "red", label: "Failed" },
  unpaid: { tone: "sun", label: "Processing" },
};

/** A payment's status in plain words. */
export function PaymentBadge({ status }: { status: string }) {
  const m = META[status] ?? { tone: "gray" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
