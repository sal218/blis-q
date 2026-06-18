import type { CSSProperties } from "react";
import type { ReportStatus } from "../lib/types";

// Coloured pill for a report's moderation status. Read-only this slice — the
// resolve/dismiss actions that would change it land in Sprint 4.

const LABELS: Record<ReportStatus, string> = {
  pending: "Oczekuje",
  reviewing: "W trakcie",
  resolved: "Rozwiązane",
  dismissed: "Odrzucone",
};

const COLORS: Record<ReportStatus, { bg: string; fg: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E" },
  reviewing: { bg: "#DBEAFE", fg: "#1E40AF" },
  resolved: { bg: "#D1FAE5", fg: "#065F46" },
  dismissed: { bg: "#F3F4F6", fg: "#374151" },
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  const color = COLORS[status];
  return (
    <span style={{ ...styles.badge, background: color.bg, color: color.fg }}>
      {LABELS[status]}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  badge: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
  },
};
