# CI and Integration Audit

Last reviewed: 2026-09-23

## Purpose

This document records the current CI and pull-request integration review so improvements can be
handled incrementally instead of revisiting the entire system at once. Timing figures are samples
from recent GitHub Actions and PR checks and should be remeasured after material workflow changes.

## Executive summary

The core `CI` workflow usually completes in about 3.3 minutes of wall time, but it consumes roughly
18 runner-minutes because many jobs run in parallel. The largest visible PR delay is Lighthouse,
which previously ran three audits for each of three routes and commonly took 8–9 minutes.

The other major source of friction is integration volume. Repository-owned workflows expose about 15
PR checks, while external security scanners, coverage services, deployments, and AI reviewers can
raise the combined total to 25–30 checks and statuses. The resulting review noise and reconciliation
work can feel slower than GitHub Actions itself.

The recommended strategy is not to remove every overlapping tool immediately. Keep the reviewers
that currently provide the best practical signal, reduce obvious duplication, and measure whether
the remaining services continue to catch distinct defects.

## Current timing baseline

Recent sampled workflow durations:

| Workflow                     | Typical wall time |
| ---------------------------- | ----------------: |
| CI                           |      ~3.3 minutes |
| Security                     |      ~1.8 minutes |
| PR Checks without Lighthouse |      ~1.1 minutes |
| PR Checks with Lighthouse    |      ~8–9 minutes |
| Release after merge          |      ~9.3 minutes |

Approximate CI job durations:

| Job            | Typical duration |
| -------------- | ---------------: |
| Fallow audit   |      0.7 minutes |
| Lint & Format  |      1.3 minutes |
| Type Check     |       1.0 minute |
| Test shard 1   |      2.6 minutes |
| Test shard 2   |      2.6 minutes |
| Test shard 3   |      2.9 minutes |
| Test shard 4   |      3.1 minutes |
| Validate/build |      1.1 minutes |
| Supabase DB    |      2.6 minutes |
| Systems drift  |      0.2 minutes |
| Workers        |      0.7 minutes |

The four test shards keep wall time low but repeat checkout, Node/pnpm setup, dependency installation,
coverage generation, and Codecov uploads. Recent CI runs averaged approximately 18.2 runner-minutes
for 3.3 minutes of wall time.

## AI reviewer assessment

Reviewer quality changes over time, and rate limits matter as much as theoretical finding quality.
The current operational assessment is:

### Keep automatic: Cubic

Cubic is currently the most consistent and actionable reviewer. It frequently finds correctness,
accessibility, test-contract, and documentation-drift issues. It should remain the primary automatic
AI reviewer while its practical signal remains strongest.

The main concern is occasional delayed or stale review completion. It should not be made an
indefinite hard merge blocker without a documented timeout or review-exception process.

### Keep automatic or targeted: Greptile

Greptile has produced solid correctness findings, including state-management, configuration, and CSP
issues. It generally produces fewer findings than Cubic but can provide useful independent coverage.
Keep it as a secondary reviewer for now and reassess after collecting a larger sample of unique versus
duplicate findings.

### Keep available, but do not rely on it: CodeRabbit

CodeRabbit has produced useful security, correctness, and migration-contract findings. However, it is
frequently rate-limited, so it should not be the sole automatic reviewer or a required dependency for
normal merge throughput. Keep it enabled if its current plan allows useful opportunistic reviews, but
do not design the review gate around guaranteed completion.

### Disabled: Kilo Code

Kilo Code was disabled because its finding rate and quality were low relative to the review noise it
added. Leave it disabled unless a future product change justifies another controlled trial.

### Candidates to remove or disable

- **CodeAnt AI Review:** overlaps with Cubic, Greptile, and CodeRabbit while CodeAnt also creates
  several separate quality/security status contexts.
- **Gitar automatic review:** it has found valid issues, but its distinct value should be measured
  against the stronger current reviewers. It is a likely removal candidate if review noise remains
  high.
- **Copilot automatic review:** keep disabled unless deliberately tested against the retained
  reviewers.

### Recommended reviewer policy

Use Cubic as the primary automatic reviewer, Greptile as the secondary reviewer, and CodeRabbit as
best-effort coverage when it is not rate-limited. Do not require all reviewers to complete before
merge. Track unique actionable findings by reviewer over 20–30 PRs, then remove any reviewer whose
findings are mostly duplicates, invalid, or stylistic noise.

## Lighthouse

### Finding

The previous configuration used:

- three routes: `/`, `/tasks`, and `/hideout`
- three runs per route
- nine complete Lighthouse audits per selected job

A sampled run spent over six minutes in Lighthouse collection and approximately eight minutes in the
full job. This was the dominant PR wall-clock bottleneck.

### Implemented improvement

`lighthouserc.json` now sets `numberOfRuns` to `1`. Each selected route is audited once per
Lighthouse job, reducing that job from nine audits to three. Changes to `lighthouserc.json` or the PR
Checks workflow also trigger Lighthouse so the gate validates its own configuration before merge.

A single collection is sufficient as the normal regression gate. The `/hideout` performance floor
remains 0.20 so the job retains meaningful regression coverage. When a failure appears close to a
threshold, repeated local or manually dispatched runs should determine whether it is a real
regression or runner variance.

### Possible next improvement

The current path gate runs Lighthouse for any change below `app/components/` or `app/features/`, even
when the change cannot affect the three audited routes. A future change can map changed files to
specific routes and audit only the affected route. The full three-route repeated benchmark can run
nightly or manually for dedicated performance analysis.

## Repository-owned CI improvements

### High value

1. **Path-gate domain jobs.** Run Supabase validation for database changes, Worker validation for
   Worker/shared API changes, and app build/tests for app or dependency changes.
2. **Add aggregate required checks.** Expose a stable `CI Success` result instead of requiring every
   matrix job by name.
3. **Remove duplicate Node setup.** Most jobs call `actions/setup-node` once for Node and again for
   pnpm caching. Consolidate this into one setup path.
4. **Avoid duplicate release validation.** The release workflow reruns tests, Supabase validation,
   and build for the same `main` commit already checked by CI.
5. **Simplify Dependabot auto-merge.** Replace the hard-coded polling loop with GitHub native
   auto-merge after a short eligibility workflow and stable required checks.

### Medium value

1. Test whether two Vitest shards provide a better runner-time versus wall-time balance than four.
2. Reduce per-shard coverage formats and Codecov uploads if the extra reports are not used.
3. Run the blank-line lint once in `Lint & Format`; current scripts cause it to run twice.
4. Measure whether Fallow finds unique defects before deciding whether it belongs on every PR.

## Security and quality integrations

### CodeQL

Verified against GitHub on 2026-09-23, including PR #912:

- The repository's CodeQL **default setup is `not-configured`**. The default-setup API also returns
  language/query-suite metadata, but `state: not-configured` and `updated_at: null` mean that
  metadata is not an active second configuration.
- The active analysis is the version-controlled `Security / CodeQL` job in
  `.github/workflows/security.yml`. It uses pinned CodeQL Action v4.38.0, analyzes
  `javascript-typescript` with `security-extended`, uploads through the GitHub code-scanning
  integration, and fails the job if analysis fails. It has no `paths`/`paths-ignore` filters or
  explicit build-mode input. `CI` calls the security workflow for PRs, main pushes, and dispatches;
  the security workflow also has its weekly schedule. The caller does not exclude fork PRs, so
  they still invoke this job; the GHAS default-setup state does not control fork coverage.
- The latest 100 code-scanning analyses contained 52 CodeQL records, all under the single category
  `.github/workflows/ci.yml:codeql`. No second active CodeQL analysis or distinct query set appeared
  in that history. The alert API returned 0 open and 7 closed CodeQL alerts at the time of review;
  because there is no second active configuration, unique findings between two configurations
  cannot be compared.
- The standalone `CodeQL` item in the PR checks UI is generated by the GitHub Advanced Security app
  (app id `57789`; Actions lists its dynamic workflow as
  `dynamic/github-code-scanning/codeql`). On PR #912 it was **neutral**, with a warning that it
  could not compare introduced alerts because the base had a configuration named
  `.github/workflows/security.yml:codeql` that was absent from the PR analysis. This is a
  code-scanning reporting/configuration comparison, not evidence of a second CodeQL scan. The
  actual PR scan was `Security / CodeQL` and uploaded as `.github/workflows/ci.yml:codeql`.
- The live `Main CI freshness` ruleset directly requires `CI Result` and `Preview Result`, not a
  raw CodeQL check. `CI Result` still requires the reusable `Security` workflow to succeed, so
  CodeQL execution remains a blocking part of CI. Dependabot is separate and is unaffected by
  CodeQL setup.

**Decision:** Keep the checked-in workflow. No GitHub setting should be changed: default setup is
already disabled, and removing the repository workflow would remove the only active CodeQL analysis
and its future SARIF uploads. The neutral standalone check should be investigated as a configuration
comparison warning if it persists; it is not a duplicate scanner to disable.

**Operator setting and rollback:** If a future audit finds default setup enabled and redundant,
disable it at repository **Settings → Security → Code security and analysis → CodeQL analysis →
Configure → Disable default setup**. Verify the API returns `state: not-configured` and confirm the
workflow analysis still appears. To roll back that setting, re-enable default setup for
JavaScript/TypeScript with the extended query suite; do not leave it enabled alongside the checked-in
workflow unless a distinct-coverage review justifies both.

### Dependency and supply-chain scanning

The repository currently has overlapping coverage from Dependabot, `pnpm audit`, Socket, Snyk, and
CodeAnt SCA.

Recommended core set:

- Dependabot for vulnerability alerts and update PRs
- Socket on dependency-manifest changes for supply-chain behavior analysis
- production-critical `pnpm audit` as a simple hard gate if desired

Candidates to disable:

- CodeAnt SCA
- Snyk PR checks, unless its dashboard and remediation flow are actively used
- non-blocking `pnpm outdated` in the security workflow, because Dependabot already performs update
  discovery

### CodeAnt

CodeAnt currently overlaps with existing systems across AI review, SAST, SCA, coverage, and general
quality gates. It is the strongest full-removal candidate:

| CodeAnt function | Existing coverage                      |
| ---------------- | -------------------------------------- |
| AI review        | Cubic, Greptile, CodeRabbit            |
| SAST             | CodeQL                                 |
| SCA              | Dependabot, Socket, `pnpm audit`, Snyk |
| Test coverage    | Codecov                                |
| Quality gates    | ESLint, TypeScript, Fallow, SonarCloud |

### SonarCloud

The project uses automatic analysis with a rolling 30-day new-code period
(`sonar.leak.period=30`, `sonar.leak.period.type=days`). Do not use `previous_version` unless
analysis supplies a reliable release version. These settings live in SonarCloud project settings.

The project overrides `sonar.plsql.file.suffixes` to `tab,pkb`, removing the inherited `sql`
suffix: repository SQL is PostgreSQL, not Oracle PL/SQL. Database validation remains owned by
`pnpm run supabase:check` and migration review; do not exclude Supabase TypeScript from analysis.
Applied migrations are immutable. Review historical style findings individually and document
accepted findings in SonarCloud rather than rewriting migration history or weakening the gate.

Keep provisionally if it catches maintainability or correctness issues not enforced by ESLint and
CodeQL. Remove it if a review of recent findings shows that it only repeats local lint rules.

### Gitleaks

Keep. It covers committed-secret detection, which is distinct from linting, SAST, and AI review. The
current pinned, checksum-verified installation and redacted report handling are appropriate.

## Useful integrations to retain

- **Cloudflare Pages:** preview deployments are useful for real UI verification.
- **Codecov patch coverage:** useful if reviewers act on coverage regressions; PR comments can be
  disabled if the check alone is sufficient.
- **Link Check:** fast, path-scoped, and clearly actionable.
- **Supabase Preview:** useful when database changes are present; scope it in the integration
  dashboard if possible.
- **Dependabot:** useful, though its custom auto-merge workflow should be simplified.
- **Stale workflow:** does not affect PR latency; retain only if its issue-closing policy matches
  project governance.

## Suggested target PR experience

A normal PR should aim for a small set of meaningful top-level results:

1. CI
2. Security
3. PR metadata
4. Lighthouse when relevant
5. Cloudflare Pages preview
6. Cubic review
7. Greptile review
8. CodeRabbit when available
9. Codecov patch coverage
10. SonarCloud, if retained

Internal jobs can remain parallel, but a stable aggregate result should prevent the branch rules and
Dependabot automation from depending on every individual shard name.

## Prioritized backlog

### Completed

- [x] Reduce Lighthouse from three runs per route to one.
- [x] Disable Kilo Code Review.

### Next

- [x] Audit duplicate CodeQL: default setup is not configured; retain the repository workflow and
      treat the standalone GitHub Advanced Security item as a reporting/configuration check.
- [ ] Disable CodeAnt AI/quality/security/coverage checks.
- [ ] Decide whether Gitar adds enough unique findings to retain.
- [ ] Add stable aggregate CI and security status checks.
- [ ] Configure required checks in the `main` ruleset.

### After that

- [ ] Path-gate Supabase, Workers, build, tests, and dependency security jobs.
- [ ] Consolidate repeated Node/pnpm setup.
- [ ] Remove duplicate test/build/Supabase work from the release workflow.
- [ ] Replace Dependabot's hard-coded check polling with native auto-merge.
- [ ] Trial two Vitest shards and compare wall time, runner time, and reliability.
- [ ] Audit Codecov formats and test-result uploads for actual usage.
- [ ] Scope Lighthouse to affected routes or move full repeated benchmarking to a schedule.

## Expected outcome

The one-run Lighthouse change should substantially reduce UI PR latency immediately. The larger
integration cleanup should reduce visible checks, duplicate findings, rate-limit dependency, and
review reconciliation work. Workflow refactoring can then lower runner use and release latency
without sacrificing the checks that catch real defects.
