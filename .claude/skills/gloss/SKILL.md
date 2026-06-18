---
name: gloss
description: Print an English translation table for the Polish user-facing strings in the current diff (the app ships Polish copy; the maintainer doesn't read Polish). Use when handing off UI work or when the user asks "what do these say".
---

Scan the current work for Polish user-facing strings added or changed in this
slice — primarily `client/i18n/pl.ts` and any changed `*.tsx` copy (and admin
`*.tsx` labels). Produce a two-column table: **Polish → English gloss**.

- Cover button labels, placeholders, error messages, headings, and nav labels.
- Do NOT translate code identifiers, keys, or comments.
- Preserve interpolation tokens (`{count}`, `{min}`, etc.) in the gloss.
- Keep it tight and skimmable — it's a hand-off aid, not documentation.

Use `git --no-pager diff origin/main...HEAD -- client/i18n/pl.ts` (and grep
changed `.tsx` for Polish literals) to find what's new in this slice rather than
translating the whole file.
