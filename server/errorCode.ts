// Extracts a stable, NON-sensitive code for logging. Raw error objects/messages
// can carry emails, SQL details, connection strings, or request internals — never
// log those (CLAUDE.md §9). Lives in its own module so both the middleware layer
// (server/auth.ts) and the route layer (server/routes/*) can import it without a
// circular dependency (routes/auth.ts imports isAuthenticated from ../auth).
export function safeErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
    if (typeof code === "number") return String(code);
  }
  return "unknown";
}
