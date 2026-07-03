// Escapes the LIKE/ILIKE metacharacters (`%` `_`) and the escape char (`\`) in a
// user-supplied search term so they match LITERALLY inside a `%...%` pattern.
// Postgres LIKE/ILIKE uses backslash as the default escape character, so
// prefixing each metachar with a backslash is sufficient (no explicit ESCAPE
// clause needed). The term is already a bound parameter — this is NOT about SQL
// injection (there is none), only about `%`/`_` acting as unintended wildcards
// (INJ-02). Its own module so it stays trivially unit-testable (no DB import).
export function likeEscape(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => "\\" + ch);
}
