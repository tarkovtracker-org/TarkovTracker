# CI and release

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Test suite execution model

Test **files** run in parallel, each in its own forked worker. `vitest.config.ts` sets
`pool: 'forks'` with `isolate: true`, and Vitest's pool only reuses a runner while `isolate` is
false, so an isolated file always gets a fresh process and no module state crosses file boundaries.
The worker count stays bounded (`process.env.CI ? 4 : 8`) because an unbounded count multiplies
Nuxt environments and worker-teardown pressure. `pnpm run test` and `pnpm run test:coverage`
inherit that bound instead of passing a worker flag, since a CLI flag would override the config.

CI splits the suite across four coverage shards. The `VITEST_SHARD` variable — not the `--shard`
argument alone — selects sharded coverage mode, which drops the global and per-file thresholds
because one shard exercises only part of the suite; the unsharded `test:coverage` run enforces
them. The `Test (shard N/4)` check names and the shard command are contract: branch protection and
`dependabot-auto-merge.yml` require those names, and `scripts/workflow-tests/workflows.mjs` asserts the
command.

A component loaded through `defineAsyncComponent` starts its dynamic import when Vue first renders
it. A test-harness `stub` replaces what renders but does not cancel that loader, so a real module
can still resolve after the file's environment is torn down and fail the run with
`EnvironmentTeardownError`. A test that mounts such a component mocks the lazily imported module, so
the loader never reaches a real import.

### Invariants

- Every test file gets a fresh worker. `isolate: true` is what guarantees that, so no run may leave
  runner reuse enabled for isolated files.
- The worker count stays bounded. Removing the cap trades deterministic teardown for higher peak
  memory and teardown-error risk.
- Unhandled errors fail the suite. Do not restore `--dangerouslyIgnoreUnhandledErrors`; fix the
  lifecycle that produced the error instead.
- Shard count, shard command, and the `Test (shard N/4)` check names stay stable. Changing them
  requires updating branch protection and `scripts/workflow-tests/workflows.mjs` together.
- Coverage thresholds apply only to the unsharded run, and `VITEST_SHARD` decides that. A sharded
  invocation must set it or the run enforces thresholds it cannot satisfy.
- A test mounting a `defineAsyncComponent` must not let the real module load, or must settle the
  load before the file ends.
- Per-test timeouts stay scoped to the test that needs them; suite-wide timeouts are not raised to
  absorb contention.

### Files

- `vitest.config.ts` — pool, isolation, bounded workers, coverage thresholds, shard mode
- `package.json` — `test`, `test:coverage`, and `test:api-gateway` scripts
- `.github/workflows/ci.yml` — the four shard jobs and the Deno test step
- `scripts/workflow-tests/workflows.mjs` — asserts the shard command and required check names
- `tests/test-setup.ts` — shared fetch stubs, console filtering, auto-unmount

## CI validation selection

`scripts/ci/validation-plan.mjs` classifies Git paths and validates aggregate outcomes;
`scripts/ci/validate-changes.mjs` exposes local execution and CI outputs;
`scripts/ci/check-ci-result.mjs` enforces outcomes in `.github/workflows/ci.yml`.

The selection reduces checks only for explicitly recognized documentation paths and Crowdin-owned
translation files. `DESIGN.md`, the source locale `app/locales/en.json`, unknown inputs, and
executable changes select full validation. Local input includes
committed and dirty paths; CI input is the explicit revision diff. Renames contribute both paths.
Pull requests receive the selected jobs; the classifier also reports `workflows` so workflow
linting runs only for non-Markdown automation paths and unreadable diffs, and an independent
`previewRequired` decision (`preview` output): only a change set that cannot reach the deployed
Pages output needs no deployable preview — Markdown outside `public/`, `.github/`, `docs/`,
`tests/`, repository tooling configuration, and `scripts/` apart from `scripts/preview/`.
Translations, build configuration, dependencies, application code, `public/`, `shared/`,
Supabase, Workers, and unknown or unreadable paths require one, so translation-only pull requests
keep the reduced test selection but add the `validate` build job. The `security` job (reusable
`.github/workflows/security.yml`: production dependency audit at the critical threshold, Gitleaks,
CodeQL) is selected on every CI run. See
`docs/workflow-automation.md` for the recorded rollout evidence and local/full execution profiles.

### Invariants

- Pushes and dispatches retain full validation; only pull requests receive reduced selection.
- Reduced selection never applies to `app/locales/en.json`; only non-English translations qualify.
- Nested `AGENTS.md`/`CLAUDE.md` instruction files count as documentation, except under `public/`,
  where they would ship as site assets. `format:check` covers them at every depth.
- Empty, unreadable, or malformed diffs select full validation, workflow linting, and a preview.
- Missing classifier output or selected jobs that fail, cancel, or unexpectedly skip fail CI Result.
- Only deliberately unselected jobs may report skipped; systems drift and security always run.
  Scanner errors, cancellation, or a missing security result fail `CI Result`; the
  development-dependency audit is informational and never gates.
- `previewRequired` is independent of `full`: a translation-only plan is reduced yet builds.
- Existing shard discovery, coverage enforcement, secret restrictions, and merge governance remain.
- Dependabot auto-merge requires the immutable Dependabot account ID for both the PR author and
  event actor; the actor restriction alone never establishes trust.
- The aggregate covers repository CI jobs, not independently reported Security or Codecov statuses.

Agent review request coordination (`scripts/codex-review/codex-review.mjs`) is specified in
[the review workflow](../workflow-automation.md#codex-request-deduplication-and-waiting).

## Fallow audit snapshots

**Summary.** Local and CI `lint:fallow` commands use `scripts/checks/fallow-audit.mjs` to create a
disposable clone with two analysis commits. The merge-base source and current working source
both receive physical copies of the same generated `.nuxt` context, so relative aliases resolve
consistently in Fallow's base snapshot. Installed dependencies are linked into the clone.

Candidate source files come from the original checkout's Git index and non-ignored untracked
file list. This retains staged and unstaged source content, honors repository-local and configured
exclusions, and includes force-tracked ignored files. A separate temporary index constructs the
analysis head. Native new-only attribution and configured severities determine the exit status.
See [the workflow guide](../workflow-automation.md#fallow-changed-file-gate) for usage and report IDs.

### Invariants

- Source files, the source index, branches, and worktree registrations remain unchanged.
- Both analysis commits contain the same physical generated context; no persistent finding
  baseline or suppression changes the gate.
- Invalid refs, missing setup, and analyzer errors fail explicitly; temporary snapshots are
  removed in a `finally` block on success or failure.
- Local Git exclusions apply to untracked candidates without dropping tracked source files.

## Release validation and publication

Release runs on a weekly schedule or explicit dispatch on `main`, batching every commit since the
previous tag; deploys never wait for it. `scripts/release/release-gate.mjs` takes the run's trigger commit
as the candidate, requires the newest same-repository main CI run (push or dispatch of
`.github/workflows/ci.yml`) for that exact SHA to have succeeded, and checks current main before
setup and immediately before publishing, reusing CI's test shards and database validation. The
checkout stays pinned to the validated SHA. The production build still runs in Release.

### Invariants

- Only `schedule` and `workflow_dispatch` runs on `refs/heads/main` can publish. Fork, PR, staging
  branch, unsuccessful, unfinished, or superseded CI cannot authorize publication; when several
  trusted CI runs exist for the candidate, the newest decides.
- `scripts/release/release-scope.mjs` removes commits whose header scope (or the header wrapped by any
  number of `Revert "…"` / `revert:` prefixes) is in `INTERNAL_SCOPES` before both commit analysis and note generation.
  Those commits never set the version type (including breaking-change markers) and never appear in
  `CHANGELOG.md` or GitHub releases; they still deploy. Unscoped and product-scoped commits keep
  the stock Angular rules, except that `refactor` and `docs` no longer release.
- Release-note highlights (`scripts/release/release-highlights.mjs`) are the only release input read from
  mutable GitHub content. They are additive and fail open: a lookup error, timeout (10 s), missing
  token, unmerged PR, an unedited description whose author lacks current write access,
  an edited description whose last editor lacks current write access (check the selected actor's
  effective collaborator `permission` for `write` or `admin`, including `maintain` and custom
  roles), or a description edited
  at or after `mergedAt` (equal second-precision times are ambiguous) skips that note and never
  blocks or alters versioning. At most 3 notes per PR and 5 per release are published; 5 is the
  in-app changelog's per-release bullet limit and Highlights are listed first. Trusted commit
  links retain each highlight's in-range commit identity so the changelog does not repeat those
  commits in its fallback; SHAs come from release commits, never PR bodies. The CommonMark AST
  selects a root-level `## Release note(s)` heading through the next root-level `#` or `##`
  heading. HTML and comment nodes, plus fenced code blocks, are masked by source offsets while
  preserving line breaks, so fake headings inside raw HTML or examples cannot open or close the
  section. Notes are reduced to plain text (no link syntax, URLs, HTML, or Markdown emphasis);
  only top-level bullets are highlights and their wrapped, nested, or indented content stays with
  the parent bullet. An indented-only block remains one prose note. Parsing is bounded before
  sanitization — PR text within GitHub's
  body limit, each bullet within `MAX_RAW_NOTE` code points, autolinks detected per
  whitespace-delimited token with no superlinear matching — so untrusted text cannot stall the
  release. Lookups run in commit order with bounded concurrency (`MAX_CONCURRENT_LOOKUPS`
  requests in flight at most) and stop launching once the release cap is collectable, so a batch
  cannot trigger GitHub's secondary limits. Highlights are added only when notes are regenerated
  after the successful prepare step records this run's version commit SHA (`release-highlights.integration.test.mjs`
  guards that behavior). Release analysis clears any prior proof, and the prepare step sets it only
  after its commit succeeds. The SHA must still be HEAD, whose subject, two changed generated
  assets (`CHANGELOG.md` and `package.json`), and committed manifest version must match the
  release. The process-local preparation proof prevents an ordinary commit with matching authored
  fields from passing the initial note generation, which supplies `CHANGELOG.md`. PR text reaches the GitHub
  release but is never committed to `CHANGELOG.md` or seen by
  the staging secret scan; recovered publications (rebuilt from `CHANGELOG.md`) therefore have
  none. In-range reverts resolve by parity across all commits before internal-scope commits are
  dropped, so an internal revert still cancels.
- Never replace the validated checkout with a newer main commit to make publishing succeed.
- CI cancellation must not cancel a publisher; only release jobs share `release-main` with
  `cancel-in-progress: false`. Git non-fast-forward protection and semantic-release's upstream
  check remain the final safeguards if main advances after the last eligibility check.
- Dispatched CI publishes the aggregate validator outcome as a `CI Result` commit status on the
  exact workflow-run SHA. GitHub excludes dispatch-created job checks from branch rules; the
  status uses the GitHub Actions job token with job-scoped `statuses: write` and
  `pull-requests: read` for Crowdin merge attestation. That job checks out
  the trusted default branch for aggregation and reporting, never candidate branch code. Only aggregate
  success publishes success; failed, cancelled, skipped, or missing validation publishes failure.
  Validation jobs unknown to the trusted aggregator also fail the result, so a new job must land in
  the trusted contract before it can gate. The `security` gate is selected by every plan; every
  selected job must report `success`, every known but unselected job must report `skipped`, and a
  missing result fails the aggregate — so an older candidate workflow that omits a required job
  can never pass. (The former `optionalJobs` compatibility window expired when all active
  candidate workflows had landed the `security` job.) Status publication errors fail the
  CI Result job, so automation cannot promote the commit.
- Release version commits pass explicitly dispatched CI on a temporary `wip/release-*` branch and
  receive an Actions-owned preview ([previews](./previews.md)) before the identical SHA advances main; the embedded
  version makes them deployable changes. `scripts/ci/github-ci-gate.sh` waits for the exact dispatched
  CI run and its `CI Result`, requests one preview, then waits for the authoritative `Preview Result`
  on the same SHA; gate waits are bounded to 60 minutes, and the containing Release and Crowdin
  workflows are bounded to 90 minutes. Ordinary
  `wip/**` push CI no longer exists. The main ruleset requires successful GitHub Actions
  `CI Result` and `Preview Result`, strict freshness, and no bypass actors. Non-fast-forward
  promotion fails if main advances.
- If publication fails after version promotion, an explicit rerun can recover only the direct
  version-only child of the original CI revision, with successful exact-head `CI Result` **and**
  `Preview Result` and unchanged manifest/changelog history. The `Preview Result` evidence is
  authenticated, not merely present: the newest status returned by the exact-SHA commit endpoint
  must be a success, and its `target_url` must resolve to a completed `workflow_dispatch` run of
  `.github/workflows/preview.yml` whose branch is `main` and whose head repository matches this
  repository (GitHub reports path and branch separately). Its `Publish preview result` job must
  conclude successfully, and the run must retain `preview-deployment-<sha>` evidence for the exact
  version commit. These checks prove a candidate was deployed, smoke-tested, and authoritatively
  reported (never an `ignore` no-op run).
  Recovery creates missing tags/releases
  idempotently, rejects tag conflicts, and never advances main or bumps another version.
- The staging push uses `GITHUB_TOKEN` and explicitly dispatches CI; main promotion uses it to
  avoid recursive Actions runs. Version commits have no skip marker; Cloudflare still rebuilds.
- A green workflow run must continue to mean the test shards and Supabase validation passed;
  making those jobs optional requires reconsidering this release gate.

### Crowdin automatic merges

`.github/workflows/crowdin.yml` uses `scripts/ci/crowdin-pr.sh`, preserved from trusted main before
synchronization, to bind translation validation and merging to one immutable PR head. Its full tree
diff against captured main permits only regular non-English locale JSON files. Dependency setup and
project checks run after that checkout. The built-in job token synchronizes translations, updates a
behind branch, explicitly dispatches candidate CI, and performs the final merge; dependency installation and project checks receive no automation credential.

- Only an open, non-draft, same-repository `locales` PR targeting `main` is eligible.
- Behind translation branches first receive a GitHub branch update guarded by the expected head.
  Only afterward does the workflow capture and validate a candidate. Conflicts fail closed.
- Candidates contain captured main. Preflight checks reject observed main/head changes and
  conflicting or stale merge states. Unknown calculations and a temporary `BLOCKED` state after
  preview success retry for up to 60 seconds. If GitHub continues to report
  `MERGEABLE / UNSTABLE` for approval-required `pull_request` suites, the gate revalidates the
  required exact-head `CI Result` and trusted `Preview Result`, then attempts an ordinary
  head-pinned merge; GitHub's server-side rules still reject any unmet requirement.
- The gate awaits successful GitHub Actions `CI Result` and then the `Preview Result` commit status
  on the exact head (the explicit `locales` dispatch produces the preview even though job-token
  PR updates leave ordinary `pull_request` runs approval-required) and verifies the effective
  repository rule requires both checks with strict freshness. The administrator verifies the deployed
  ruleset has no bypass actors; automation does not receive ruleset write access to read that list.
  GitHub enforces the base requirement at merge time; missing/weakened required checks fail closed.
- The trusted dispatched CI result job also reports `CI Result` on GitHub's test-merge commit only
  when exactly one eligible same-repository `locales` PR has the validated head, its base equals
  current main on both reads, its merge SHA stays unchanged, and the head and test-merge Git trees
  are identical. This attests the same fully tested files without running candidate code in the
  status-writing job. A missing test-merge SHA is fetched from the selected PR with a bounded retry.
  A changed revision or different tree fails the result job before preview and leaves the merge
  status absent. A later failed dispatch publishes failure to the same PR's current test-merge SHA
  as well as the head, superseding any earlier success on that merge commit.
- The server-side `--match-head-commit` guard must use the SHA that passed all validation.
- Merges use `GITHUB_TOKEN`, then explicitly dispatch main CI for the release gate. No personal
  GitHub token is needed. CI dispatch failures fail the workflow; candidate failures prevent merging.
  The fixed squash message must not inherit automation-skip markers from translation commits.
- Existing release provenance checks stay intact; Cloudflare Git deployment remains independent.

See `docs/workflow-automation.md` for triggering, retry, and deployment behavior.
