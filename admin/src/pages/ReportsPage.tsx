import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { adminFetch } from "../lib/api";
import type { OffsetPage, ReportDTO, ReportStatus } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";

// Reports moderation queue — READ ONLY this slice (docs/API.md §14). Resolve /
// dismiss actions land in Sprint 4. Filterable by status; offset-paginated.

const STATUSES: { value: "" | ReportStatus; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "pending", label: "Oczekujące" },
  { value: "reviewing", label: "W trakcie" },
  { value: "resolved", label: "Rozwiązane" },
  { value: "dismissed", label: "Odrzucone" },
];

export function ReportsPage() {
  const [page, setPage] = useState<OffsetPage<ReportDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [status, setStatus] = useState<"" | ReportStatus>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, statusFilter: "" | ReportStatus) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (statusFilter) query.set("status", statusFilter);
        const data = await adminFetch<OffsetPage<ReportDTO>>(
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

  const columns: Column<ReportDTO>[] = [
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
