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
   authorized, merge it and follow the post-merge ledger transition below. Do not start another
   slice in that run. If merge is not authorized, leave it
   `pr_open` with `notes: ready_to_merge` and do **not** open overlapping work.
4. **Refresh evidence.** Run the repository-supported analysis and record notable deltas in the
   queue. Do not invent new thresholds; use `.fallowrc.json` as configured.

   ```bash
   pnpm run lint:fallow --base origin/main --format json
   pnpm exec fallow health --hotspots --targets
   pnpm exec fallow health --complexity --sort severity
   pnpm exec fallow dupes
   pnpm exec fallow dead-code
   ```

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
9. **PR lifecycle.** Keep implementation changes and their audit evidence atomic in the same PR.
   Monitor CI and automated reviewers, fix legitimate findings, and resolve threads only after the
   concern is addressed. Completion evidence necessarily follows the merge and uses the separate
   ledger-only transition below; never predict a successful merge or check.
10. **Hand off.** Update `audit-plan.yaml` with the actual status, PR number, `last_reviewed_commit`
    (the audited base SHA while open), `metrics_before` from selection time, `metrics_after` measured
    on the stabilized branch, findings, and any new queue items discovered. Measurements are not
    completion evidence: `pr_open` stays open until every completion criterion passes. Record
    outstanding checks/reviews and their URLs when blocked. Stop; do not begin the next slice.

## Post-merge ledger transition

The implementation PR keeps `status: pr_open` through merge. A later **ledger-only run** resumes
that same slice, fetches `origin/main`, confirms the merge SHA, verifies successful post-merge
checks for that SHA and checks on current `main`, and re-verifies the relevant `metrics_after`.
If main has materially changed the audited paths, investigate that change before claiming the
measurements still apply. Pending or failed checks keep the item `pr_open` with a precise blocker.

Only after that evidence exists, open a focused ledger-only follow-up PR setting `status: completed`,
`last_reviewed_commit` to the verified merge SHA, and recording the implementation PR, check URLs,
and measured outcomes. This exception to same-PR atomicity records an already-verified outcome; it
must not carry another implementation slice. Validate and merge the ledger follow-up through normal
CI/review gates, leaving its URL in the handoff if it cannot finish. Future runs finish any outstanding
ledger PR before selecting more work. Do not push ledger updates directly to `main` or bypass checks.

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
- The implementation PR is merged (squash, matching repository convention), post-merge checks are
  verified, and the ledger-only completion update has passed its normal PR gates. If merge is not
  authorized, leave the item `pr_open` with `notes: ready_to_merge`; that is not `completed`.

## Re-audit rule

Do not repeat a `completed` audit unless the item's `paths` have materially changed since
`last_reviewed_commit` (check with `git diff --stat <sha>..origin/main -- <paths>`).
