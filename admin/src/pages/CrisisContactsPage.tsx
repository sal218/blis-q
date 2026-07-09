import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { adminFetch } from "../lib/api";
import {
  type CrisisContactDTO,
  type CrisisContactCategory,
  type OffsetPage,
  CRISIS_CONTACT_CATEGORIES,
  CRISIS_CONTACT_CATEGORY_META,
} from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
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

// Admin crisis-contacts CRUD (docs/API.md §11/§14; P-37 "Pomoc w kryzysie",
// slice 2). Admin-curated crisis/help contacts (112, hotlines, LGBT+ org lines)
// shown on the mobile safety page. All calls go through adminFetch (server gates
// with isAuthenticated + requireAdmin); the dashboard is a view layer and never
// touches the DB. Mirrors ResourcesPage, adapted to the contact shape (phone +
// hours + a verified flag; no body/url/featured).

// Server bounds (server/validation.ts). Kept in sync as maxLength hints so the
// form fails fast client-side; the server is still the source of truth.
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_HOURS = 80;
const MAX_PHONE = 32;

// Life-critical: mirror the server's permissive-but-bounded phone format (an
// optional leading +, then digits/spaces/dashes/parentheses, ≥3 actual digits).
// Validated in JS (not <input type="tel">, whose native popup is browser-locale
// English, not our Polish copy). The server is the authoritative check.
function isValidPhone(value: string): boolean {
  if (!/^\+?[0-9][0-9 ()-]*$/.test(value)) return false;
  const digits = value.match(/\d/g);
  return digits !== null && digits.length >= 3;
}

function CategoryChip({ category }: { category: CrisisContactCategory }) {
  const meta = CRISIS_CONTACT_CATEGORY_META[category];
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

export function CrisisContactsPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<CrisisContactDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [filterCategory, setFilterCategory] = useState<
    "" | CrisisContactCategory
  >("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id — only the latest load is allowed to commit.
  const reqSeq = useRef(0);

  // Create/edit form drawer.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CrisisContactCategory | "">("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [verified, setVerified] = useState(false);
  // The verified value the drawer opened with — so we only re-send `verified`
  // on PATCH when it actually changed (the backend re-stamps verifiedAt whenever
  // `verified` is present, so omitting it preserves the freshness timestamp).
  const [originalVerified, setOriginalVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, cat: "" | CrisisContactCategory) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (cat) query.set("category", cat);
        const data = await adminFetch<OffsetPage<CrisisContactDTO>>(
          "GET",
          `/api/admin/crisis-contacts?${query.toString()}`,
        );
        if (seq !== reqSeq.current) return; // a newer load superseded this one
        setPage(data);
        setPageNum(data.page);
      } catch {
        if (seq !== reqSeq.current) return;
        setError("Nie udało się załadować kontaktów.");
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
    setName("");
    setCategory("");
    setPhone("");
    setDescription("");
    setHours("");
    setVerified(false);
    setOriginalVerified(false);
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

  function startEdit(contact: CrisisContactDTO) {
    setEditingId(contact.id);
    setName(contact.name);
    setCategory(contact.category);
    setPhone(contact.phone);
    setDescription(contact.description);
    setHours(contact.hours ?? "");
    setVerified(contact.verified);
    setOriginalVerified(contact.verified);
    setFormError(null);
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Podaj nazwę kontaktu.");
      return;
    }
    if (!phone.trim()) {
      setFormError("Podaj numer telefonu.");
      return;
    }
    if (!isValidPhone(phone.trim())) {
      setFormError("Podaj poprawny numer telefonu (np. 116 123 lub +48 …).");
      return;
    }
    if (!category) {
      setFormError("Wybierz kategorię.");
      return;
    }
    if (!description.trim()) {
      setFormError("Podaj krótki opis kontaktu.");
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const trimmedHours = hours.trim();
      const wasEditing = Boolean(editingId);
      if (editingId) {
        // PATCH sends the full text set (never an empty body → never a 400
        // refine). A blank "hours" clears it (hours: null). `verified` is sent
        // ONLY when it changed, so editing other fields doesn't re-stamp the
        // life-critical verification timestamp.
        const body_: Record<string, unknown> = {
          name: name.trim(),
          phone: phone.trim(),
          description: description.trim(),
          category,
          hours: trimmedHours ? trimmedHours : null,
        };
        if (verified !== originalVerified) body_.verified = verified;
        await adminFetch(
          "PATCH",
          `/api/admin/crisis-contacts/${editingId}`,
          body_,
        );
      } else {
        const body_: Record<string, unknown> = {
          name: name.trim(),
          phone: phone.trim(),
          description: description.trim(),
          category,
          verified,
        };
        // Only include hours when present — omitted = no availability shown.
        if (trimmedHours) body_.hours = trimmedHours;
        await adminFetch("POST", "/api/admin/crisis-contacts", body_);
      }
      closeForm();
      await load(wasEditing ? pageNum : 1, filterCategory);
    } catch {
      setFormError(
        "Nie udało się zapisać. Sprawdź dane (np. poprawność numeru) i spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(contact: CrisisContactDTO) {
    const ok = await confirm({
      title: `Usunąć kontakt „${contact.name}”?`,
      body: "Kontakt zniknie ze strony pomocy w kryzysie w aplikacji.",
      confirmLabel: "Usuń",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch("DELETE", `/api/admin/crisis-contacts/${contact.id}`);
      if (editingId === contact.id) closeForm();
      await load(pageNum, filterCategory);
    } catch {
      setError("Nie udało się usunąć kontaktu.");
    }
  }

  const columns: Column<CrisisContactDTO>[] = [
    {
      key: "name",
      header: "Nazwa",
      render: (r) => <span className="bq-td-strong">{r.name}</span>,
    },
    {
      key: "phone",
      header: "Telefon",
      width: 160,
      render: (r) => <span className="bq-td-strong">{r.phone}</span>,
    },
    {
      key: "category",
      header: "Kategoria",
      width: 180,
      render: (r) => <CategoryChip category={r.category} />,
    },
    {
      key: "hours",
      header: "Godziny",
      width: 160,
      render: (r) =>
        r.hours ? (
          <span className="bq-td-muted">{r.hours}</span>
        ) : (
          <span className="bq-td-muted">—</span>
        ),
    },
    {
      key: "verified",
      header: "Weryfikacja",
      width: 130,
      render: (r) =>
        r.verified ? (
          <Badge tone="success">Zweryfikowany</Badge>
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
        title="Kontakty kryzysowe"
        description="Zaufane numery pomocy pokazywane na stronie „Pomoc w kryzysie” w aplikacji — numer alarmowy, telefony zaufania, organizacje. Publikuje i weryfikuje wyłącznie zespół (dokładność jest krytyczna)."
        actions={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj kontakt
          </Button>
        }
      />

      <div className="bq-toolbar">
        <div className="bq-toolbar-group">
          <Select
            value={filterCategory}
            onChange={(e) =>
              setFilterCategory(e.target.value as "" | CrisisContactCategory)
            }
            aria-label="Filtr kategorii"
            style={{ width: 220 }}
          >
            <option value="">Wszystkie kategorie</option>
            {CRISIS_CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CRISIS_CONTACT_CATEGORY_META[c].label}
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
        emptyLabel="Brak kontaktów"
        emptyIcon="phone"
        emptyDescription="Dodaj pierwszy kontakt kryzysowy — np. numer alarmowy 112 lub telefon zaufania."
        emptyAction={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj kontakt
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
        title={editingId ? "Edytuj kontakt" : "Nowy kontakt"}
        subtitle="Publikuj wyłącznie zweryfikowane, aktualne numery — dokładność jest krytyczna."
        footer={
          <>
            <Button onClick={closeForm}>Anuluj</Button>
            <Button
              type="submit"
              form="crisis-contact-form"
              variant="primary"
              loading={busy}
            >
              {busy
                ? "Zapisywanie…"
                : editingId
                  ? "Zapisz zmiany"
                  : "Dodaj kontakt"}
            </Button>
          </>
        }
      >
        <form
          id="crisis-contact-form"
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Field label="Nazwa" required>
            <Input
              placeholder="np. Telefon zaufania"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              autoFocus={!editingId}
            />
          </Field>

          <Field
            label="Telefon"
            required
            help="Numer, pod który dzwoni użytkownik."
          >
            <Input
              type="text"
              inputMode="tel"
              placeholder="np. 116 123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={MAX_PHONE}
            />
          </Field>

          <div className="bq-field">
            <span className="bq-label">
              Kategoria
              <RequiredMark />
            </span>
            <div className="bq-chip-row">
              {CRISIS_CONTACT_CATEGORIES.map((c) => {
                const meta = CRISIS_CONTACT_CATEGORY_META[c];
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

          <Field label="Opis" required help="Krótko: komu i w czym pomaga.">
            <Textarea
              placeholder="np. Wsparcie w kryzysie emocjonalnym dla osób dorosłych."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION}
              rows={4}
            />
          </Field>

          <Field
            label="Godziny (opcjonalnie)"
            help="Dostępność, np. „Całodobowo” lub „Pn–Pt 10–18”. Zostaw puste, jeśli nieznane."
          >
            <Input
              placeholder="np. Całodobowo"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              maxLength={MAX_HOURS}
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
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            Zweryfikowany kontakt
          </label>

          {formError && <Alert tone="error">{formError}</Alert>}
        </form>
      </Drawer>
    </section>
  );
}
