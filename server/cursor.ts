// Opaque keyset cursor for recency-ordered feeds (posts now; chat/events later).
// Encodes the last row's (createdAt, id); clients pass `nextCursor` back verbatim
// and never parse it (docs/API.md §1). decodeCursor is defensive — any malformed
// payload returns null so the route can answer 400, never 500.

export type Cursor = { createdAt: Date; id: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  const raw = `${cursor.createdAt.toISOString()}|${cursor.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

// Returns null for anything that isn't a well-formed cursor (bad base64, wrong
// shape, invalid date, non-UUID id). Callers treat null as a 400.
export function decodeCursor(value: string): Cursor | null {
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const iso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!UUID_RE.test(id)) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    // Round-trip guard: reject values whose ISO form doesn't match (e.g. "5").
    if (createdAt.toISOString() !== iso) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
