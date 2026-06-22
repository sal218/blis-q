import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { adminFetch } from "../lib/api";
import type { OffsetPage, AdminReportDTO, ReportStatus } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";

// Reports moderation queue + actions (docs/API.md §14). Resolve / dismiss a
// report (PATCH /admin/reports/:id) and remove a reported post's content (POST
// /admin/moderation/remove-content, post-only). Filterable by status; offset-
// paginated. After any action the page reloads so it shows the server's true
// state (e.g. a 409 "already actioned" simply re-renders the real status).

const STATUSES: { value: "" | ReportStatus; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "pending", label: "Oczekujące" },
  { value: "reviewing", label: "W trakcie" },
  { value: "resolved", label: "Rozwiązane" },
  { value: "dismissed", label: "Odrzucone" },
];

export function ReportsPage() {
  const [page, setPage] = useState<OffsetPage<AdminReportDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [status, setStatus] = useState<"" | ReportStatus>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, statusFilter: "" | ReportStatus) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (statusFilter) query.set("status", statusFilter);
        const data = await adminFetch<OffsetPage<AdminReportDTO>>(
          "GET",
          `/api/admin/reports?${query.toString()}`,
        );
        setPage(data);
        setPageNum(data.page);
      } catch {
        setError("Nie udało się załadować zgłoszeń.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(1, status);
  }, [load, status]);

  // Resolve/dismiss a report. On failure show a banner; always reload so the row
  // reflects the server's actual state afterwards.
  async function resolveReport(id: string, next: "resolved" | "dismissed") {
    setBusyId(id);
    setActionError(null);
    try {
      await adminFetch("PATCH", `/api/admin/reports/${id}`, { status: next });
    } catch {
      setActionError(
        "Nie udało się zaktualizować zgłoszenia. Odświeżono listę.",
      );
    } finally {
      setBusyId(null);
      await load(pageNum, status);
    }
  }

  // Remove a reported post's content (post-only). Destructive → confirm first.
  async function removeContent(report: AdminReportDTO) {
    if (
      !window.confirm("Usunąć treść tego wpisu? Tej operacji nie można cofnąć.")
    ) {
      return;
    }
    setBusyId(report.id);
    setActionError(null);
    try {
      await adminFetch("POST", "/api/admin/moderation/remove-content", {
        resourceType: "post",
        resourceId: report.resourceId,
      });
    } catch {
      setActionError("Nie udało się usunąć treści. Odświeżono listę.");
    } finally {
      setBusyId(null);
      await load(pageNum, status);
    }
  }

  const columns: Column<AdminReportDTO>[] = [
    { key: "type", header: "Typ", render: (r) => r.resourceType },
    {
      key: "resource",
      header: "Zasób",
      render: (r) => <code style={styles.code}>{r.resourceId}</code>,
    },
    { key: "reason", header: "Powód", render: (r) => r.reason },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "created",
      header: "Data",
      render: (r) => new Date(r.createdAt).toLocaleString("pl-PL"),
    },
    {
      key: "actions",
      header: "Akcje",
      render: (r) => {
        const open = r.status === "pending" || r.status === "reviewing";
        if (!open) {
          return (
            <span style={styles.muted}>
              {r.resolution ? r.resolution : "—"}
            </span>
          );
        }
        const busy = busyId === r.id;
        return (
          <div style={styles.actions}>
            <button
              style={styles.smallButton}
              disabled={busy}
              onClick={() => resolveReport(r.id, "resolved")}
            >
              Rozwiąż
            </button>
            <button
              style={styles.smallButton}
              disabled={busy}
              onClick={() => resolveReport(r.id, "dismissed")}
            >
              Odrzuć
            </button>
            {r.resourceType === "post" && (
              <button
                style={styles.dangerButton}
                disabled={busy}
                onClick={() => removeContent(r)}
              >
                Usuń treść
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <section>
      <h1 style={styles.h1}>Zgłoszenia</h1>

      <div style={styles.filterRow}>
        <label style={styles.muted}>Status:</label>
        <select
          style={styles.select}
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | ReportStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {actionError && <p style={styles.error}>{actionError}</p>}
      {loading ? (
        <p style={styles.muted}>Ładowanie…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.data ?? []}
            keyOf={(r) => r.id}
            emptyLabel="Brak zgłoszeń."
          />
          {page && page.totalPages > 1 && (
            <div style={styles.pager}>
              <button
                style={styles.ghostButton}
                disabled={pageNum <= 1}
                onClick={() => load(pageNum - 1, status)}
              >
                Poprzednia
              </button>
              <span style={styles.muted}>
                {page.page} / {page.totalPages}
              </span>
              <button
                style={styles.ghostButton}
                disabled={pageNum >= page.totalPages}
                onClick={() => load(pageNum + 1, status)}
              >
                Następna
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  h1: { fontSize: 24, marginBottom: 16 },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  select: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    fontFamily: "inherit",
  },
  code: { fontSize: 12, color: "#6B7280" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  smallButton: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#111827",
    cursor: "pointer",
    fontSize: 13,
  },
  dangerButton: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #DC2626",
    background: "#FFFFFF",
    color: "#DC2626",
    cursor: "pointer",
    fontSize: 13,
  },
  pager: { display: "flex", gap: 12, alignItems: "center", marginTop: 16 },
  ghostButton: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#111827",
    cursor: "pointer",
  },
  muted: { color: "#6B7280", fontSize: 14 },
  error: { color: "#DC2626", fontSize: 14, margin: 0 },
};
