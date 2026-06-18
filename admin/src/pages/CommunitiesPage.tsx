import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { adminFetch } from "../lib/api";
import type { CommunityDTO, OffsetPage } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";

// Admin communities CRUD (docs/API.md §14). Read-list with search + a single
// create/edit form + soft delete. All calls go through adminFetch (server gates
// with isAuthenticated + requireAdmin); the dashboard is a view layer.

export function CommunitiesPage() {
  const [page, setPage] = useState<OffsetPage<CommunityDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(targetPage) });
      if (searchTerm.trim()) query.set("search", searchTerm.trim());
      const data = await adminFetch<OffsetPage<CommunityDTO>>(
        "GET",
        `/api/admin/communities?${query.toString()}`,
      );
      setPage(data);
      setPageNum(data.page);
    } catch {
      setError("Nie udało się załadować społeczności.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1, "");
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setFormError(null);
  }

  function startEdit(community: CommunityDTO) {
    setEditingId(community.id);
    setName(community.name);
    setDescription(community.description ?? "");
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Podaj nazwę społeczności.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body = { name, description: description.trim() ? description : "" };
      if (editingId) {
        await adminFetch("PATCH", `/api/admin/communities/${editingId}`, body);
      } else {
        await adminFetch("POST", "/api/admin/communities", {
          name,
          ...(description.trim() ? { description } : {}),
        });
      }
      resetForm();
      await load(editingId ? pageNum : 1, search);
    } catch {
      setFormError("Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(community: CommunityDTO) {
    if (!window.confirm(`Usunąć społeczność „${community.name}”?`)) return;
    try {
      await adminFetch("DELETE", `/api/admin/communities/${community.id}`);
      if (editingId === community.id) resetForm();
      await load(pageNum, search);
    } catch {
      setError("Nie udało się usunąć społeczności.");
    }
  }

  const columns: Column<CommunityDTO>[] = [
    { key: "name", header: "Nazwa", render: (c) => c.name },
    {
      key: "members",
      header: "Członkowie",
      render: (c) => String(c.memberCount),
    },
    {
      key: "created",
      header: "Utworzono",
      render: (c) => new Date(c.createdAt).toLocaleDateString("pl-PL"),
    },
    {
      key: "actions",
      header: "",
      render: (c) => (
        <span style={styles.actions}>
          <button style={styles.linkButton} onClick={() => startEdit(c)}>
            Edytuj
          </button>
          <button
            style={{ ...styles.linkButton, color: "#DC2626" }}
            onClick={() => onDelete(c)}
          >
            Usuń
          </button>
        </span>
      ),
    },
  ];

  return (
    <section>
      <h1 style={styles.h1}>Społeczności</h1>

      <form style={styles.card} onSubmit={onSubmit}>
        <h2 style={styles.h2}>
          {editingId ? "Edytuj społeczność" : "Nowa społeczność"}
        </h2>
        <input
          style={styles.input}
          placeholder="Nazwa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          style={{ ...styles.input, height: 72, resize: "vertical" }}
          placeholder="Opis (opcjonalnie)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {formError && <p style={styles.error}>{formError}</p>}
        <div style={styles.formActions}>
          <button type="submit" style={styles.primaryButton} disabled={busy}>
            {busy ? "Zapisywanie…" : editingId ? "Zapisz" : "Załóż"}
          </button>
          {editingId && (
            <button
              type="button"
              style={styles.ghostButton}
              onClick={resetForm}
            >
              Anuluj
            </button>
          )}
        </div>
      </form>

      <form
        style={styles.searchRow}
        onSubmit={(e) => {
          e.preventDefault();
          load(1, search);
        }}
      >
        <input
          style={styles.input}
          placeholder="Szukaj społeczności"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" style={styles.ghostButton}>
          Szukaj
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}
      {loading ? (
        <p style={styles.muted}>Ładowanie…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.data ?? []}
            keyOf={(c) => c.id}
            emptyLabel="Brak społeczności."
          />
          {page && page.totalPages > 1 && (
            <div style={styles.pager}>
              <button
                style={styles.ghostButton}
                disabled={pageNum <= 1}
                onClick={() => load(pageNum - 1, search)}
              >
                Poprzednia
              </button>
              <span style={styles.muted}>
                {page.page} / {page.totalPages}
              </span>
              <button
                style={styles.ghostButton}
                disabled={pageNum >= page.totalPages}
                onClick={() => load(pageNum + 1, search)}
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

const INDIGO = "#4F46E5";

const styles: Record<string, CSSProperties> = {
  h1: { fontSize: 24, marginBottom: 16 },
  h2: { fontSize: 16, margin: "0 0 4px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#FFFFFF",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    marginBottom: 20,
    maxWidth: 520,
  },
  searchRow: { display: "flex", gap: 8, marginBottom: 16, maxWidth: 520 },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    fontFamily: "inherit",
    flex: 1,
  },
  formActions: { display: "flex", gap: 8 },
  primaryButton: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: INDIGO,
    color: "#FFFFFF",
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostButton: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#111827",
    cursor: "pointer",
  },
  linkButton: {
    background: "transparent",
    border: "none",
    color: INDIGO,
    cursor: "pointer",
    fontSize: 14,
    padding: 0,
  },
  actions: { display: "flex", gap: 12 },
  pager: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginTop: 16,
  },
  muted: { color: "#6B7280", fontSize: 14 },
  error: { color: "#DC2626", fontSize: 14, margin: 0 },
};
