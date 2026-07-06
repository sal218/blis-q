import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import type { OffsetPage, AdminReportDTO, ReportStatus } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  Pagination,
  Segmented,
  useConfirm,
} from "../components/ui";

// Reports moderation queue + actions (docs/API.md §14). Resolve / dismiss a
// report (PATCH /admin/reports/:id) and remove reported content (POST
// /admin/moderation/remove-content) — posts AND events. Filterable by status;
// offset-paginated. After any action the page reloads so it shows the server's
// true state (e.g. a 409 "already actioned" simply re-renders the real status).

const STATUSES: { value: "" | ReportStatus; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "pending", label: "Oczekujące" },
  { value: "reviewing", label: "W trakcie" },
  { value: "resolved", label: "Rozwiązane" },
  { value: "dismissed", label: "Odrzucone" },
];

// Polish label per reported resource type — scannable at queue speed.
const TYPE_LABELS: Record<string, string> = {
  post: "Wpis",
  event: "Wydarzenie",
  message: "Wiadomość",
  user: "Użytkownik",
  community: "Społeczność",
  safe_place: "Bezpieczne miejsce",
};

export function ReportsPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<AdminReportDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [status, setStatus] = useState<"" | ReportStatus>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Per-row in-flight set — a Set (not a single id) so concurrent actions on
  // different rows don't overwrite each other's disabled state.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

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
    setBusy(id, true);
    setActionError(null);
    try {
      await adminFetch("PATCH", `/api/admin/reports/${id}`, { status: next });
    } catch {
      setActionError(
        "Nie udało się zaktualizować zgłoszenia. Odświeżono listę.",
      );
    } finally {
      setBusy(id, false);
      await load(pageNum, status);
    }
  }

  // Remove reported content (posts + events — the backend accepts both).
  // Destructive → type-aware confirm first.
  async function removeContent(report: AdminReportDTO) {
    const isEvent = report.resourceType === "event";
    const ok = await confirm({
      title: isEvent ? "Usunąć wydarzenie?" : "Usunąć treść wpisu?",
      body: isEvent
        ? "Wydarzenie zostanie usunięte dla wszystkich użytkowników. Tej operacji nie można cofnąć."
        : "Treść wpisu zostanie usunięta dla wszystkich użytkowników. Tej operacji nie można cofnąć.",
      confirmLabel: isEvent ? "Usuń wydarzenie" : "Usuń treść",
      danger: true,
    });
    if (!ok) return;
    setBusy(report.id, true);
    setActionError(null);
    try {
      await adminFetch("POST", "/api/admin/moderation/remove-content", {
        resourceType: report.resourceType,
        resourceId: report.resourceId,
      });
    } catch {
      setActionError("Nie udało się usunąć treści. Odświeżono listę.");
    } finally {
      setBusy(report.id, false);
      await load(pageNum, status);
    }
  }

  const columns: Column<AdminReportDTO>[] = [
    {
      key: "type",
      header: "Typ",
      width: 140,
      render: (r) => (
        <Badge tone="neutral">
          {TYPE_LABELS[r.resourceType] ?? r.resourceType}
        </Badge>
      ),
    },
    {
      key: "resource",
      header: "Zasób",
      width: 120,
      render: (r) => <code className="bq-td-mono">{r.resourceId}</code>,
    },
    { key: "reason", header: "Powód", render: (r) => r.reason },
    {
      key: "status",
      header: "Status",
      width: 130,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "created",
      header: "Data",
      width: 170,
      render: (r) => (
        <span className="bq-td-num">
          {new Date(r.createdAt).toLocaleString("pl-PL")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      width: 300,
      render: (r) => {
        const open = r.status === "pending" || r.status === "reviewing";
        if (!open) {
          return (
            <span className="bq-td-muted">
              {r.resolution ? r.resolution : "—"}
            </span>
          );
        }
        const busy = busyIds.has(r.id);
        return (
          <div className="bq-row-actions">
            <Button
              size="sm"
              icon="check"
              disabled={busy}
              onClick={() => resolveReport(r.id, "resolved")}
            >
              Rozwiąż
            </Button>
            <Button
              size="sm"
              icon="x"
              disabled={busy}
              onClick={() => resolveReport(r.id, "dismissed")}
            >
              Odrzuć
            </Button>
            {(r.resourceType === "post" || r.resourceType === "event") && (
              <Button
                size="sm"
                variant="dangerOutline"
                icon="trash"
                disabled={busy}
                onClick={() => removeContent(r)}
              >
                {r.resourceType === "event" ? "Usuń wydarzenie" : "Usuń treść"}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <section>
      <PageHeader
        title="Zgłoszenia"
        description="Kolejka moderacji — zgłoszenia treści od użytkowników. Rozwiąż, odrzuć lub usuń zgłoszoną treść."
      />

      <div className="bq-toolbar">
        <Segmented
          ariaLabel="Filtr statusu zgłoszeń"
          options={STATUSES}
          value={status}
          onChange={setStatus}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {actionError && <Alert tone="error">{actionError}</Alert>}

      <DataTable
        columns={columns}
        rows={page?.data ?? []}
        keyOf={(r) => r.id}
        loading={loading}
        emptyLabel="Brak zgłoszeń"
        emptyIcon="flag"
        emptyDescription={
          status
            ? "Żadne zgłoszenia nie pasują do wybranego filtra."
            : "Kolejka moderacji jest pusta — nowe zgłoszenia pojawią się tutaj."
        }
      />
      {page && (
        <Pagination
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          disabled={loading}
          onPage={(p) => load(p, status)}
        />
      )}
    </section>
  );
}
