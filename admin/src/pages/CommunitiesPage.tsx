import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminFetch } from "../lib/api";
import type { CommunityDTO, OffsetPage } from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import {
  Alert,
  Button,
  Drawer,
  Field,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Textarea,
  useConfirm,
} from "../components/ui";

// Admin communities CRUD (docs/API.md §14). Read-list with search + a single
// create/edit form (in a slide-over drawer) + soft delete. All calls go through
// adminFetch (server gates with isAuthenticated + requireAdmin); the dashboard
// is a view layer.

export function CommunitiesPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<CommunityDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form drawer state. formOpen + editingId: null = create, id = edit.
  const [formOpen, setFormOpen] = useState(false);
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

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setFormError(null);
  }

  function startCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setFormError(null);
    setFormOpen(true);
  }

  function startEdit(community: CommunityDTO) {
    setEditingId(community.id);
    setName(community.name);
    setDescription(community.description ?? "");
    setFormError(null);
    setFormOpen(true);
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
      const wasEditing = Boolean(editingId);
      closeForm();
      await load(wasEditing ? pageNum : 1, search);
    } catch {
      setFormError("Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(community: CommunityDTO) {
    const ok = await confirm({
      title: `Usunąć społeczność „${community.name}”?`,
      body: "Społeczność zniknie z aplikacji dla wszystkich użytkowników.",
      confirmLabel: "Usuń",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch("DELETE", `/api/admin/communities/${community.id}`);
      if (editingId === community.id) closeForm();
      await load(pageNum, search);
    } catch {
      setError("Nie udało się usunąć społeczności.");
    }
  }

  const columns: Column<CommunityDTO>[] = [
    {
      key: "name",
      header: "Nazwa",
      render: (c) => (
        <span>
          <span className="bq-td-strong">{c.name}</span>
          {c.description ? (
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                color: "var(--gray-500)",
                maxWidth: 420,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {c.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "members",
      header: "Członkowie",
      width: 120,
      render: (c) => <span className="bq-td-num">{c.memberCount}</span>,
    },
    {
      key: "created",
      header: "Utworzono",
      width: 130,
      render: (c) => (
        <span className="bq-td-num">
          {new Date(c.createdAt).toLocaleDateString("pl-PL")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 170,
      align: "right",
      render: (c) => (
        <span className="bq-row-actions" style={{ justifyContent: "flex-end" }}>
          <Button size="sm" icon="pencil" onClick={() => startEdit(c)}>
            Edytuj
          </Button>
          <Button
            size="sm"
            variant="dangerOutline"
            icon="trash"
            onClick={() => onDelete(c)}
          >
            Usuń
          </Button>
        </span>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        title="Społeczności"
        description="Grupy społeczności widoczne w aplikacji — twórz, edytuj i usuwaj."
        actions={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Nowa społeczność
          </Button>
        }
      />

      <div className="bq-toolbar">
        <form
          className="bq-toolbar-group"
          onSubmit={(e) => {
            e.preventDefault();
            load(1, search);
          }}
        >
          <SearchInput
            placeholder="Szukaj społeczności"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 280 }}
            aria-label="Szukaj społeczności"
          />
          <Button type="submit">Szukaj</Button>
        </form>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <DataTable
        columns={columns}
        rows={page?.data ?? []}
        keyOf={(c) => c.id}
        loading={loading}
        emptyLabel="Brak społeczności"
        emptyIcon="usersThree"
        emptyDescription="Utwórz pierwszą społeczność, aby pojawiła się w aplikacji."
        emptyAction={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Nowa społeczność
          </Button>
        }
      />
      {page && (
        <Pagination
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          disabled={loading}
          onPage={(p) => load(p, search)}
        />
      )}

      <Drawer
        open={formOpen}
        onClose={closeForm}
        title={editingId ? "Edytuj społeczność" : "Nowa społeczność"}
        subtitle={
          editingId
            ? "Zmiany są widoczne w aplikacji od razu po zapisaniu."
            : "Nowa społeczność będzie od razu widoczna w aplikacji."
        }
        footer={
          <>
            <Button onClick={closeForm}>Anuluj</Button>
            <Button
              type="submit"
              form="community-form"
              variant="primary"
              loading={busy}
            >
              {busy ? "Zapisywanie…" : editingId ? "Zapisz zmiany" : "Załóż"}
            </Button>
          </>
        }
      >
        <form
          id="community-form"
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Field label="Nazwa">
            <Input
              placeholder="np. Tęczowa Warszawa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field
            label="Opis (opcjonalnie)"
            help="Krótki opis widoczny na karcie społeczności w aplikacji."
          >
            <Textarea
              placeholder="Czym zajmuje się ta społeczność?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {formError && <Alert tone="error">{formError}</Alert>}
        </form>
      </Drawer>
    </section>
  );
}
