---
name: docsync
description: Update Blis-Q's living docs for the current work — STATUS.md (merged table + in-progress + endpoints-live), API.md (mark endpoints implemented, limiter list), and the CLAUDE.md issue tracker — in the established formats. Use when a slice lands/starts or the user says "update the docs".
---

Apply Blis-Q's "always update docs" rule for the current work. Edit only what
actually changed; keep diffs minimal and factual; convert relative dates to
absolute.

- **`docs/STATUS.md`:** update the `_Last updated_` line; move a merged PR into
  the "Merged to `main`" table; set the "In progress" section to the current
  branch with status + verification results; update the relevant "endpoints
  live" line and the sprint-completion summary.
- **`docs/API.md`:** mark implemented endpoints (✅ / "Implemented (slice …)").
  Keep paths **precise** — do not claim `/api/v1/admin/*` if the code serves
  `/api/admin/*`; note tracked path migrations rather than churning them. Add any
  new rate limiter to the §1 limiter list.
- **`CLAUDE.md` issue tracker:** add P-IDs for new deferrals / accepted risks and
  tick off resolved ones. `CLAUDE.md` is in `.prettierignore` (hand-maintained) —
  match the surrounding table/style by hand and do NOT run prettier on it.

Then run changed-file `prettier --check` on the docs you edited (except
CLAUDE.md) and `git diff --check`.
