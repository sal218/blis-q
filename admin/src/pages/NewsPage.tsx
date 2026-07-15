import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { adminFetch } from "../lib/api";
import {
  type NewsDTO,
  type NewsCategory,
  type OffsetPage,
  NEWS_CATEGORIES,
  NEWS_CATEGORY_META,
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
  RequiredMark,
  Select,
  Textarea,
  useConfirm,
} from "../components/ui";

// Admin newsroom CRUD (docs/API.md §11/§14; P-31 pillar-3 News, slice 2). Admin-
// curated LGBT+ news for the mobile app's News feed. Two content modes: our own
// editorial (a full body, no link) and externally-sourced items (a summary + a
// "read at source" link, no body). All calls go through adminFetch (server gates
// with isAuthenticated + requireAdmin); the dashboard is a view layer and never
// touches the DB. Mirrors ResourcesPage. Image upload + a "suggest a story"
// moderation pipeline are later epic slices.

// Server bounds (server/validation.ts). Kept in sync as maxLength hints so the
// form fails fast client-side; the server is still the source of truth.
const MAX_TITLE = 200;
const MAX_SUMMARY = 500;
const MAX_BODY = 20000;
const MAX_SOURCE = 120;
const MAX_URL = 2048;

// A link must be a real http(s) URL. We validate in JS (not <input type="url">,
// whose native popup is browser-locale English, not our Polish copy) and only
// ever render http(s) links — this also blocks a javascript:/data: href from
// ever becoming a clickable anchor in the list.
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function CategoryChip({ category }: { category: NewsCategory }) {
  const meta = NEWS_CATEGORY_META[category];
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

export function NewsPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<NewsDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [filterCategory, setFilterCategory] = useState<"" | NewsCategory>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id — only the latest load is allowed to commit.
  const reqSeq = useRef(0);

  // Create/edit form drawer.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<NewsCategory | "">("");
  const [source, setSource] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Article photo. undefined = leave unchanged · null = remove · string = a
  // freshly-uploaded R2 key (confirmed server-side on save).
  const [imageKey, setImageKey] = useState<string | null | undefined>(
    undefined,
  );
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, cat: "" | NewsCategory) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (cat) query.set("category", cat);
        const data = await adminFetch<OffsetPage<NewsDTO>>(
          "GET",
          `/api/admin/news?${query.toString()}`,
        );
        if (seq !== reqSeq.current) return; // a newer load superseded this one
        setPage(data);
        setPageNum(data.page);
      } catch {
        if (seq !== reqSeq.current) return;
        setError("Nie udało się załadować wiadomości.");
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

  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  // Upload a chosen file straight to R2 via a presigned PUT, then hold its key.
  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Dozwolone formaty: JPG, PNG, WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Maksymalny rozmiar to 5 MB.");
      return;
    }
    setImageBusy(true);
    setImageError(null);
    try {
      const { uploadUrl, key } = await adminFetch<{
        uploadUrl: string;
        key: string;
      }>("POST", "/api/admin/news/upload-url", { contentType: file.type });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      setImageKey(key);
      setImagePreview(URL.createObjectURL(file));
    } catch {
      setImageError("Nie udało się przesłać zdjęcia. Spróbuj ponownie.");
    } finally {
      setImageBusy(false);
    }
  }

  function removeImage() {
    setImageKey(null);
    setImagePreview(null);
    setImageError(null);
  }

  function resetFormState() {
    setEditingId(null);
    setTitle("");
    setSummary("");
    setCategory("");
    setSource("");
    setBody("");
    setSourceUrl("");
    setFeatured(false);
    setImageKey(undefined);
    setImagePreview(null);
    setImageError(null);
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

  function startEdit(item: NewsDTO) {
    setEditingId(item.id);
    setTitle(item.title);
    setSummary(item.summary);
    setCategory(item.category);
    setSource(item.source);
    setBody(item.body ?? "");
    setSourceUrl(item.sourceUrl ?? "");
    setFeatured(item.featured);
    setImageKey(undefined); // unchanged unless the admin picks/removes a photo
    setImagePreview(item.imageUrl);
    setImageError(null);
    setFormError(null);
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Podaj tytuł wiadomości.");
      return;
    }
    if (!summary.trim()) {
      setFormError("Podaj krótkie podsumowanie.");
      return;
    }
    if (!category) {
      setFormError("Wybierz kategorię.");
      return;
    }
    if (!source.trim()) {
      setFormError("Podaj źródło (np. Blis-Q Redakcja).");
      return;
    }
    if (sourceUrl.trim() && !isHttpUrl(sourceUrl.trim())) {
      setFormError(
        "Podaj poprawny link zaczynający się od http:// lub https://.",
      );
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const trimmedBody = body.trim();
      const trimmedUrl = sourceUrl.trim();
      const wasEditing = Boolean(editingId);
      if (editingId) {
        // PATCH sends the full required set (never an empty body → never a 400
        // refine). A blank body / link clears it (null); a value sets/replaces it.
        const body_: Record<string, unknown> = {
          title: title.trim(),
          summary: summary.trim(),
          category,
          source: source.trim(),
          featured,
          body: trimmedBody ? trimmedBody : null,
          sourceUrl: trimmedUrl ? trimmedUrl : null,
        };
        // uuid = set/replace · null = remove · omit (undefined) = unchanged.
        if (typeof imageKey === "string") body_.imageKey = imageKey;
        else if (imageKey === null) body_.imageKey = null;
        await adminFetch("PATCH", `/api/admin/news/${editingId}`, body_);
      } else {
        const body_: Record<string, unknown> = {
          title: title.trim(),
          summary: summary.trim(),
          category,
          source: source.trim(),
          featured,
        };
        // Only include the optionals when present. Omitting body = an externally-
        // sourced item; omitting the link = our own editorial piece.
        if (trimmedBody) body_.body = trimmedBody;
        if (trimmedUrl) body_.sourceUrl = trimmedUrl;
        if (typeof imageKey === "string") body_.imageKey = imageKey;
        await adminFetch("POST", "/api/admin/news", body_);
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

  async function onDelete(item: NewsDTO) {
    const ok = await confirm({
      title: `Usunąć wiadomość „${item.title}”?`,
      body: "Wiadomość zniknie z sekcji Aktualności w aplikacji.",
      confirmLabel: "Usuń",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch("DELETE", `/api/admin/news/${item.id}`);
      if (editingId === item.id) closeForm();
      await load(pageNum, filterCategory);
    } catch {
      setError("Nie udało się usunąć wiadomości.");
    }
  }

  const columns: Column<NewsDTO>[] = [
    {
      key: "title",
      header: "Tytuł",
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {r.imageUrl ? (
            <img src={r.imageUrl} alt="" className="bq-thumb" />
          ) : null}
          <span className="bq-td-strong">{r.title}</span>
        </span>
      ),
    },
    {
      key: "category",
      header: "Kategoria",
      width: 160,
      render: (r) => <CategoryChip category={r.category} />,
    },
    {
      key: "source",
      header: "Źródło",
      width: 170,
      render: (r) => <span className="bq-td-muted">{r.source}</span>,
    },
    {
      key: "featured",
      header: "Wyróżniona",
      width: 130,
      render: (r) =>
        r.featured ? (
          <Badge tone="brand">NA TOPIE</Badge>
        ) : (
          <span className="bq-td-muted">—</span>
        ),
    },
    {
      key: "sourceUrl",
      header: "Link",
      width: 70,
      render: (r) =>
        r.sourceUrl && isHttpUrl(r.sourceUrl) ? (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            title={r.sourceUrl}
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
        title="Aktualności"
        description="Wiadomości LGBT+ z Polski i UE, widoczne w sekcji Aktualności w aplikacji. Publikuje wyłącznie zespół — użytkownicy mogą tylko zaproponować temat."
        actions={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj wiadomość
          </Button>
        }
      />

      <div className="bq-toolbar">
        <div className="bq-toolbar-group">
          <Select
            value={filterCategory}
            onChange={(e) =>
              setFilterCategory(e.target.value as "" | NewsCategory)
            }
            aria-label="Filtr kategorii"
            style={{ width: 220 }}
          >
            <option value="">Wszystkie kategorie</option>
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NEWS_CATEGORY_META[c].label}
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
        emptyLabel="Brak wiadomości"
        emptyIcon="newspaper"
        emptyDescription="Dodaj pierwszą wiadomość — artykuł redakcyjny lub link do zewnętrznego źródła."
        emptyAction={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj wiadomość
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
        title={editingId ? "Edytuj wiadomość" : "Nowa wiadomość"}
        subtitle="Publikuj wyłącznie treści zweryfikowane przez zespół."
        footer={
          <>
            <Button onClick={closeForm}>Anuluj</Button>
            <Button
              type="submit"
              form="news-form"
              variant="primary"
              loading={busy}
            >
              {busy
                ? "Zapisywanie…"
                : editingId
                  ? "Zapisz zmiany"
                  : "Dodaj wiadomość"}
            </Button>
          </>
        }
      >
        <form
          id="news-form"
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Field label="Tytuł" required>
            <Input
              placeholder="np. Parlament Europejski przyjął rezolucję…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE}
              autoFocus={!editingId}
            />
          </Field>

          <Field
            label="Podsumowanie"
            required
            help="Krótki zajawka widoczny na kafelku w aplikacji."
          >
            <Textarea
              placeholder="Jedno–dwa zdania streszczenia."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={MAX_SUMMARY}
              rows={3}
            />
          </Field>

          <div className="bq-field">
            <span className="bq-label">
              Kategoria
              <RequiredMark />
            </span>
            <div className="bq-chip-row">
              {NEWS_CATEGORIES.map((c) => {
                const meta = NEWS_CATEGORY_META[c];
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

          <Field
            label="Źródło"
            required
            help='Podpis, np. "Blis-Q Redakcja" lub nazwa serwisu ("OKO.press").'
          >
            <Input
              placeholder="Blis-Q Redakcja"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={MAX_SOURCE}
            />
          </Field>

          <Field
            label="Treść (opcjonalnie)"
            help="Pełny artykuł redakcyjny. Zostaw pusty dla wiadomości z zewnętrznego źródła (czytelnik przejdzie do linku)."
          >
            <Textarea
              placeholder="Pełna treść artykułu widoczna w aplikacji."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_BODY}
              rows={8}
            />
          </Field>

          <Field
            label="Link do źródła (opcjonalnie)"
            help="Zewnętrzny adres artykułu. Wymagany dla wiadomości z zewnętrznego źródła."
          >
            <Input
              type="text"
              inputMode="url"
              placeholder="https://…"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              maxLength={MAX_URL}
            />
          </Field>

          <div className="bq-field">
            <span className="bq-label">
              Zdjęcie (opcjonalnie — JPG/PNG/WebP, do 5 MB)
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt=""
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    objectFit: "cover",
                    border: "1px solid var(--gray-200)",
                  }}
                />
              ) : (
                <div
                  className="bq-thumb-empty"
                  style={{ width: 72, height: 72, borderRadius: 12 }}
                >
                  <Icon name="image" size={22} />
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="bq-btn bq-btn-secondary bq-btn-sm">
                  <Icon name="downloadSimple" size={13} />
                  {imageBusy
                    ? "Przesyłanie…"
                    : imagePreview
                      ? "Zmień zdjęcie"
                      : "Dodaj zdjęcie"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onPickImage}
                    disabled={imageBusy}
                    style={{ display: "none" }}
                  />
                </label>
                {imagePreview ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={imageBusy}
                    onClick={removeImage}
                  >
                    Usuń zdjęcie
                  </Button>
                ) : null}
              </div>
            </div>
            {imageError ? <Alert tone="error">{imageError}</Alert> : null}
          </div>

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
            Wyróżnij jako NA TOPIE
          </label>

          {formError && <Alert tone="error">{formError}</Alert>}
        </form>
      </Drawer>
    </section>
  );
}
