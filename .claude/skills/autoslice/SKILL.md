---
name: autoslice
description: Run a Blis-Q slice end-to-end with an automated Codex review loop. Draft the plan, validate it with the Codex subagent until APPROVED, implement, run the battery, have Codex review the working tree until READY_FOR_PR, then STOP for the human's go before opening the PR. Use when the user says "/autoslice", "/autoslice <name>", or "run the next slice on autopilot". With no argument, propose the next slice from the roadmap first.
---

Run one Blis-Q work slice end-to-end with Codex as the in-loop reviewer, so the
human relays nothing between Claude and Codex. The human touches the loop exactly
twice: **picking the slice** at the start and **giving the go** before the PR.

Args: an optional short slice name/description. **No arg → run Step 0 first.**

The Codex reviewer is the `codex:codex-rescue` subagent. Its review standard is
the frozen brief at `.claude/skills/autoslice/CODEX_REVIEWER_BRIEF.md` (the
"objective" — read it once at the start and feed it verbatim into every Codex
call). The success bar is **Codex APPROVED + CI green on a clean checkout + the
human's go** — "Codex approved" alone is never the finish line.

---

## Step 0 — Propose the next slice (only when no arg was given)

If the user named a slice, skip to Step 1. Otherwise:

1. Read `docs/ROADMAP.md` (current sprint's remaining work), `docs/STATUS.md`
   (merged / in progress), and the `CLAUDE.md` issue tracker (pending P-items).
2. Surface the next **1–3 candidate slices**, each with a one-line rationale, and
   **flag which need human device/browser testing** (anything touching `client/`
   or `admin/` UI). Recommend one (put it first).
3. **STOP and let the human pick.** Do not start planning until they choose.

---

## Step 1 — Branch

Reuse `/slice` hygiene: `git checkout main && git pull --ff-only`, confirm a
clean tree, report the tip SHA, then `git checkout -b feat/<kebab-name>`. NEVER
commit to `main`.

## Step 2 — Draft the plan

Ground it in the source of truth (ROADMAP sprint, `docs/API.md` contract,
`docs/STATUS.md`, `CLAUDE.md` rules + tracker) and the ACTUAL code/schema/storage
you'll touch. The plan states: scope (in), endpoint/file list, out-of-scope /
deferrals (with tracker IDs), explicit decision points with your recommendation,
and a specific test plan (suites + exact edge cases). No vague "we'll test it."

## Step 3 — Plan review loop (Codex Mode A)

Repeat until `APPROVED`, capped at **4 rounds**:

1. Invoke the `codex:codex-rescue` agent. Its prompt = the full reviewer brief +
   `REVIEW MODE A — PLAN VALIDATION` + the repo guard (expected dir
   `C:\dev\blis-q`, branch `feat/<name>`, tip SHA) + the plan. Subagents start
   with **no memory of prior rounds**, so on every round re-feed the brief and a
   short "round N: you asked X, I changed Y" recap. **Always open the prompt with
   the synchronous-review instruction** (see Loop rules) so the agent returns the
   actual verdict, not a "I'll get back to you" placeholder.
2. Read the verdict. Relay a tight summary to the human (the agent's output is
   not shown to them).
   - `CHANGES_REQUESTED` → apply the fixes to the plan, then re-invoke.
   - `APPROVED` → proceed to Step 4.
3. **Pause-on-scope-change:** if Codex asks to change the slice's _scope_ (not
   just refine it), STOP and confirm with the human before accepting — scope is
   their call.

## Step 4 — Implement

Write the code to the approved plan and every repo standard (the brief's
non-negotiables). Tests ship with the code on the same branch.

## Step 5 — Battery

Run `/battery`: `check:types`, `lint`, `npm test`, the focused integration suite
for the slice, `prettier --check` on changed files, `git diff --check`. Fix until
green. For additive backend slices the full integration suite may be left to CI —
say so explicitly. Then commit (co-author trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`) and push,
so Codex reviews a real, committed diff.

## Step 6 — Working-tree review loop (Codex Mode B)

Repeat until `READY_FOR_PR`, capped at **4 rounds**:

1. Invoke `codex:codex-rescue` with the brief + `REVIEW MODE B — WORKING-TREE
REVIEW` + repo guard + the commit range, **opening with the synchronous-review
   instruction** (see Loop rules). Codex reads the actual diff and **runs the
   gates itself** — never accept "Claude said tests pass."
2. Read the verdict; relay a summary to the human.
   - `CHANGES_REQUESTED` → apply the P1/P2 fixes, re-run the battery, commit, then
     re-invoke.
   - `READY_FOR_PR` → proceed to Step 7.

## Step 7 — Round-cap escalation (overfitting guard)

If either loop reaches its 4-round cap without converging, **STOP and escalate to
the human**: surface Codex's open objection + your position and ask how to
proceed. Do NOT keep patching to satisfy the reviewer — many rounds is a smell
that the fix is a band-aid, not a root cause ("the more variants you try, the
higher the bar must climb"). Convergence speed is itself a quality signal.

## Step 8 — Human gate (mandatory, every slice)

On `READY_FOR_PR`, STOP. Present to the human: what Codex validated, residual
risks / CI notes, and the **drafted PR title + body**. Then wait.

- **Do NOT open the PR.** The human gives the final go.
- **UI-touching slices** (`client/` or `admin/`): the human must device/browser
  test before the go — say so explicitly.

## Step 9 — On the human's go

Open the PR (`gh pr create`) and watch CI to green. CI on a clean checkout is the
independent out-of-sample gate — not just Codex's approval. If CI fails, fix +
re-battery + (if material) re-run a Codex review round. Then `/docsync` if docs
need a follow-up pass.

---

## Loop rules (always)

- **Frozen objective:** feed the reviewer brief verbatim every Codex round; never
  paraphrase or weaken it.
- **Synchronous review (required):** every `codex:codex-rescue` prompt MUST open
  with a synchronous-execution instruction, e.g. _"Run the review synchronously
  and put the actual verdict in YOUR FINAL MESSAGE. Do NOT spawn a background
  task, do NOT defer, do NOT reply 'I'll return output when it completes.' If you
  invoke the codex CLI, run it in the foreground, wait for it, then summarise its
  verdict. Your final message MUST end with APPROVED/READY_FOR_PR or
  CHANGES_REQUESTED + findings."_ Without this the bridge may run codex in the
  background and return a placeholder; if that happens, re-invoke with this
  instruction.
- **No subagent memory:** re-pass the brief + round recap each call (subagents
  don't see prior rounds or this conversation).
- **Independent gate:** success = Codex APPROVED **and** CI green on a clean
  checkout **and** the human's go. Codex must run tests itself, not trust claims.
- **Caps over churn:** 4 rounds per loop, then escalate to the human.
- **Pause on scope changes;** the human owns scope.
- **Never auto-open a PR;** never run `db:push` or destructive DB commands inside
  the loop. Schema changes deploy via the safe flow in `docs/DEPLOY.md`, human-run.
- **Relay every Codex verdict** to the human in a short summary so they can watch
  and interrupt at any point. The named ChatGPT Codex threads are not updated by
  this loop — the review record lives in this session.
