import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminFetch } from "../lib/api";
import type { OffsetPage, AdminUserDTO } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  Pagination,
  SearchInput,
  Segmented,
  useConfirm,
  useDebouncedValue,
} from "../components/ui";

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

// Deterministic accent per user for the avatar initial (display only).
const AVATAR_HUES = [258, 288, 220, 340, 190, 160];

function UserAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
  return (
    <span
      className="bq-avatar"
      style={{
        width: 28,
        height: 28,
        fontSize: 12,
        background: `linear-gradient(135deg, hsl(${hue} 72% 62%), hsl(${hue + 24} 68% 48%))`,
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function UserStatusBadge({ user }: { user: AdminUserDTO }) {
  if (user.deletedAt) return <Badge tone="neutral">Usunięty</Badge>;
  if (user.bannedAt)
    return (
      <Badge tone="danger" dot>
        Zablokowany
      </Badge>
    );
  return (
    <Badge tone="success" dot>
      Aktywny
    </Badge>
  );
}

export function UsersPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<AdminUserDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [search, setSearch] = useState("");
  // Trails `search` so the list filters as you type (one request per typing
  // pause), without needing to press Enter.
  const debouncedSearch = useDebouncedValue(search);
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

  // Initial load + live reload whenever the debounced search or the status
  // filter changes. Always resets to page 1 (the result set changed).
  useEffect(() => {
    load(1, debouncedSearch, status);
  }, [load, debouncedSearch, status]);

  // Enter is a no-op beyond blurring — the debounced effect already loads. We
  // still handle submit so pressing Enter doesn't reload the page.
  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    load(1, search, status);
  }

  async function ban(user: AdminUserDTO) {
    const ok = await confirm({
      title: `Zablokować użytkownika ${user.displayName}?`,
      body: "Użytkownik straci dostęp do aplikacji (poza eksportem i usunięciem konta). Możesz to później cofnąć.",
      confirmLabel: "Zablokuj",
      danger: true,
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: `Odblokować użytkownika ${user.displayName}?`,
      body: "Użytkownik odzyska pełny dostęp do aplikacji.",
      confirmLabel: "Odblokuj",
    });
    if (!ok) return;
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
    {
      key: "name",
      header: "Użytkownik",
      render: (u) => (
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UserAvatar name={u.displayName} />
          <span className="bq-td-strong">{u.displayName}</span>
        </span>
      ),
    },
    {
      key: "email",
      header: "E-mail",
      render: (u) => <code className="bq-td-mono">{u.email}</code>,
    },
    {
      key: "role",
      header: "Rola",
      width: 120,
      render: (u) =>
        u.isAdmin ? (
          <Badge tone="brand">Admin</Badge>
        ) : (
          <span className="bq-td-muted">Użytkownik</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      render: (u) => <UserStatusBadge user={u} />,
    },
    {
      key: "created",
      header: "Dołączył",
      width: 170,
      render: (u) => (
        <span className="bq-td-num">
          {new Date(u.createdAt).toLocaleString("pl-PL")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      width: 130,
      render: (u) => {
        if (u.deletedAt) return <span className="bq-td-muted">—</span>;
        const busy = busyIds.has(u.id);
        if (u.bannedAt) {
          return (
            <Button size="sm" disabled={busy} onClick={() => unban(u)}>
              Odblokuj
            </Button>
          );
        }
        // Ban is hidden for admins (covers self) — avoids an admin lockout /
        // privilege foot-gun; admin promotion/demotion is a separate slice (P-16).
        if (u.isAdmin) return <span className="bq-td-muted">—</span>;
        return (
          <Button
            size="sm"
            variant="dangerOutline"
            disabled={busy}
            onClick={() => ban(u)}
          >
            Zablokuj
          </Button>
        );
      },
    },
  ];

  return (
    <section>
      <PageHeader
        title="Użytkownicy"
        description="Katalog kont — wyszukuj po nazwie lub adresie e-mail, blokuj i odblokowuj użytkowników."
      />

      <div className="bq-toolbar">
        <form className="bq-toolbar-group" onSubmit={onSearchSubmit}>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po nazwie lub e-mailu"
            style={{ minWidth: 280 }}
            aria-label="Szukaj użytkowników"
          />
          <Button type="submit">Szukaj</Button>
        </form>
        <Segmented
          ariaLabel="Filtr statusu konta"
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
        keyOf={(u) => u.id}
        loading={loading}
        emptyLabel="Brak użytkowników"
        emptyIcon="user"
        emptyDescription="Żadne konta nie pasują do wyszukiwania lub filtra."
      />
      {page && (
        <Pagination
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          disabled={loading}
          onPage={(p) => load(p, search, status)}
        />
      )}
    </section>
  );
}
