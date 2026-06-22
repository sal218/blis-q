import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { adminFetch } from "../lib/api";
import type { OffsetPage, AdminUserDTO } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";

// Admin users directory + ban/unban (docs/API.md §14, backend #23). List with
// email/displayName search + status filter; ban/unban via the moderation
// endpoints. All calls go through adminFetch (server gates with isAuthenticated
// + requireAdmin); the dashboard is a view layer. Set-isAdmin / admin promotion
// is intentionally NOT here (P-16). After any action the page reloads so it
// shows the server's true state.

type StatusFilter = "" | "active" | "banned";

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "", label: "Wszyscy" },
  { value: "active", label: "Aktywni" },
  { value: "banned", label: "Zablokowani" },
];

// Local user-status badge — the shared StatusBadge is report-only (ReportStatus).
function UserStatusBadge({ user }: { user: AdminUserDTO }) {
  const { label, style } = user.deletedAt
    ? { label: "Usunięty", style: styles.badgeDeleted }
    : user.bannedAt
      ? { label: "Zablokowany", style: styles.badgeBanned }
      : { label: "Aktywny", style: styles.badgeActive };
  return <span style={{ ...styles.badge, ...style }}>{label}</span>;
}

export function UsersPage() {
  const [page, setPage] = useState<OffsetPage<AdminUserDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const load = useCallback(
    async (
      targetPage: number,
      searchTerm: string,
      statusFilter: StatusFilter,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (searchTerm.trim()) query.set("search", searchTerm.trim());
        if (statusFilter === "active" || statusFilter === "banned") {
          query.set("status", statusFilter);
        }
        const data = await adminFetch<OffsetPage<AdminUserDTO>>(
          "GET",
          `/api/admin/users?${query.toString()}`,
        );
        setPage(data);
        setPageNum(data.page);
      } catch {
        setError("Nie udało się załadować użytkowników.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Initial load + reload whenever the status filter changes.
  useEffect(() => {
    load(1, search, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, status]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    load(1, search, status);
  }

  async function ban(user: AdminUserDTO) {
    if (
      !window.confirm(
        `Zablokować użytkownika ${user.displayName}? Straci dostęp do aplikacji (poza eksportem/usunięciem konta).`,
      )
    ) {
      return;
    }
    setBusy(user.id, true);
    setActionError(null);
    try {
      await adminFetch("POST", "/api/admin/moderation/ban", {
        userId: user.id,
      });
    } catch {
      setActionError("Nie udało się zablokować użytkownika. Odświeżono listę.");
    } finally {
      setBusy(user.id, false);
      await load(pageNum, search, status);
    }
  }

  async function unban(user: AdminUserDTO) {
    if (!window.confirm(`Odblokować użytkownika ${user.displayName}?`)) {
      return;
    }
    setBusy(user.id, true);
    setActionError(null);
    try {
      await adminFetch("POST", "/api/admin/moderation/unban", {
        userId: user.id,
      });
    } catch {
      setActionError("Nie udało się odblokować użytkownika. Odświeżono listę.");
    } finally {
      setBusy(user.id, false);
      await load(pageNum, search, status);
    }
  }

  const columns: Column<AdminUserDTO>[] = [
    { key: "name", header: "Nazwa", render: (u) => u.displayName },
    {
      key: "email",
      header: "E-mail",
      render: (u) => <code style={styles.code}>{u.email}</code>,
    },
    {
      key: "role",
      header: "Rola",
      render: (u) =>
        u.isAdmin ? (
          <span style={{ ...styles.badge, ...styles.badgeAdmin }}>Admin</span>
        ) : (
          <span style={styles.muted}>Użytkownik</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) => <UserStatusBadge user={u} />,
    },
    {
      key: "created",
      header: "Dołączył",
      render: (u) => new Date(u.createdAt).toLocaleString("pl-PL"),
    },
    {
      key: "actions",
      header: "Akcje",
      render: (u) => {
        if (u.deletedAt) return <span style={styles.muted}>—</span>;
        const busy = busyIds.has(u.id);
        if (u.bannedAt) {
          return (
            <button
              style={styles.smallButton}
              disabled={busy}
              onClick={() => unban(u)}
            >
              Odblokuj
            </button>
          );
        }
        // Ban is hidden for admins (covers self) — avoids an admin lockout /
        // privilege foot-gun; admin promotion/demotion is a separate slice (P-16).
        if (u.isAdmin) return <span style={styles.muted}>—</span>;
        return (
          <button
            style={styles.dangerButton}
            disabled={busy}
            onClick={() => ban(u)}
          >
            Zablokuj
          </button>
        );
      },
    },
  ];

  return (
    <section>
      <h1 style={styles.h1}>Użytkownicy</h1>

      <div style={styles.controls}>
        <form onSubmit={onSearchSubmit} style={styles.searchForm}>
          <input
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po nazwie lub e-mailu"
          />
          <button type="submit" style={styles.ghostButton}>
            Szukaj
          </button>
        </form>
        <div style={styles.filterRow}>
          <label style={styles.muted}>Status:</label>
          <select
            style={styles.select}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
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
            keyOf={(u) => u.id}
            emptyLabel="Brak użytkowników."
          />
          {page && page.totalPages > 1 && (
            <div style={styles.pager}>
              <button
                style={styles.ghostButton}
                disabled={pageNum <= 1}
                onClick={() => load(pageNum - 1, search, status)}
              >
                Poprzednia
              </button>
              <span style={styles.muted}>
                {page.page} / {page.totalPages}
              </span>
              <button
                style={styles.ghostButton}
                disabled={pageNum >= page.totalPages}
                onClick={() => load(pageNum + 1, search, status)}
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
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  searchForm: { display: "flex", gap: 8 },
  filterRow: { display: "flex", alignItems: "center", gap: 8 },
  input: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    minWidth: 240,
    fontFamily: "inherit",
  },
  select: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    fontFamily: "inherit",
  },
  code: { fontSize: 12, color: "#6B7280" },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
  },
  badgeActive: { background: "#DCFCE7", color: "#166534" },
  badgeBanned: { background: "#FEE2E2", color: "#991B1B" },
  badgeDeleted: { background: "#F3F4F6", color: "#6B7280" },
  badgeAdmin: { background: "#EDE9FE", color: "#5B21B6" },
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
