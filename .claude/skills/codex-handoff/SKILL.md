---
name: codex-handoff
description: Package the current branch for Codex review — branch + tip SHA, commits since main, files changed, verification battery results, and open decision points — formatted to paste into Codex. Use when the user says "hand off to Codex" / "package for Codex", or after finishing a slice's implementation.
---

Produce a tight, paste-ready Codex hand-off for the CURRENT branch. Gather:

- **Repo guard:** working dir, `git branch --show-current`, tip SHA
  (`git rev-parse --short HEAD`), and clean-tree check (`git status --short`).
- **Commits since main:** `git --no-pager log --oneline origin/main..HEAD`.
- **Files changed:** `git --no-pager diff --stat origin/main...HEAD` (summary).
- **Verification:** run `/battery` (or report the latest results) — list each
  check ✅/❌ with numbers (types, lint, test:client N/N, npm test, integration
  N suites/N tests, prettier, git diff --check, admin build / expo export).
- **What this slice does:** one or two lines.
- **Out of scope / deferred:** with tracker IDs (e.g. P-12/P-13) and target sprint.
- **Decision points:** the choices you made that Codex should confirm, each with
  a one-line rationale.

Format as a compact block the user can paste straight into Codex. Do NOT open a
PR — Blis-Q rule: no PR until Codex validates.
