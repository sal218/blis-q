---
name: slice
description: Start a new Blis-Q work slice — sync main, create a feat/ branch, and draft an implementation plan grounded in the roadmap / API contract / status. Use when the user says "start the next slice", "/slice <name>", or is about to begin a feature. Stops at the plan (no code) because plans go to Codex first.
---

Start a slice. Args: a short name and/or description of the work.

1. **Repo hygiene:** `git checkout main && git pull --ff-only`. Confirm a clean
   tree and report the tip SHA. NEVER commit to `main`.
2. **Branch:** `git checkout -b feat/<kebab-name>` off updated main.
3. **Ground the plan in the source of truth** — read the relevant parts of
   `docs/ROADMAP.md` (the sprint), `docs/API.md` (the contract for the endpoints
   involved), `docs/STATUS.md` (what's done / in progress), and `CLAUDE.md`
   (security rules + issue tracker). Inspect the ACTUAL code/schema/storage you'll
   touch so the plan is accurate, not generic.
4. **Present a concise plan:** scope (in), endpoint/file list, out-of-scope /
   deferrals (with tracker IDs), and explicit **DECISION POINTS for Codex**, each
   with your recommendation.
5. **STOP — do not write feature code.** Blis-Q workflow: present plan → user
   runs it by Codex → Codex validates (often with refinements) → only then
   implement → run `/battery` → commit (co-author trailer:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`) →
   push → **no PR until Codex validates** → open PR + watch CI → `/docsync`.

Slices are small and single-purpose. Keep mobile UI faithful to `assets/*.png`
(light = mockup, dark = brand purple); the admin web is utilitarian/interim.
