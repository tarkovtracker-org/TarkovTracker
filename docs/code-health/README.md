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
2. **Read state.** Load `audit-plan.yaml`. Inspect open implementation and ledger PRs labelled or
   titled with `code-health` / `CH-` ids, and feedback on the previous slice's recorded PRs even
   when already merged. A local `completed` record does not replace these live checks.
3. **Finish before starting.** If the previous slice's implementation or ledger PR has failing CI,
   unresolved actionable review threads, requested changes, or conflicts — fix that first. If it
   is clean and merge is authorized, merge it and follow the post-merge ledger transition below.
   Do not start another slice in that run. If implementation merge is not authorized, leave it
   `pr_open` with `notes: ready_to_merge`. If ledger merge is not authorized, retain the proposed
   completion record and put the pending merge in the session handoff. Neither permits overlapping
   work.
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
   concern is addressed. When a review is required or requested, verify delivery for the relevant
   revision; no comments yet is not a completed review. Pending review requires a handoff and
   keeps the next-slice gate closed. This does not require additional review providers for
   documentation-only PRs.
   Completion evidence necessarily follows the merge and uses the separate ledger-only transition
   below; never predict a successful merge or check.
10. **Hand off.** Update `audit-plan.yaml` with the actual status, PR number, `last_reviewed_commit`
    (the audited base SHA while open), `metrics_before` from selection time, `metrics_after` measured
    on the stabilized branch, findings, and any new queue items discovered. Measurements are not
    completion evidence: `pr_open` stays open until the implementation completion criteria below
    are verified; only the ledger-only transition may then propose `completed`. Record implementation
    blockers in the ledger and the completion PR's live checks/reviews in the session handoff,
    including URLs. Stop; do not begin the next slice.

## Post-merge ledger transition

The implementation PR keeps `status: pr_open` through merge. A later **ledger-only run** resumes
that same slice, fetches `origin/main`, confirms the merge SHA, verifies successful post-merge
checks for that SHA and checks on current `main`, and re-verifies the relevant `metrics_after`.
If main has materially changed the audited paths, investigate that change before claiming the
measurements still apply. Pending or failed checks keep the item `pr_open` with a precise blocker.

Only after that evidence exists, prepare a focused ledger-only follow-up setting `status: completed`,
`last_reviewed_commit` to the verified **implementation** merge SHA, and retaining the implementation
PR in `pr`, alongside check URLs and measured outcomes. The proposed record describes verified
implementation completion, not the live state of the PR carrying it. Set it in the revision that
will receive normal PR validation; do not wait for that ledger PR to merge before setting it.
This exception to same-PR atomicity must not carry another implementation slice.

Validate and merge the ledger follow-up through normal CI/review gates, leaving its branch or URL
and pending checks/reviews in the **session handoff** if it cannot finish. GitHub is authoritative for
that PR's live state. Do not add a pending-merge field for the completion PR itself that would need
another PR solely to mark it merged. Recording an earlier ledger PR's already-observed merge is
valid historical evidence. Historical pending observations do not override a current handoff.

A subsequent run may select another slice only when the completion record is present on `main`,
the ledger PR's final required checks and resulting `main` checks are verified, required or requested
reviews have arrived for the relevant revision, and no outstanding ledger PR or actionable
implementation/ledger feedback remains. Inspect merged PRs too: a review
can arrive after merge. Finishing the ledger transition ends the run; do not start the next slice
in that run. Do not push ledger updates directly to `main` or bypass checks.

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
| `pr_open`     | Implementation PR or its post-merge evidence is not yet complete.        |
| `blocked`     | Cannot proceed; `notes` explains the blocker and what unblocks it.       |
| `completed`   | Verified implementation completion; next-slice gate below still applies. |

## Completion criteria for a slice

A ledger-only update may record `completed` only when **all** of the following implementation
completion criteria hold. This is distinct from authorization to begin the next slice:

- Implementation is production-ready and behavior-preserving (or the behavior change is
  intentional, verified, and documented).
- All required validation for the touched surfaces passed locally, and the PR's required CI
  (`CI Result`) is green.
- Actionable human/automated implementation review feedback is resolved by addressing the concern;
  required or requested reviews have been delivered for the relevant revision.
- `audit-plan.yaml` records the outcome, `pr`, `last_reviewed_commit`, before/after metrics, and
  any deferred findings as new queue items.
- The implementation PR is merged (squash, matching repository convention), and its post-merge
  checks and checks on current `main` are verified. If implementation merge is not authorized,
  leave the item `pr_open` with `notes: ready_to_merge`; that is not `completed`.

The **next-slice gate** additionally requires the ledger-only completion update to have passed its
normal PR gates and landed on `main`, with resulting checks verified and all actionable ledger
feedback addressed. A proposed `completed` record on an unmerged branch does not satisfy this gate.

## Re-audit rule

Do not repeat a `completed` audit unless the item's `paths` have materially changed since
`last_reviewed_commit` (check with `git diff --stat <sha>..origin/main -- <paths>`).
