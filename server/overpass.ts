import type { SafePlaceCategory } from "@shared/types";

// OpenStreetMap Overpass client (slice SP-2) — powers the admin "Import from OSM"
// search. We send only a CITY NAME + a category (→ OSM tag filters); NO user PII
// ever leaves the server. Overpass is a third-party sub-processor (venue data
// only) — see COMPLIANCE_AND_PRIVACY.md. The result is a normalized candidate
// list the admin curates before any write.

// Overpass is a free, shared public service whose main endpoint round-robins
// across backends of varying load — a single try often lands on a busy one that
// returns 429/504 (or is simply slow), which is why an un-retried search "works
// on the 3rd click". We retry server-side, rotating across mirrors, so the admin
// never has to. Endpoints are tried in order across attempts.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// The client timeout MUST exceed the query's own `[timeout:25]` compute budget
// (below) plus transport — otherwise a slow-but-valid response is aborted before
// it arrives (the original 15s bug). A busy backend usually 429/504s fast, so
// this full wait only elapses on a genuine hang, after which we rotate.
const TIMEOUT_MS = 27_000;
const MAX_ATTEMPTS = 3; // total tries across endpoints before giving up
const RETRY_BASE_MS = 500; // backoff doubles per attempt (0.5s, 1s, …)
const MAX_RESULTS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OsmCandidate = {
  osmId: string; // "node/123" | "way/…" | "relation/…"
  name: string;
  category: SafePlaceCategory;
  address: string | null;
  latitude: number;
  longitude: number;
};

// Thrown when Overpass is unreachable/slow/erroring. The route maps it to a 502
// + a friendly (Polish, client-side) message. The raw body is never logged.
export class OverpassError extends Error {}

// Each category maps to one or more OSM tag filters (key + accepted values).
// Deliberately venue-TYPE tags (never identity). The admin can re-tag any row
// after the search, so a loose match is fine.
const CATEGORY_TAGS: Record<
  SafePlaceCategory,
  { key: string; values: string[] }[]
> = {
  cafe: [{ key: "amenity", values: ["cafe"] }],
  club: [{ key: "amenity", values: ["nightclub"] }],
  bar: [{ key: "amenity", values: ["bar", "pub"] }],
  ngo: [
    { key: "office", values: ["ngo", "association"] },
    { key: "amenity", values: ["social_centre"] },
  ],
  health: [
    { key: "amenity", values: ["clinic", "doctors", "pharmacy", "hospital"] },
  ],
  community_center: [
    { key: "amenity", values: ["community_centre", "social_centre"] },
  ],
  education: [
    { key: "amenity", values: ["school", "college", "university", "library"] },
  ],
  service: [{ key: "amenity", values: ["social_facility"] }],
  other: [{ key: "amenity", values: ["community_centre"] }],
};

// Escape a value going into a double-quoted Overpass QL string (prevents the
// admin-supplied city from breaking out of / injecting into the query).
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// City name tags to match the administrative area against. OSM stores the
// LOCAL/native name in `name` (Warsaw → "Warszawa"); English and alternate
// spellings live in these companions, so matching all of them lets an admin
// type either "Warszawa" or "Warsaw" (or "Cracow" for Kraków).
const CITY_NAME_TAGS = [
  "name",
  "name:en",
  "int_name",
  "official_name",
  "alt_name",
] as const;

function buildQuery(city: string, category: SafePlaceCategory): string {
  // EXACT (`=`) match per name tag — this uses Overpass's name index and returns
  // in seconds. A case-insensitive regex (`~"^…$",i`) here disables that index
  // and makes a city-wide area lookup take 40s+, blowing the client timeout
  // ("overpass_unreachable"). Exact is case-sensitive, but OSM city names are
  // canonically capitalised and admins type them that way; the multi-tag union
  // still resolves both native ("Warszawa") and English ("Warsaw") spellings.
  const c = esc(city.trim());
  const areaUnion = CITY_NAME_TAGS.map(
    (tag) => `area["${tag}"="${c}"]["boundary"="administrative"];`,
  ).join("");
  const stmts: string[] = [];
  for (const f of CATEGORY_TAGS[category]) {
    const alt = f.values.map(esc).join("|");
    // node + way for each filter, restricted to the named admin area.
    stmts.push(`node["${f.key}"~"^(${alt})$"](area.a);`);
    stmts.push(`way["${f.key}"~"^(${alt})$"](area.a);`);
  }
  return [
    "[out:json][timeout:25];",
    // Union of the same area matched on each name tag → one area set `.a`.
    `(${areaUnion})->.a;`,
    `(${stmts.join("")});`,
    `out center ${MAX_RESULTS};`,
  ].join("\n");
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function toAddress(tags: Record<string, string>): string | null {
  const parts = [
    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// One Overpass request against a single endpoint. Returns the raw elements or
// throws OverpassError on any transport/HTTP/timeout/parse failure (all of which
// are treated as retryable for a server-generated query).
async function fetchOverpassOnce(
  endpoint: string,
  query: string,
): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "Blis-Q admin/1.0",
      },
      body: query,
      signal: controller.signal,
    });
  } catch {
    throw new OverpassError("overpass_unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new OverpassError(`overpass_status_${res.status}`);

  try {
    const data = (await res.json()) as { elements?: OverpassElement[] };
    return data.elements ?? [];
  } catch {
    throw new OverpassError("overpass_bad_json");
  }
}

// Query Overpass for venues in `city` matching `category`. Returns normalized,
// named, coordinate-bearing candidates (elements without a name or coords are
// dropped). Retries transient failures with backoff across mirror endpoints;
// throws OverpassError only after every attempt is exhausted.
export async function searchOverpass(
  city: string,
  category: SafePlaceCategory,
): Promise<OsmCandidate[]> {
  const query = buildQuery(city, category);
  let elements: OverpassElement[] | null = null;
  let lastErr: OverpassError = new OverpassError("overpass_unreachable");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      elements = await fetchOverpassOnce(endpoint, query);
      break;
    } catch (err) {
      lastErr =
        err instanceof OverpassError
          ? err
          : new OverpassError("overpass_unreachable");
      // Back off before the next endpoint/attempt (skip the wait after the last).
      if (attempt < MAX_ATTEMPTS - 1) await delay(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  if (elements === null) throw lastErr;

  const out: OsmCandidate[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lng === undefined) continue;
    out.push({
      osmId: `${el.type}/${el.id}`,
      name,
      category,
      address: toAddress(tags),
      latitude: lat,
      longitude: lng,
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
