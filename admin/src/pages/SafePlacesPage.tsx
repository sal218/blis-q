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
  type SafePlaceDTO,
  type SafePlaceCategory,
  type AccessibilityFeature,
  type OsmCandidate,
  type OffsetPage,
  SAFE_PLACE_CATEGORIES,
  SAFE_PLACE_CATEGORY_META,
  ACCESSIBILITY_FEATURES,
  ACCESSIBILITY_FEATURE_LABELS,
} from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";
import { Icon } from "../components/Icon";
import {
  Alert,
  Button,
  Drawer,
  Field,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Textarea,
  useConfirm,
  useDebouncedValue,
} from "../components/ui";

// Admin safe-places CRUD (docs/API.md §11/§14; epic P-40 slices SP-1/SP-2/SP-6a).
// List + filters, a create/edit form and the "Import from OpenStreetMap" flow —
// each in its own slide-over drawer. All calls go through adminFetch (server
// gates with isAuthenticated + requireAdmin); the dashboard is a view layer —
// it never touches the DB. Coordinates are optional here (manual entry).

const CATEGORY_KEYS = SAFE_PLACE_CATEGORIES;

function CategoryChip({ category }: { category: SafePlaceCategory }) {
  const meta = SAFE_PLACE_CATEGORY_META[category];
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

// The accessibility glyphs shared with the mobile detail screen (Phosphor).
const FEATURE_ICONS: Record<
  AccessibilityFeature,
  "wheelchair" | "genderNeutral" | "wifi"
> = {
  wheelchair_accessible: "wheelchair",
  gender_neutral_restroom: "genderNeutral",
  free_wifi: "wifi",
};

function FeatureIcons({ features }: { features: AccessibilityFeature[] }) {
  if (features.length === 0) return <span className="bq-td-muted">—</span>;
  return (
    <span style={{ display: "flex", gap: 8, color: "var(--brand-600)" }}>
      {features.map((f) => (
        <Icon
          key={f}
          name={FEATURE_ICONS[f]}
          size={18}
          label={ACCESSIBILITY_FEATURE_LABELS[f]}
        />
      ))}
    </span>
  );
}

export function SafePlacesPage() {
  const confirm = useConfirm();
  const [page, setPage] = useState<OffsetPage<SafePlaceDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [filterCategory, setFilterCategory] = useState<"" | SafePlaceCategory>(
    "",
  );
  const [filterCity, setFilterCity] = useState("");
  // Trails `filterCity` so the list filters as you type — no Enter required.
  const debouncedCity = useDebouncedValue(filterCity);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id — with the debounced filter several loads can be in
  // flight; only the latest response is allowed to commit.
  const reqSeq = useRef(0);

  // Create/edit form drawer.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SafePlaceCategory | "">("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  // Confirmed-present accessibility features (multi-select). Sent as a full
  // replace on save; only what the admin has verified is ever set.
  const [accessibility, setAccessibility] = useState<AccessibilityFeature[]>(
    [],
  );
  // Image state: imageKey undefined = leave unchanged, null = remove, string =
  // a freshly-uploaded (confirmed on save) R2 key. imagePreview drives the thumb.
  const [imageKey, setImageKey] = useState<string | null | undefined>(
    undefined,
  );
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Import-from-OSM drawer state.
  const [importOpen, setImportOpen] = useState(false);
  const [importCity, setImportCity] = useState("");
  const [importCategory, setImportCategory] =
    useState<SafePlaceCategory>("cafe");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Candidates carry a local `selected` + an editable `category` (defaults to
  // the searched one) the admin can re-tag before importing.
  const [candidates, setCandidates] = useState<
    (OsmCandidate & { selected: boolean })[]
  >([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const load = useCallback(
    async (
      targetPage: number,
      cat: "" | SafePlaceCategory,
      cityTerm: string,
    ) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (cat) query.set("category", cat);
        // Substring search over name + city + address (server does the LIKE),
        // so a partial term like "War" matches "Warszawa".
        if (cityTerm.trim()) query.set("search", cityTerm.trim());
        const data = await adminFetch<OffsetPage<SafePlaceDTO>>(
          "GET",
          `/api/admin/safe-places?${query.toString()}`,
        );
        if (seq !== reqSeq.current) return; // a newer load superseded this one
        setPage(data);
        setPageNum(data.page);
      } catch {
        if (seq !== reqSeq.current) return;
        setError("Nie udało się załadować bezpiecznych miejsc.");
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [],
  );

  // Initial load + live reload as the category filter or debounced city term
  // changes. Always resets to page 1 (the result set changed).
  useEffect(() => {
    load(1, filterCategory, debouncedCity);
  }, [load, filterCategory, debouncedCity]);

  function resetFormState() {
    setEditingId(null);
    setName("");
    setCategory("");
    setDescription("");
    setAddress("");
    setCity("");
    setLatitude("");
    setLongitude("");
    setAccessibility([]);
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

  function toggleFeature(f: AccessibilityFeature) {
    setAccessibility((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

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
      }>("POST", "/api/admin/safe-places/upload-url", {
        contentType: file.type,
      });
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

  function startEdit(place: SafePlaceDTO) {
    setEditingId(place.id);
    setName(place.name);
    setCategory(place.category);
    setDescription(place.description ?? "");
    setAddress(place.address ?? "");
    setCity(place.city ?? "");
    setLatitude(place.latitude === null ? "" : String(place.latitude));
    setLongitude(place.longitude === null ? "" : String(place.longitude));
    setAccessibility(place.accessibilityFeatures);
    setImageKey(undefined); // unchanged until the admin uploads/removes
    setImagePreview(place.imageUrl);
    setImageError(null);
    setFormError(null);
    setFormOpen(true);
  }

  // Parse the coordinate pair, mirroring the server: both-or-neither + ranges.
  function parseCoords(): {
    ok: boolean;
    lat?: number;
    lng?: number;
    error?: string;
  } {
    const latStr = latitude.trim();
    const lngStr = longitude.trim();
    if (latStr === "" && lngStr === "") return { ok: true };
    if (latStr === "" || lngStr === "") {
      return { ok: false, error: "Podaj obie współrzędne albo żadną." };
    }
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { ok: false, error: "Szerokość musi być w zakresie −90…90." };
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { ok: false, error: "Długość musi być w zakresie −180…180." };
    }
    return { ok: true, lat, lng };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Podaj nazwę miejsca.");
      return;
    }
    if (!category) {
      setFormError("Wybierz kategorię.");
      return;
    }
    const coords = parseCoords();
    if (!coords.ok) {
      setFormError(coords.error ?? "Nieprawidłowe współrzędne.");
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), category };
      if (description.trim()) body.description = description.trim();
      if (address.trim()) body.address = address.trim();
      if (city.trim()) body.city = city.trim();
      if (coords.lat !== undefined && coords.lng !== undefined) {
        body.latitude = coords.lat;
        body.longitude = coords.lng;
      }
      // imageKey: a new upload (string) sets/replaces; null clears (edit only —
      // meaningless on create); undefined leaves the current image untouched.
      if (typeof imageKey === "string") body.imageKey = imageKey;
      else if (imageKey === null && editingId) body.imageKey = null;
      // Accessibility: always send the current selection (a full replace).
      body.accessibilityFeatures = accessibility;
      const wasEditing = Boolean(editingId);
      if (editingId) {
        await adminFetch("PATCH", `/api/admin/safe-places/${editingId}`, body);
      } else {
        await adminFetch("POST", "/api/admin/safe-places", body);
      }
      closeForm();
      await load(wasEditing ? pageNum : 1, filterCategory, filterCity);
    } catch {
      setFormError("Nie udało się zapisać. Sprawdź dane i spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(place: SafePlaceDTO) {
    const ok = await confirm({
      title: `Usunąć miejsce „${place.name}”?`,
      body: "Miejsce zniknie z listy i mapy w aplikacji.",
      confirmLabel: "Usuń",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch("DELETE", `/api/admin/safe-places/${place.id}`);
      if (editingId === place.id) closeForm();
      await load(pageNum, filterCategory, filterCity);
    } catch {
      setError("Nie udało się usunąć miejsca.");
    }
  }

  async function onSearchOsm(e: FormEvent) {
    e.preventDefault();
    if (!importCity.trim()) {
      setSearchError("Podaj miasto.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setImportMsg(null);
    try {
      const data = await adminFetch<{ candidates: OsmCandidate[] }>(
        "POST",
        "/api/admin/safe-places/osm-search",
        { city: importCity.trim(), category: importCategory },
      );
      setCandidates(data.candidates.map((c) => ({ ...c, selected: true })));
      if (data.candidates.length === 0) {
        setSearchError("Brak wyników w OpenStreetMap dla tych kryteriów.");
      }
    } catch {
      setSearchError(
        "Nie udało się pobrać danych z OpenStreetMap. Spróbuj ponownie.",
      );
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length;
  const allSelected =
    candidates.length > 0 && selectedCount === candidates.length;

  function toggleAll() {
    const next = !allSelected;
    setCandidates((cs) => cs.map((c) => ({ ...c, selected: next })));
  }

  async function onImportSelected() {
    const chosen = candidates.filter((c) => c.selected);
    if (chosen.length === 0) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const result = await adminFetch<{ created: number; skipped: number }>(
        "POST",
        "/api/admin/safe-places/bulk",
        chosen.map((c) => ({
          name: c.name,
          category: c.category,
          city: importCity.trim() || undefined,
          address: c.address ?? undefined,
          latitude: c.latitude,
          longitude: c.longitude,
          osmId: c.osmId,
        })),
      );
      setImportMsg(
        `Dodano ${result.created}, pominięto ${result.skipped} (duplikaty).`,
      );
      setCandidates([]);
      await load(1, filterCategory, filterCity);
    } catch {
      setImportMsg("Nie udało się zaimportować. Spróbuj ponownie.");
    } finally {
      setImporting(false);
    }
  }

  const columns: Column<SafePlaceDTO>[] = [
    {
      key: "image",
      header: "",
      width: 56,
      render: (p) =>
        p.imageUrl ? (
          <img src={p.imageUrl} alt="" className="bq-thumb" />
        ) : (
          <div className="bq-thumb-empty">
            <Icon name="image" size={15} />
          </div>
        ),
    },
    {
      key: "name",
      header: "Nazwa",
      render: (p) => <span className="bq-td-strong">{p.name}</span>,
    },
    {
      key: "category",
      header: "Kategoria",
      width: 160,
      render: (p) => <CategoryChip category={p.category} />,
    },
    {
      key: "city",
      header: "Miasto",
      width: 140,
      render: (p) => p.city ?? <span className="bq-td-muted">—</span>,
    },
    {
      key: "accessibility",
      header: "Udogodnienia",
      width: 120,
      render: (p) => <FeatureIcons features={p.accessibilityFeatures} />,
    },
    {
      key: "coords",
      header: "Na mapie",
      width: 110,
      render: (p) =>
        p.latitude !== null && p.longitude !== null ? (
          <span
            style={{
              color: "var(--success)",
              fontWeight: 600,
              fontSize: 12.5,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon name="check" size={13} /> tak
          </span>
        ) : (
          <span className="bq-td-muted">brak</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: 170,
      align: "right",
      render: (p) => (
        <span className="bq-row-actions" style={{ justifyContent: "flex-end" }}>
          <Button size="sm" icon="pencil" onClick={() => startEdit(p)}>
            Edytuj
          </Button>
          <Button
            size="sm"
            variant="dangerOutline"
            icon="trash"
            onClick={() => onDelete(p)}
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
        title="Bezpieczne miejsca"
        description="Zweryfikowane, przyjazne miejsca pokazywane w aplikacji. Import z OpenStreetMap to pula kandydatów — każde miejsce wymaga ręcznej weryfikacji zespołu."
        actions={
          <>
            <Button
              icon="globe"
              onClick={() => {
                setImportMsg(null);
                setSearchError(null);
                setImportOpen(true);
              }}
            >
              Importuj z OSM
            </Button>
            <Button variant="primary" icon="plus" onClick={startCreate}>
              Dodaj miejsce
            </Button>
          </>
        }
      />

      <div className="bq-toolbar">
        <div className="bq-toolbar-group">
          <Select
            value={filterCategory}
            onChange={(e) =>
              setFilterCategory(e.target.value as "" | SafePlaceCategory)
            }
            aria-label="Filtr kategorii"
            style={{ width: 200 }}
          >
            <option value="">Wszystkie kategorie</option>
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>
                {SAFE_PLACE_CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
          <form
            className="bq-toolbar-group"
            onSubmit={(e) => {
              e.preventDefault();
              load(1, filterCategory, filterCity);
            }}
          >
            <SearchInput
              placeholder="Szukaj po nazwie lub mieście"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              style={{ minWidth: 220 }}
              aria-label="Szukaj po nazwie lub mieście"
            />
            <Button type="submit">Szukaj</Button>
          </form>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {importMsg && !importOpen && <Alert tone="success">{importMsg}</Alert>}

      <DataTable
        columns={columns}
        rows={page?.data ?? []}
        keyOf={(p) => p.id}
        loading={loading}
        emptyLabel="Brak bezpiecznych miejsc"
        emptyIcon="mapPin"
        emptyDescription="Dodaj miejsce ręcznie lub zaimportuj kandydatów z OpenStreetMap."
        emptyAction={
          <Button variant="primary" icon="plus" onClick={startCreate}>
            Dodaj miejsce
          </Button>
        }
      />
      {page && (
        <Pagination
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          disabled={loading}
          onPage={(p) => load(p, filterCategory, filterCity)}
        />
      )}

      {/* ---- Create/edit drawer ---- */}
      <Drawer
        open={formOpen}
        onClose={closeForm}
        title={editingId ? "Edytuj miejsce" : "Nowe miejsce"}
        subtitle="Dodawaj tylko miejsca zweryfikowane przez zespół."
        footer={
          <>
            <Button onClick={closeForm}>Anuluj</Button>
            <Button
              type="submit"
              form="safe-place-form"
              variant="primary"
              loading={busy}
            >
              {busy
                ? "Zapisywanie…"
                : editingId
                  ? "Zapisz zmiany"
                  : "Dodaj miejsce"}
            </Button>
          </>
        }
      >
        <form
          id="safe-place-form"
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Field label="Nazwa">
            <Input
              placeholder="np. Tęczowa Kawiarnia"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!editingId}
            />
          </Field>

          <div className="bq-field">
            <span className="bq-label">Kategoria</span>
            <div className="bq-chip-row">
              {CATEGORY_KEYS.map((c) => {
                const meta = SAFE_PLACE_CATEGORY_META[c];
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

          <Field label="Opis (opcjonalnie)">
            <Textarea
              placeholder="Krótki opis miejsca"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="bq-field">
            <span className="bq-label">Udogodnienia (opcjonalnie)</span>
            <p className="bq-help" style={{ marginTop: -2 }}>
              Zaznaczaj wyłącznie udogodnienia potwierdzone przez zespół — brak
              zaznaczenia oznacza „nieznane", nigdy „niedostępne".
            </p>
            <div className="bq-chip-row">
              {ACCESSIBILITY_FEATURES.map((f) => {
                const selected = accessibility.includes(f);
                return (
                  <button
                    type="button"
                    key={f}
                    className="bq-chip"
                    aria-pressed={selected}
                    onClick={() => toggleFeature(f)}
                    style={
                      selected
                        ? {
                            color: "#FFFFFF",
                            background: "var(--brand-500)",
                            borderColor: "var(--brand-500)",
                          }
                        : undefined
                    }
                  >
                    <Icon name={FEATURE_ICONS[f]} size={14} />
                    {ACCESSIBILITY_FEATURE_LABELS[f]}
                  </button>
                );
              })}
            </div>
          </div>

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

          <div className="bq-grid-2">
            <Field label="Adres (opcjonalnie)">
              <Input
                placeholder="Ulica i numer"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <Field label="Miasto (opcjonalnie)">
              <Input
                placeholder="np. Warszawa"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
          </div>

          <div className="bq-field">
            <span className="bq-label">
              Współrzędne (opcjonalnie — mapę/pin dodamy wkrótce)
            </span>
            <div className="bq-grid-2">
              <Input
                placeholder="Szerokość (lat)"
                inputMode="decimal"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                aria-label="Szerokość geograficzna"
              />
              <Input
                placeholder="Długość (lng)"
                inputMode="decimal"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                aria-label="Długość geograficzna"
              />
            </div>
          </div>

          {formError && <Alert tone="error">{formError}</Alert>}
        </form>
      </Drawer>

      {/* ---- Import from OpenStreetMap drawer (SP-2) — search a city +
           category, tick the venues, add them in bulk. Dedupe is server-side
           (osm_id). ---- */}
      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importuj z OpenStreetMap"
        subtitle="Wyniki to pula kandydatów, nie zweryfikowana lista — każde miejsce wymaga oceny zespołu przed publikacją."
        footer={
          candidates.length > 0 ? (
            <>
              <Button onClick={() => setImportOpen(false)}>Zamknij</Button>
              <Button
                variant="primary"
                icon="plus"
                loading={importing}
                disabled={importing || selectedCount === 0}
                onClick={onImportSelected}
              >
                {importing
                  ? "Dodawanie…"
                  : `Dodaj zaznaczone (${selectedCount})`}
              </Button>
            </>
          ) : (
            <Button onClick={() => setImportOpen(false)}>Zamknij</Button>
          )
        }
      >
        <form
          onSubmit={onSearchOsm}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <Input
            placeholder="Miasto (np. Warszawa)"
            value={importCity}
            onChange={(e) => setImportCity(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
            aria-label="Miasto do wyszukania"
            autoFocus
          />
          <Select
            value={importCategory}
            onChange={(e) =>
              setImportCategory(e.target.value as SafePlaceCategory)
            }
            aria-label="Kategoria do wyszukania"
            style={{ width: 170 }}
          >
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>
                {SAFE_PLACE_CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
          <Button
            type="submit"
            variant="primary"
            icon="magnifyingGlass"
            loading={searching}
          >
            {searching ? "Szukam…" : "Szukaj"}
          </Button>
        </form>

        {searchError && <Alert tone="error">{searchError}</Alert>}
        {importMsg && <Alert tone="success">{importMsg}</Alert>}

        {candidates.length > 0 && (
          <>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--gray-700)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
              />
              Zaznacz wszystkie ({candidates.length})
            </label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--gray-200)",
                borderRadius: 12,
                // Grow to fill the remaining drawer height (min-height:0 lets a
                // flex child shrink) so a large result set uses the whole window
                // and only scrolls inside its own area when it runs out of room.
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              {candidates.map((c, i) => (
                <div
                  key={c.osmId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom:
                      i === candidates.length - 1
                        ? "none"
                        : "1px solid var(--gray-100)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.selected}
                    aria-label={`Zaznacz ${c.name}`}
                    onChange={() =>
                      setCandidates((cs) =>
                        cs.map((x, j) =>
                          j === i ? { ...x, selected: !x.selected } : x,
                        ),
                      )
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      className="bq-td-strong"
                      style={{ display: "block", fontSize: 13.5 }}
                    >
                      {c.name}
                    </span>
                    {c.address && (
                      <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                        {c.address}
                      </span>
                    )}
                  </div>
                  <Select
                    value={c.category}
                    aria-label={`Kategoria dla ${c.name}`}
                    style={{ width: 150, padding: "5px 28px 5px 10px" }}
                    onChange={(e) =>
                      setCandidates((cs) =>
                        cs.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                category: e.target.value as SafePlaceCategory,
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {CATEGORY_KEYS.map((cat) => (
                      <option key={cat} value={cat}>
                        {SAFE_PLACE_CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <p className="bq-help">
              Dane © OpenStreetMap contributors. Duplikaty są pomijane
              automatycznie.
            </p>
          </>
        )}
      </Drawer>
    </section>
  );
}
