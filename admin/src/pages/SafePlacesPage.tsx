import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { adminFetch } from "../lib/api";
import {
  type SafePlaceDTO,
  type SafePlaceCategory,
  type OsmCandidate,
  type OffsetPage,
  SAFE_PLACE_CATEGORIES,
  SAFE_PLACE_CATEGORY_META,
} from "../lib/types";
import { DataTable, type Column } from "../components/DataTable";

// Admin safe-places CRUD (docs/API.md §11/§14; epic P-40 slice SP-1). List +
// filters + a create/edit form + soft delete. All calls go through adminFetch
// (server gates with isAuthenticated + requireAdmin); the dashboard is a view
// layer — it never touches the DB. Coordinates are optional here (manual entry);
// the geocode helper + the OSM "browse nearby → bulk-add" map panel are SP-2.

const CATEGORY_KEYS = SAFE_PLACE_CATEGORIES;

function CategoryChip({ category }: { category: SafePlaceCategory }) {
  const meta = SAFE_PLACE_CATEGORY_META[category];
  return (
    <span
      style={{
        ...styles.chip,
        color: meta.color,
        background: `${meta.color}1A`, // ~10% tint
        borderColor: `${meta.color}55`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function SafePlacesPage() {
  const [page, setPage] = useState<OffsetPage<SafePlaceDTO> | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [filterCategory, setFilterCategory] = useState<"" | SafePlaceCategory>(
    "",
  );
  const [filterCity, setFilterCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SafePlaceCategory | "">("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
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

  // Import-from-OSM panel state.
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
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(targetPage) });
        if (cat) query.set("category", cat);
        if (cityTerm.trim()) query.set("city", cityTerm.trim());
        const data = await adminFetch<OffsetPage<SafePlaceDTO>>(
          "GET",
          `/api/admin/safe-places?${query.toString()}`,
        );
        setPage(data);
        setPageNum(data.page);
      } catch {
        setError("Nie udało się załadować bezpiecznych miejsc.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(1, "", "");
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCategory("");
    setDescription("");
    setAddress("");
    setCity("");
    setLatitude("");
    setLongitude("");
    setImageKey(undefined);
    setImagePreview(null);
    setImageError(null);
    setFormError(null);
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
    setImageKey(undefined); // unchanged until the admin uploads/removes
    setImagePreview(place.imageUrl);
    setImageError(null);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      if (editingId) {
        await adminFetch("PATCH", `/api/admin/safe-places/${editingId}`, body);
      } else {
        await adminFetch("POST", "/api/admin/safe-places", body);
      }
      resetForm();
      await load(editingId ? pageNum : 1, filterCategory, filterCity);
    } catch {
      setFormError("Nie udało się zapisać. Sprawdź dane i spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(place: SafePlaceDTO) {
    if (!window.confirm(`Usunąć miejsce „${place.name}”?`)) return;
    try {
      await adminFetch("DELETE", `/api/admin/safe-places/${place.id}`);
      if (editingId === place.id) resetForm();
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
      render: (p) =>
        p.imageUrl ? (
          <img src={p.imageUrl} alt="" style={styles.thumb} />
        ) : (
          <div style={styles.thumbEmpty} />
        ),
    },
    { key: "name", header: "Nazwa", render: (p) => p.name },
    {
      key: "category",
      header: "Kategoria",
      render: (p) => <CategoryChip category={p.category} />,
    },
    { key: "city", header: "Miasto", render: (p) => p.city ?? "—" },
    {
      key: "coords",
      header: "Współrzędne",
      render: (p) =>
        p.latitude !== null && p.longitude !== null ? (
          <span style={styles.coordsOk}>✓ na mapie</span>
        ) : (
          <span style={styles.muted}>— brak</span>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <span style={styles.actions}>
          <button style={styles.linkButton} onClick={() => startEdit(p)}>
            Edytuj
          </button>
          <button
            style={{ ...styles.linkButton, color: "#DC2626" }}
            onClick={() => onDelete(p)}
          >
            Usuń
          </button>
        </span>
      ),
    },
  ];

  return (
    <section>
      <h1 style={styles.h1}>Bezpieczne miejsca</h1>

      <form style={styles.card} onSubmit={onSubmit}>
        <h2 style={styles.h2}>
          {editingId ? "Edytuj miejsce" : "Nowe miejsce"}
        </h2>

        <label style={styles.label}>Nazwa</label>
        <input
          style={styles.input}
          placeholder="np. Tęczowa Kawiarnia"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label style={styles.label}>Kategoria</label>
        <div style={styles.chipRow}>
          {CATEGORY_KEYS.map((c) => {
            const meta = SAFE_PLACE_CATEGORY_META[c];
            const selected = category === c;
            return (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                style={{
                  ...styles.pickChip,
                  color: selected ? "#FFFFFF" : meta.color,
                  background: selected ? meta.color : `${meta.color}12`,
                  borderColor: selected ? meta.color : `${meta.color}55`,
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <label style={styles.label}>Opis (opcjonalnie)</label>
        <textarea
          style={{ ...styles.input, height: 72, resize: "vertical" }}
          placeholder="Krótki opis miejsca"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label style={styles.label}>
          Zdjęcie (opcjonalnie — JPG/PNG/WebP, do 5 MB)
        </label>
        <div style={styles.imageRow}>
          {imagePreview ? (
            <img src={imagePreview} alt="" style={styles.imagePreview} />
          ) : (
            <div style={styles.imagePlaceholder}>Brak zdjęcia</div>
          )}
          <div style={styles.imageControls}>
            <label style={styles.uploadBtn}>
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
              <button
                type="button"
                onClick={removeImage}
                disabled={imageBusy}
                style={styles.removeBtn}
              >
                Usuń zdjęcie
              </button>
            ) : null}
          </div>
        </div>
        {imageError ? <p style={styles.error}>{imageError}</p> : null}

        <div style={styles.grid2}>
          <div>
            <label style={styles.label}>Adres (opcjonalnie)</label>
            <input
              style={styles.input}
              placeholder="Ulica i numer"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label style={styles.label}>Miasto (opcjonalnie)</label>
            <input
              style={styles.input}
              placeholder="np. Warszawa"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>

        <label style={styles.label}>
          Współrzędne (opcjonalnie — mapę/pin dodamy wkrótce)
        </label>
        <div style={styles.grid2}>
          <input
            style={styles.input}
            placeholder="Szerokość (lat)"
            inputMode="decimal"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Długość (lng)"
            inputMode="decimal"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </div>

        {formError && <p style={styles.error}>{formError}</p>}
        <div style={styles.formActions}>
          <button type="submit" style={styles.primaryButton} disabled={busy}>
            {busy ? "Zapisywanie…" : editingId ? "Zapisz" : "Dodaj miejsce"}
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

      {/* Import from OpenStreetMap (SP-2) — search a city + category, tick the
          venues, add them in bulk. Dedupe is server-side (osm_id). */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Importuj z OpenStreetMap</h2>
        <form style={styles.importRow} onSubmit={onSearchOsm}>
          <input
            style={styles.input}
            placeholder="Miasto (np. Warszawa)"
            value={importCity}
            onChange={(e) => setImportCity(e.target.value)}
          />
          <select
            style={styles.select}
            value={importCategory}
            onChange={(e) =>
              setImportCategory(e.target.value as SafePlaceCategory)
            }
          >
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>
                {SAFE_PLACE_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            style={styles.primaryButton}
            disabled={searching}
          >
            {searching ? "Szukam…" : "Szukaj w OSM"}
          </button>
        </form>
        {searchError && <p style={styles.error}>{searchError}</p>}
        {importMsg && <p style={styles.muted}>{importMsg}</p>}

        {candidates.length > 0 && (
          <>
            <div style={styles.importHeader}>
              <label style={styles.selectAll}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                Zaznacz wszystkie ({candidates.length})
              </label>
            </div>
            <div style={styles.candidateList}>
              {candidates.map((c, i) => (
                <div key={c.osmId} style={styles.candidateRow}>
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() =>
                      setCandidates((cs) =>
                        cs.map((x, j) =>
                          j === i ? { ...x, selected: !x.selected } : x,
                        ),
                      )
                    }
                  />
                  <div style={styles.candidateInfo}>
                    <span style={styles.candidateName}>{c.name}</span>
                    {c.address && <span style={styles.muted}>{c.address}</span>}
                  </div>
                  <select
                    style={styles.candidateCategory}
                    value={c.category}
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
                  </select>
                </div>
              ))}
            </div>
            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.primaryButton}
                disabled={importing || selectedCount === 0}
                onClick={onImportSelected}
              >
                {importing
                  ? "Dodawanie…"
                  : `Dodaj zaznaczone (${selectedCount})`}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={styles.filterRow}>
        <select
          style={styles.select}
          value={filterCategory}
          onChange={(e) => {
            const v = e.target.value as "" | SafePlaceCategory;
            setFilterCategory(v);
            load(1, v, filterCity);
          }}
        >
          <option value="">Wszystkie kategorie</option>
          {CATEGORY_KEYS.map((c) => (
            <option key={c} value={c}>
              {SAFE_PLACE_CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <form
          style={styles.searchInline}
          onSubmit={(e) => {
            e.preventDefault();
            load(1, filterCategory, filterCity);
          }}
        >
          <input
            style={styles.input}
            placeholder="Szukaj po mieście"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          />
          <button type="submit" style={styles.ghostButton}>
            Szukaj
          </button>
        </form>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {loading ? (
        <p style={styles.muted}>Ładowanie…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.data ?? []}
            keyOf={(p) => p.id}
            emptyLabel="Brak bezpiecznych miejsc."
          />
          {page && page.totalPages > 1 && (
            <div style={styles.pager}>
              <button
                style={styles.ghostButton}
                disabled={pageNum <= 1}
                onClick={() => load(pageNum - 1, filterCategory, filterCity)}
              >
                Poprzednia
              </button>
              <span style={styles.muted}>
                {page.page} / {page.totalPages}
              </span>
              <button
                style={styles.ghostButton}
                disabled={pageNum >= page.totalPages}
                onClick={() => load(pageNum + 1, filterCategory, filterCity)}
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
  h2: { fontSize: 16, margin: "0 0 8px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "#FFFFFF",
    padding: 24,
    borderRadius: 14,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    marginBottom: 24,
    maxWidth: 640,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginTop: 6,
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 },
  pickChip: {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  chip: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 600,
  },
  coordsOk: { color: "#059669", fontSize: 13, fontWeight: 600 },
  filterRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    maxWidth: 640,
    flexWrap: "wrap",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    fontFamily: "inherit",
    background: "#FFFFFF",
  },
  searchInline: { display: "flex", gap: 8, flex: 1, minWidth: 220 },
  formActions: { display: "flex", gap: 8, marginTop: 10 },
  primaryButton: {
    padding: "10px 18px",
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
  pager: { display: "flex", gap: 12, alignItems: "center", marginTop: 16 },
  muted: { color: "#6B7280", fontSize: 14 },
  error: { color: "#DC2626", fontSize: 14, margin: "6px 0 0" },
  imageRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 2 },
  imagePreview: {
    width: 72,
    height: 72,
    borderRadius: 12,
    objectFit: "cover",
    border: "1px solid #D1D5DB",
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 12,
    border: "1px dashed #D1D5DB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    objectFit: "cover",
    display: "block",
  },
  thumbEmpty: {
    width: 40,
    height: 40,
    borderRadius: 8,
    background: "#F3F4F6",
  },
  imageControls: { display: "flex", flexDirection: "column", gap: 6 },
  uploadBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #6D28D9",
    color: "#6D28D9",
    background: "#F5F3FF",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  },
  removeBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#374151",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  importRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  importHeader: { marginTop: 12, marginBottom: 4 },
  selectAll: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    cursor: "pointer",
  },
  candidateList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 320,
    overflowY: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: 8,
  },
  candidateRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 4px",
  },
  candidateInfo: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  },
  candidateName: { fontSize: 14, fontWeight: 600, color: "#111827" },
  candidateCategory: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #D1D5DB",
    fontSize: 13,
    fontFamily: "inherit",
    background: "#FFFFFF",
  },
};
