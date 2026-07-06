import type { ReportStatus } from "../lib/types";
import { Badge, type BadgeTone } from "./ui";

// Coloured pill for a report's moderation status, built on the design-system
// Badge. Pending/reviewing get a status dot so open work is scannable.

const META: Record<ReportStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Oczekuje", tone: "warning" },
  reviewing: { label: "W trakcie", tone: "info" },
  resolved: { label: "Rozwiązane", tone: "success" },
  dismissed: { label: "Odrzucone", tone: "neutral" },
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  const { label, tone } = META[status];
  const open = status === "pending" || status === "reviewing";
  return (
    <Badge tone={tone} dot={open}>
      {label}
    </Badge>
  );
}
