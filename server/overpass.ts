import type { SafePlaceCategory } from "@shared/types";

// OpenStreetMap Overpass client (slice SP-2) — powers the admin "Import from OSM"
// search. We send only a CITY NAME + a category (→ OSM tag filters); NO user PII
// ever leaves the server. Overpass is a third-party sub-processor (venue data
// only) — see COMPLIANCE_AND_PRIVACY.md. The result is a normalized candidate
// list the admin curates before any write.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 100;

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

function buildQuery(city: string, category: SafePlaceCategory): string {
  const c = esc(city.trim());
  const stmts: string[] = [];
  for (const f of CATEGORY_TAGS[category]) {
    const alt = f.values.map(esc).join("|");
    // node + way for each filter, restricted to the named admin area.
    stmts.push(`node["${f.key}"~"^(${alt})$"](area.a);`);
    stmts.push(`way["${f.key}"~"^(${alt})$"](area.a);`);
  }
  return [
    "[out:json][timeout:25];",
    `area["name"="${c}"]["boundary"="administrative"]->.a;`,
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

// Query Overpass for venues in `city` matching `category`. Returns normalized,
// named, coordinate-bearing candidates (elements without a name or coords are
// dropped). Throws OverpassError on any transport/HTTP/timeout failure.
export async function searchOverpass(
  city: string,
  category: SafePlaceCategory,
): Promise<OsmCandidate[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "Blis-Q admin/1.0",
      },
      body: buildQuery(city, category),
      signal: controller.signal,
    });
  } catch {
    throw new OverpassError("overpass_unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new OverpassError(`overpass_status_${res.status}`);

  let data: { elements?: OverpassElement[] };
  try {
    data = (await res.json()) as { elements?: OverpassElement[] };
  } catch {
    throw new OverpassError("overpass_bad_json");
  }

  const out: OsmCandidate[] = [];
  for (const el of data.elements ?? []) {
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
