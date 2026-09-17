# Code Health Program

A long-running, systematic audit of the TarkovTracker codebase delivered as a sequence of small,
focused, production-ready pull requests. This directory is the **durable coordination state** for
the program: a fresh agent (or human) with no prior context must be able to read these two files,
sync with `main`, and resume correctly.

- `README.md` (this file) — goals, methodology, scope rules, completion criteria.
- `audit-plan.yaml` — machine-readable inventory of review areas and the work queue.

## Goals

- Review the entire repository over time using evidence-backed, independently reviewable slices.
- Fix root causes (duplication, divergence, god modules, weak types, dead paths), not metric
  symptoms. Metrics are signals, not targets; never make code worse to move a score.
- Leave no recurring CI/review debt: every slice ends merged (or explicitly awaiting merge) with
  green required checks and resolved review feedback.

## Methodology (one run = one slice)

1. **Sync.** Fetch `origin/main`. Work in a dedicated worktree/branch so unrelated local changes
   are never swept in.
2. **Read state.** Load `audit-plan.yaml`. Inspect open PRs labelled or titled with `code-health`
   / `CH-` ids.
3. **Finish before starting.** If the previous slice's PR has failing CI, unresolved actionable
   review threads, requested changes, or conflicts — fix that first. If it is clean and merge is
   authorized, merge it, verify `main`, mark it `completed`. If merge is not authorized, leave it
   `pr_open` with `notes: ready_to_merge` and do **not** open overlapping work.
4. **Refresh evidence.** Run the repository-supported analysis (`pnpm exec fallow health
--hotspots --targets`, `pnpm exec fallow health --complexity --sort severity`, `pnpm exec fallow
dupes`, `pnpm exec fallow dead-code`). Record notable deltas in the queue. Do not invent new
   thresholds; use `.fallowrc.json` as configured.
5. **Select one slice.** Highest-priority `queued` item whose `dependencies` are all `completed`.
   Set `status: in_progress` before substantial work.
6. **Deep review.** Trace callers, data flow, tests, lifecycle, and constraints in `AGENTS.md` and
   `docs/SYSTEMS.md` before changing anything. Identify the underlying cause of complexity.
7. **Implement.** Prefer deletion, consolidation, explicit boundaries, and better types. Preserve
   behavior unless fixing a verified defect; document intentional behavior changes in the PR and in
   `docs/SYSTEMS.md` when the system is non-obvious.
8. **Validate.** Narrow tests first, then the full required set for the touched surfaces (see
   `AGENTS.md` → Required validation). Never weaken tests, gates, thresholds, or Fallow config to
   pass.
9. **PR lifecycle.** Open a focused PR (`docs/code-health` changes ride along in the same PR so
   ledger and code stay atomic). Monitor CI and automated reviewers, fix legitimate findings, and
   resolve threads only after the concern is addressed.
10. **Hand off.** Update `audit-plan.yaml` with final status, PR number, `last_reviewed_commit`,
    metrics, findings, and any new queue items discovered. Stop; do not begin the next slice.

## Scope rules

- One cohesive slice per PR: a subsystem, a responsibility, an architectural problem, or a closely
  related family of files. Guideline: ≤ 10–15 production files and ≈ 500 changed production LOC
  unless the change is inherently atomic. If the proper fix is bigger, split into dependent queue
  items.
- Unrelated or cross-cutting discoveries become **new queue entries with evidence**, not scope
  creep — unless strictly necessary for the current slice's correctness.
- No drive-by formatting, renames, mass moves, dependency bumps, or API redesigns.
- Respect repository invariants (`AGENTS.md`): shared utilities under `shared/` must not import
  Nuxt or Worker runtime modules; no new runtime dependency on the removed task `alternatives`
  field; applied Supabase migrations are immutable; API gateway auth/quota ordering; etc.

## Prioritization evidence

Priority (`P0` highest → `P3`) is assigned from, in rough order: correctness/reliability risk,
security/authorization risk, behavioral divergence between competing implementations, Fallow
hotspot score (churn × complexity × fan-in), CRAP/cyclomatic outliers, duplication, god
files/modules, weak typing, brittle tests, unclear ownership. Each queue item records the concrete
evidence used so a future agent can re-check it cheaply.

## Statuses

| status        | meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `queued`      | Identified and prioritized; not started.                                 |
| `in_progress` | An agent is actively working this slice (branch exists, PR may not yet). |
| `pr_open`     | PR exists; CI/review in flight, or clean but awaiting authorized merge.  |
| `blocked`     | Cannot proceed; `notes` explains the blocker and what unblocks it.       |
| `completed`   | Merged to `main`, post-merge checks verified, ledger updated.            |

## Completion criteria for a slice

A slice is `completed` only when **all** of the following hold:

- Implementation is production-ready and behavior-preserving (or the behavior change is
  intentional, verified, and documented).
- All required validation for the touched surfaces passed locally, and the PR's required CI
  (`CI Result`) is green.
- Actionable human/automated review feedback is resolved by addressing the concern.
- `audit-plan.yaml` records the outcome, `pr`, `last_reviewed_commit`, before/after metrics, and
  any deferred findings as new queue items.
- The PR is merged (squash, matching repository convention) and `main` checks verified — or, if
  merge authorization is unavailable, the item is left `pr_open` with `notes: ready_to_merge`.

## Re-audit rule

Do not repeat a `completed` audit unless the item's `paths` have materially changed since
`last_reviewed_commit` (check with `git diff --stat <sha>..origin/main -- <paths>`).
