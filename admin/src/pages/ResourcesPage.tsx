import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { adminFetch } from "../lib/api";
import {
  type ResourceDTO,
  type ResourceCategory,
  type OffsetPage,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_META,
} from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import { Icon } from "../components/Icon";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  Textarea,
  useConfirm,
} from "../components/ui";

// Admin resources CRUD (docs/API.md §11/§14; P-37 Support & Education, slice 2).
// Admin-curated content — guides/articles AND curated org/link entries — shown
// in the mobile app's Support & Education section. All calls go through
// adminFetch (server gates with isAuthenticated + requireAdmin); the dashboard
// is a view layer and never touches the DB. Mirrors SafePlacesPage, stripped to
// resources' simpler shape (no image/coords/OSM/accessibility).

// Server bounds (server/validation.ts). Kept in sync as maxLength hints so the
// form fails fast client-side; the server is still the source of truth.
const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_URL = 2048;

function CategoryChip({ category }: { category: ResourceCategory }) {
  const meta = RESOURCE_CATEGORY_META[category];
  return (
    <span
      className="bq-badge"
      style={{
        color: meta.color,
        background: `${meta.color}14`,
        borderColor: `${meta.color}45`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function ResourcesPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<ResourceDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [filterCategory, setFilterCategory] = useState<"" | ResourceCategory>(
    "",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id — only the latest load is allowed to commit.
  const reqSeq = useRef(0);

  // Create/edit form drawer.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ResourceCategory | "">("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, cat: "" | ResourceCategory) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (cat) query.set("category", cat);
        const data = await adminFetch<OffsetPage<ResourceDTO>>(
          "GET",
          `/api/admin/resources?${query.toString()}`,
        );
        if (seq !== reqSeq.current) return; // a newer load superseded this one
        setPage(data);
        setPageNum(data.page);
      } catch {
        if (seq !== reqSeq.current) return;
        setError("Nie udało się załadować materiałów.");
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [],
  );

  // Initial load + reload as the category filter changes (always page 1 — the
  // result set changed).
  useEffect(() => {
    load(1, filterCategory);
  }, [load, filterCategory]);

  function resetFormState() {
    setEditingId(null);
    setTitle("");
    setCategory("");
    setBody("");
    setUrl("");
    setFeatured(false);
    setFormError(null);
  }

  function closeForm() {
    setFormOpen(false);
    resetFormState();
  }

  function startCreate() {
    resetFormState();
    setFormOpen(true);
  }

  function startEdit(resource: ResourceDTO) {
    setEditingId(resource.id);
    setTitle(resource.title);
    setCategory(resource.category);
    setBody(resource.body);
    setUrl(resource.url ?? "");
    setFeatured(resource.featured);
    setFormError(null);
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Podaj tytuł materiału.");
      return;
    }
    if (!category) {
      setFormError("Wybierz kategorię.");
      return;
    }
    if (!body.trim()) {
      setFormError("Podaj treść materiału.");
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const trimmedUrl = url.trim();
      const wasEditing = Boolean(editingId);
      if (editingId) {
        // PATCH sends the full set (never an empty body → never a 400 refine).
        // A blank link clears it (url: null); a value sets/replaces it.
        const body_: Record<string, unknown> = {
          title: title.trim(),
          category,
          body: body.trim(),
          featured,
          url: trimmedUrl ? trimmedUrl : null,
        };
        await adminFetch("PATCH", `/api/admin/resources/${editingId}`, body_);
      } else {
        const body_: Record<string, unknown> = {
          title: title.trim(),
          category,
          body: body.trim(),
          featured,
        };
        // Only include url when present — omitted = a plain in-app article.
        if (trimmedUrl) body_.url = trimmedUrl;
        await adminFetch("POST", "/api/admin/resources", body_);
      }
      closeForm();
      await load(wasEditing ? pageNum : 1, filterCategory);
    } catch {
      setFormError(
        "Nie udało się zapisać. Sprawdź dane (np. poprawność linku) i spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(resource: ResourceDTO) {
    const ok = await confirm({
      title: `Usunąć materiał „${resource.title}”?`,
      body: "Materiał zniknie z sekcji wsparcia w aplikacji.",
      confirmLabel: "Usuń",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch("DELETE", `/api/admin/resources/${resource.id}`);
      if (editingId === resource.id) closeForm();
      await load(pageNum, filterCategory);
    } catch {
      setError("Nie udało się usunąć materiału.");
    }
  }

  const columns: Column<ResourceDTO>[] = [
    {
      key: "title",
      header: "Tytuł",
      render: (r) => <span className="bq-td-strong">{r.title}</span>,
    },
    {
      key: "category",
      header: "Kategoria",
      width: 200,
      render: (r) => <CategoryChip category={r.category} />,
    },
    {
      key: "featured",
      header: "Wyróżniony",
      width: 130,
      render: (r) =>
        r.featured ? (
          <Badge tone="brand">Wyróżniony</Badge>
        ) : (
          <span className="bq-td-muted">—</span>
        ),
    },
    {
      key: "url",
      header: "Link",
      width: 80,
      render: (r) =>
        r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer noopener"
            title={r.url}
            style={{
              display: "inline-flex",
              alignItems: "center",
              color: "var(--brand-600)",
            }}
            aria-label="Otwórz link w nowej karcie"
          >
            <Icon name="globe" size={16} />
          </a>
        ) : (
          <span className="bq-td-muted">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: 170,
      align: "right",
      render: (r) => (
        <span className="bq-row-actions" style={{ justifyContent: "flex-end" }}>
          <Button size="sm" icon="pencil" onClick={() => startEdit(r)}>
            Edytuj
          </Button>
          <Button
            size="sm"
            variant="dangerOutline"
            icon="trash"
            onClick={() => onDelete(r)}
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
        title="Materiały wsparcia"
        description="Treści z sekcji Wsparcie i edukacja w aplikacji — poradniki oraz zweryfikowane organizacje i linki. Publikuje wyłącznie zespół."
        actions={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj materiał
          </Button>
        }
      />

      <div className="bq-toolbar">
        <div className="bq-toolbar-group">
          <Select
            value={filterCategory}
            onChange={(e) =>
              setFilterCategory(e.target.value as "" | ResourceCategory)
            }
            aria-label="Filtr kategorii"
            style={{ width: 220 }}
          >
            <option value="">Wszystkie kategorie</option>
            {RESOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {RESOURCE_CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <DataTable
        columns={columns}
        rows={page?.data ?? []}
        keyOf={(r) => r.id}
        loading={loading}
        emptyLabel="Brak materiałów"
        emptyIcon="book"
        emptyDescription="Dodaj pierwszy materiał wsparcia — poradnik lub link do zaufanej organizacji."
        emptyAction={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj materiał
          </Button>
        }
      />
      {page && (
        <Pagination
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          disabled={loading}
          onPage={(p) => load(p, filterCategory)}
        />
      )}

      {/* ---- Create/edit drawer ---- */}
      <Drawer
        open={formOpen}
        onClose={closeForm}
        title={editingId ? "Edytuj materiał" : "Nowy materiał"}
        subtitle="Publikuj wyłącznie treści zweryfikowane przez zespół."
        footer={
          <>
            <Button onClick={closeForm}>Anuluj</Button>
            <Button
              type="submit"
              form="resource-form"
              variant="primary"
              loading={busy}
            >
              {busy
                ? "Zapisywanie…"
                : editingId
                  ? "Zapisz zmiany"
                  : "Dodaj materiał"}
            </Button>
          </>
        }
      >
        <form
          id="resource-form"
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Field label="Tytuł">
            <Input
              placeholder="np. Wsparcie w kryzysie psychicznym"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE}
              autoFocus={!editingId}
            />
          </Field>

          <div className="bq-field">
            <span className="bq-label">Kategoria</span>
            <div className="bq-chip-row">
              {RESOURCE_CATEGORIES.map((c) => {
                const meta = RESOURCE_CATEGORY_META[c];
                const selected = category === c;
                return (
                  <button
                    type="button"
                    key={c}
                    className="bq-chip"
                    aria-pressed={selected}
                    onClick={() => setCategory(c)}
                    style={{
                      color: selected ? "#FFFFFF" : meta.color,
                      background: selected ? meta.color : `${meta.color}10`,
                      borderColor: selected ? meta.color : `${meta.color}50`,
                    }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Treść" help="Poradnik, opis organizacji lub materiał.">
            <Textarea
              placeholder="Treść materiału widoczna w aplikacji"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_BODY}
              rows={8}
            />
          </Field>

          <Field
            label="Link (opcjonalnie)"
            help="Zewnętrzny adres — strona organizacji, infolinia. Zostaw pusty dla materiału w aplikacji."
          >
            <Input
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={MAX_URL}
            />
          </Field>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--gray-700)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            Wyróżnij w sekcji polecanych
          </label>

          {formError && <Alert tone="error">{formError}</Alert>}
        </form>
      </Drawer>
    </section>
  );
}
