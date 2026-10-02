# Workflow Automation Guide

Complete workflow automation setup for TarkovTracker with CI/CD pipelines, quality checks, and deployment automation.

## Overview

**Automated Workflows:**

- CI/CD pipeline with quality, testing, and builds
- Cloudflare-managed deployment from connected Git branches
- Security scanning and dependency audits
- Automated releases with semantic versioning
- Pre-commit hooks for code quality
- Dependency update automation via Dependabot
- Conservative auto-merge for low-risk Dependabot updates
- CodeRabbit is the routine reviewer; Codex is reserved for requested fallback or risky pre-merge reviews. The policy adopted on 2026-09-29 calls for disabling Codex automatic reviews in the dashboard. Verify that setting separately; repository configuration does not prove dashboard state.

## Agent validation and review

`package.json` defines commands; the root `AGENTS.md` defines required validation and review, and
path-scoped `supabase/AGENTS.md` and `workers/api-gateway/AGENTS.md` add area-specific rules.
[`code-review.md`](./code-review.md) supplements that contract with risk areas, without requiring
the full suite for unrelated changes. Worktree setup and the shared CI setup action use `scripts/setup/ensure-pnpm.sh` to
verify pnpm against `packageManager`, preparing its complete integrity-qualified pin even when the installed version matches.

Run focused checks while implementing, then required checks after the diff stabilizes. Record the
commit, dirty worktree state, commands, and results in the PR summary. Invalidate affected results
when their inputs change. Batch substantiated corrections; defer unrelated cleanup and optional
style suggestions.

### Discovery brief

Before editing, `pnpm run brief` answers "what uses this, what owns it, and what must I run?"
in one call. Point it at a target with `--file <path>` or `--symbol <file:export>` (both
repeatable), or at a diff with `--base <ref>`, which briefs the local changes against the merge
base. Add `--format json` for the uncapped lists.
Explicit file operands resolve inside the repository; dot segments, Windows separators, and
absolute paths within the checkout are normalized before scope and runner selection.
It combines `fallow inspect` (import graph, symbol references, transitive impact), the
generated `.nuxt/components.d.ts` and `.nuxt/imports.d.ts`, path-literal references in workflows
and config, doc anchors, scoped `AGENTS.md` files, and the CI path classifier. The output lists
consumers, owning docs, scoped instructions, candidate tests grouped by runner, and the required
checks.

Candidate test entries are JSON records with `executable` and `args`, including in text output.
Directly targeted tests and existing tests in the diff are included even when they have no importers.
Runnable candidates follow the runner's filename patterns; helpers are traced to their test consumers.
Scoped instructions and checks include direct and transitive dependents, including test consumers.
Discovered literal references in executable configs, workflows, SQL, and file-reading tests also
contribute scope and runnable test candidates. This matches repository-relative path strings;
computed references and relative fragments still require confirmation.
Database replay is required for affected SQL paths; Edge Function tests use Deno without an
automatic database replay. JSON retains every owning-doc anchor. Text caps documents and anchors
at twelve entries, marking omitted entries and directing readers to JSON for the complete list.
Generic entrypoints named `index`, `main`, or `mod` use full-path doc matches to avoid unrelated
field-name references.
They are data to review, not shell commands to paste or concatenate. Pass arguments separately
to a runner that does not use a shell; Windows command shims such as `pnpm.cmd` need a trusted
platform-specific launcher. Relative file operands start with `./` to avoid runner options;
Node also receives `--`. Deno keeps file operands before its `--` script-argument delimiter;
Vitest keeps its positional file filters. No tests are executed
by the brief. This preserves spaces, quotes, and shell metacharacters without choosing POSIX,
PowerShell, or cmd quoting rules.

The Deno selection regression can also run against the CI-pinned binary by setting
`DENO_EXECUTABLE` to its absolute path when running `scripts/ci/change-brief.test.mjs`.
It uses two inert fixtures and verifies that only the requested file runs with no script arguments;
without that environment value, the runtime regression is explicitly skipped.

The brief is advisory. It does not replace any required check, and CI stays authoritative.
Its Uncertainty section names what it cannot prove:

- Fallow does not see Vue template usage of auto-registered components, so the brief adds those
  consumers from a name text match and labels them UNVERIFIED.
- Auto-imports are reported only where text hits appear that Fallow missed.
- Runtime string lookups are never in any graph: i18n keys, Supabase RPC and table names, KV
  keys, and upstream field names.

Coverage limits: scoped instructions come from tracked files and include known lifecycle/DB
path mappings from the [brief model](../scripts/ci/change-brief-lib.mjs). Confirm the root
`AGENTS.md` contract for differently named account/team/token code; path mappings do not prove
semantic coverage. Generated declarations are checked
for presence, not freshness. Fallow subprocesses currently have no timeout or output cap.
Path-reference seeds are limited to 60 affected paths; truncation is reported as uncertainty.
Some rendered lists remain uncapped. Model tests inject
I/O. CLI regressions exercise operand handling against a checkout; they do not establish
generated-declaration freshness or complete Fallow coverage.

The brief was benchmarked on three past fixes: season validation (`f2ad088f`), a
component/composable change (`a9828505`), and preview tooling (`1676ddda`). In each, it surfaced
every file the real fix touched or re-tested that consumes a starting file, along with the owning
doc and the scoped `AGENTS.md`: 5/5, 11/11, and 6/6. A scripted grep-and-read proxy of the
previous workflow used 23–31 tool calls and returned 68–93 KB. With confirmation reads excluded,
it still used 4–6 calls and 8–12 KB. That proxy missed the gateway `AGENTS.md` and a consumer's
test. The brief took one call, under 1.2 s, and returned 1.7–3.8 KB. Fallow alone missed four of
the component's consumers; the generated-declaration match recovered them. These numbers measure
discovery context, not end-to-end task time.

### Push cadence

The root `AGENTS.md` owns review requirements and exceptions. Commit freely while implementing,
then validate the stabilized diff, run one local review for executable changes when available,
address validated findings together, and push one batch. Address a whole PR review round before
pushing the next correction batch. Reuse evidence for unchanged inputs; substantial new behavior
or unresolved significant findings warrant another review.

The maintainer reported that PR #965 received over 20 Codex reviews across about 45 pushes and
consumed about 40% of a weekly Codex allowance. These are reported estimates, not a verified usage
measurement. Batching pushes and requesting Codex only exceptionally aim to reduce that usage.

CodeRabbit CLI and PR reviews have separate rolling allowances; both are limited. See
[CodeRabbit's current limits](https://docs.coderabbit.ai/management/plans). Rate limits allow continued
implementation, local commits, and useful validated batch pushes, with missing review recorded as
incomplete. Required review still gates merge; do not enable paid over-limit reviews without approval.

TarkovTracker disables CodeRabbit automatic incremental reviews in `.coderabbit.yaml`. After
substantial follow-up changes, request `@coderabbitai review` before merge unless recorded local or
independent review covers the final changes. Record the reviewed base and head, and assess later
changes rather than relying on an earlier green check. Codex requests use the guard below.

### Codex request deduplication and waiting

Agents must use `node scripts/codex-review/codex-review.mjs <PR> --wait-seconds 600` to inspect and wait for
reviews. Add `--request` only when authorized to post a review request. Use `--repo owner/name`
when the PR belongs to another repository. Do not post raw `@codex review` comments or issue a
second request because a polling window expired. Batch corrections before requesting a review.
Only observed code-review completion exits successfully; pending, unreviewed, or uncertain status
exits nonzero. A successful exit confirms review completion, not merge readiness.

Authorized `--request` invocations also collapse original review commands after a verified eyes
reaction from `chatgpt-codex-connector[bot]` or explicit matching code-review completion. This
uses GraphQL `minimizeComment` with `RESOLVED` and the original node ID; findings and result
comments remain visible. Summary-only completion with unknown findings does not authorize
cleanup. Cosmetic failures warn without changing guard decisions, locks, quiet periods or
completion evidence. Plain status/wait invocations remain read-only. Add `--collapse-requests`
when authorized to clean up existing manually posted commands while observing status.

After an authorized request's polling window ends, continue this command-cleanup workflow with
`node scripts/codex-review/codex-review.mjs <PR> --collapse-requests --wait-seconds 600`.
Omit `--request`: continuation observes the existing review and collapses commands acknowledged
or completed later without requesting another review. This also covers eligible manually posted
commands, which do not need a wrapper marker. Use plain `--wait-seconds 600` for intentionally
read-only inspection; it does not collapse late acknowledgements or completion.

GitHub's [issue_comment activity types](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment)
do not include reactions, so cleanup uses the existing bounded polling loop rather than inventing
a reaction event. Commands posted outside that loop, or acknowledged after it ends, require a
later authorized cleanup invocation. No new background workflow, credential or permission is
added. A per-invocation cache removes repeat cleanup calls after success. The
[cleanup regression benchmark](../scripts/codex-review/codex-review-collapse-tests.mjs)
owns the API budget and local compute measurements. Network latency and token savings are
unmeasured.

The guard checks live PR review evidence, waits for outstanding requests, and reuses completed
code reviews for the current commit. Security-review completion alone is not code-review
completion. A report's top-level security heading or dedicated leading marker identifies a security report; quoted
security headings inside a code review do not exclude that review. Completion requires an exact full commit identity: abbreviated bot evidence is
resolved through GitHub's commit endpoint, and ambiguous or unavailable resolution fails closed.
The PR head, base branch, base SHA, and eligibility are refreshed after collecting evidence;
head or base changes during collection fail closed. Completion reuse only establishes a review
for the head commit, not coverage of the current base or diff. After retargeting, independently
review the current diff through the production-readiness gate before merging. A completed code review can contain findings; the normal feedback-resolution gate
still applies. Unknown or unavailable status must be reported as incomplete, never treated as
permission to retry. An unreviewed PR must be quiet for five minutes after creation or its latest
update before requesting, allowing automatic review to start after opening, pushing, or marking ready.
This grace period uses the final PR response's GitHub `Date` header, never the local wall clock;
missing or invalid server time fails closed. Only a literal first-line `@codex review` command
from a GitHub `OWNER`, `MEMBER`, or `COLLABORATOR` association counts as request evidence;
prose mentions, fenced examples, indented code, and outsider markers do not. This trusts GitHub's
association metadata for coordination; it does not grant permission to post a request. Running
bot activity remains authoritative regardless of who triggered it.

Request invocations share a lock and durable intent in the Git common directory across local
worktrees. Repository identity is case-insensitive, including previously saved intents under a
different casing. Intent is saved before posting, so an ambiguous network failure cannot cause the next
invocation to blindly post again. Inspect GitHub and the recorded intent before manual recovery;
agents must not delete the guard state to force another request.

A successful post records GitHub's request timestamp, so request/completion ordering never
compares the local clock with the server clock. When delivery is uncertain, a matching current
commit completion can retire the local intent; absence of that evidence remains pending.
SHA-marked requests for older commits do not block the current commit, while unmarked requests
require a completion of the current commit at or after the request time. Equality is accepted
because GitHub timestamps have second precision and exact-commit completion is reusable;
bot activity still marked running continues to block a new request.

The helper recovers a request lock only when complete owner metadata identifies this host and
a PID confirmed dead (`ESRCH`). Live PIDs, permission errors, foreign hosts, missing or malformed
metadata, and an interrupted recovery remain blocked. Lock age never authorizes removal.
For a lock left between directory creation and metadata writing (or an interrupted recovery),
an operator must inspect the lock, running processes and GitHub request evidence, ensure no
request invocation can run concurrently, and remove only the confirmed orphaned lock directory
or its `.recovery` sibling. Preserve all intent files and rerun read-only inspection before an
authorized request. Agents must report this condition for operator recovery rather than deleting
uncertain state themselves.

This is a cooperative agent guard, not a GitHub-wide restriction: unrelated clones, other machines,
and callers that bypass the helper do not share the local lock. Existing GitHub requests are still
checked, but GitHub comment creation has no atomic deduplication key. A server-side single request
owner would be needed to eliminate that cross-machine race. The helper itself neither merges PRs
nor resolves findings.

GitHub also offers no atomic head condition on comment creation: a push after the final PR read
can race the POST. The request marker records the observed head; it does not pin the revision the
bot ultimately reviews. Always inspect fresh exact-head completion and checks before merging.

### Reviewer settings: external verification pending

1. Verify automatic Codex reviews are disabled in the repository/dashboard settings.
2. Keep automatic initial CodeRabbit reviews enabled and incremental reviews disabled as configured
   in `.coderabbit.yaml`. Verify exclusions on translation-only and mixed translation/code PRs.
3. Retain manual reviewer access. Record representative PR links and observed dashboard settings;
   checked-in policy is not proof of integration state.
4. Verify revision-specific review evidence and unavailable/quota-exhausted behavior. Preserve
   completed evidence for unchanged inputs and never report unavailable review as successful.

## GitHub Actions Workflows

### 1. CI Pipeline (`.github/workflows/ci.yml`)

Runs on pushes to `main`, PRs targeting `main`, and explicit CI dispatch (release staging on
`wip/release-*`, Crowdin on `locales`, and `main` revalidation), including translation-only PRs.
All push and dispatched runs retain full validation. Ordinary `wip/**` push CI was removed;
staging branches receive CI only through the explicit dispatch their automation performs.

The lightweight `changes` job classifies the pull-request diff and selects jobs. **Path selection is
active**: documentation-only and translation-only pull requests run the reduced set (formatting,
i18n when locales change, systems drift); every other change set runs every job. The job also emits
`workflows`, which enables workflow linting in `Lint & Format` for non-Markdown automation paths and
unreadable diffs. The classifier additionally emits an independent `preview` decision (`previewRequired`): only
change sets that cannot reach the deployed Pages output need no deployable preview — Markdown
documentation outside `public/` plus the `.github/`, `docs/`, `tests/` and repository tooling
configuration paths, and `scripts/` apart from its preview pipeline, all owned by
`scripts/ci/validation-plan.mjs`; translations, configuration,
dependencies, executable changes, Supabase, Workers, and unknown or unreadable paths require one, so a
translation-only PR keeps the reduced test selection but still runs `Validate`. `CI Result`
evaluates the job outcomes against the plan and fails on missing
classifier data, selected failures/cancellations, or unexpected skips. Systems drift and the
integrated `Security` call (see §2) run on every CI run. Fork restrictions and Codecov statuses
remain unchanged; Dependabot now waits for the aggregates (`CI Result`, `Preview Result`) rather
than individual job names.

GitHub makes `pull_request` runs from PRs updated with `GITHUB_TOKEN` approval-required. The
trusted `locales` dispatch runs full CI on the captured head, then reports its result to the
test-merge commit only if both Git trees match, the base is still current main, and the PR revision
remains unchanged. It retries briefly while GitHub calculates the test merge, and a later failed
dispatch supersedes an earlier merge-commit success. Other dispatched runs report only on their
own exact SHA. See the Crowdin invariant in
[release publication spec](systems/ci-and-release.md#release-validation-and-publication).

#### Preview build artifact

`Validate` builds the actual Cloudflare Pages output once. `scripts/preview/build-profile.mjs`
chooses the profile before the single `pnpm run build` step: `main` pushes and `main` dispatches
keep the production configuration; pull requests and non-main dispatches build the anonymous
preview profile from `scripts/preview/profile.mjs` (explicit `APP_URL` on the controlled
`preview-*` branch alias of `tarkovtrackernuxt.pages.dev`; empty Supabase, analytics, Turnstile,
Stripe, and log-forwarding values). For preview builds, `scripts/preview/write-manifest.mjs`
records `dist/preview-manifest.json` — repository, PR number, head SHA, base SHA, checked-out
test-merge SHA, tree SHA, run id/attempt, build-profile version, and a content digest — and the
job uploads `dist` as the `pages-preview` artifact with seven-day retention. Deployment never
rebuilds and never reuses Lighthouse output. Missing or expired artifacts require a new CI run.
Candidate builds receive no deployment credentials; the manifest is a set of claims that the
trusted preview controller verifies (see §8).

The shared setup action always uses `.nvmrc` and the full `packageManager` pin. By default it also
restores the pnpm cache and performs a frozen installation; `install-dependencies: false` skips
those two steps. Non-scheduled Security Scan calls use this runtime-only setup because their
audits read an isolated manifest and lockfile; the weekly outdated check retains installation.
Each caller owns checkout history and credential settings. `Lint & Format` runs lint
and Prettier once each (lint already includes blank-line validation), plus i18n and workflow fixtures.
When automation files change it also runs pinned, checksum-verified release binaries of `actionlint`
(syntax, expression, and shellcheck errors) and `zizmor` (workflow security) at `low` severity and
above; `.github/zizmor.yml` records the accepted findings with their justification. Neither tool is
Node tooling, so both are pinned in the workflow step rather than `package.json`. To update either,
change the version and the `SHA256` value to the `digest` GitHub records for the release asset.
The four Vitest shards, dedicated Deno tests, Supabase validation, Worker validation, and production
build retain their existing commands and environment behavior. Tests in `scripts/workflow-tests/` use
Node's built-in runner via `pnpm run test:workflow`; their filenames deliberately avoid Vitest discovery.

#### Local validation selection

```bash
pnpm run validate:changes --base origin/main --explain
pnpm run validate:changes --base origin/main
pnpm run validate:changes --mode ci --base <base-sha> --head <head-sha> --explain
pnpm run validate:changes --mode full --base origin/main
```

Execution reuses the absolute package-manager entry from `pnpm run`; direct Node invocation is
only supported for `--explain`. Git defaults to `/usr/bin/git` on Unix and
`C:/Program Files/Git/cmd/git.exe` on Windows; set `GIT_EXECUTABLE` to an absolute trusted path for a nonstandard install.
The full profile requires Bash at `/bin/bash` for the existing Deno test command.

Local mode combines the merge-base diff with staged, unstaged, and untracked paths. Explicit CI
mode reads only the revision diff; full mode forces full selection. Explanation mode executes no
checks. Local mode runs lint, formatting, typecheck, workflow fixtures, unit tests, i18n, and systems
drift for executable changes; apply path-specific `AGENTS.md` checks as well. CI/full execution adds
Fallow, build, database and Worker checks, and Deno tests, requiring their usual runtimes and build
environment. CI itself retains sharding, secrets/fork rules, and report uploads in workflow jobs.
Link validation remains in the existing Link Check workflow for applicable documentation paths.

The reduced selection covers only root `.md` files, Markdown under `docs/` and `.github/`, agent
instruction files named `AGENTS.md` or `CLAUDE.md` at any depth outside `public/`, and
Crowdin-owned `app/locales/*.json` translations. The source locale `app/locales/en.json` selects
full validation: application code and Vitest fixtures consume it, and `scripts/ci/crowdin-pr.sh` draws
the same translation-only boundary. `DESIGN.md`, generated code, scripts, dependencies,
configuration, public assets, and unknown paths select full validation. Renames include both paths
and deletions remain visible. Empty diffs, missing refs, malformed arguments, and Git errors
conservatively select full validation. The i18n check rejects missing supported locale files,
including deletions and renames, while missing translation keys still use the non-fatal English
fallback.
Non-English formatting exclusions and Crowdin ownership remain intact.

#### CI rollout and measurements

1. Merge policy/setup, then the shadow classifier and aggregate. Capture a successful and failing
   executable PR, a documentation-only PR, a translation-only PR, and a mixed PR. Confirm the proposed
   selections and aggregate conclusions, including the existing Dependabot and coverage behavior.
   **Recorded 2026-09-16** from the `Validation plan` job logs of pull-request CI runs:
   documentation-only #831 (`proposed.full=false`, run succeeded), translation-only #818 and #853
   (`proposed.full=false`, runs succeeded), executable #855 and mixed docs/workflow #862/#863
   (`proposed.full=true`), and failing executable runs on #848/#852/#862 where a failed shard, Fallow,
   or lint job made `CI Result` fail. The only required check on `main` is `CI Result`
   (`Main CI freshness` ruleset at that rollout stage), so skipped jobs could not leave a pull request blocked.
2. Done: the classifier invocation no longer passes `--shadow`; pull requests receive path selection
   while push and dispatch events retain `--full`. Required-check settings were not changed. Roll
   back by restoring `--shadow` in the `Classify changes` step and inverting the `--shadow`
   assertion in `scripts/workflow-tests/workflows.mjs` in the same change (workflow edits select full
   validation, so `test:workflow` runs on the rollback itself); the flag remains supported.
3. Release deduplication is handled separately in [PR #805](https://github.com/tarkovtracker-org/TarkovTracker/pull/805).
   Path selection does not change release triggers, validation, or main-run cancellation.
   Do not treat local fixtures as evidence of GitHub App or branch-protection behavior.

The initial observations come from the pre-rollout baseline collected on 2026-09-06, which was
archived in git history once the rollout completed (recorded 2026-09-16; no report file remains
in-tree).
The read-only `scripts/ci/workflow-metrics.mjs` collector samples the preceding 20 merged PRs and emits
per-PR CI and release timings as JSON. Run it with authenticated `gh` and save stdout to a report:

```bash
node scripts/ci/workflow-metrics.mjs --before <rollout-ISO-time>
node scripts/ci/workflow-metrics.mjs --after <rollout-ISO-time> --count 20
```

The follow-up selects the first 20 merges after the boundary; record the actual rollout timestamp.
Compare categories separately (documentation, translations, mixed documentation/translations,
executable). Runner minutes sum job durations across attempts, not billed rounding. Workflow duration
uses completion metadata as a proxy. Historical PR association can be inferred from repository,
branch, and PR lifetime when GitHub omits the association; the report labels that limitation.
Correction-push counts, review-to-correction delay, and agent usage remain null without retained
telemetry rather than being inferred from commit counts. A 30% reduction is a measured objective,
not an acceptance gate. Test-project changes, finer subsystem selection, and code cleanup are deferred.

#### Fallow changed-file gate

Run `pnpm run lint:fallow` locally; CI uses the same command with `--base <event-base-sha>`.
The default base is `origin/main`. The command resolves the merge base with the current HEAD,
includes staged, unstaged, and non-ignored untracked files (respecting the source checkout's
local and configured Git exclusions, while retaining force-tracked files), and keeps Fallow's native
`--gate new-only` behavior and configured severities. New error findings fail; inherited findings
and warning-only findings do not. No persistent finding baseline is maintained.

`scripts/checks/fallow-audit.mjs` creates a temporary local clone and two analysis commits. Both contain
a physical copy of the current generated `.nuxt` context; the second contains the current source
tree. This prevents Fallow's internal base snapshot from symlinking the generated tsconfig and
resolving its relative `@/` aliases against the wrong directory. Dependencies are linked from the
installed checkout. Neither the source index, source files, branches, nor Git worktree registrations
are modified, and the temporary clone is removed after success or failure. Run `pnpm install`
first, as usual, to prepare dependencies and Nuxt types.

Use `--format json` for structured findings. Each run uses fresh analysis without reusable caches.
The report's Git IDs belong to the temporary analysis commits; the original source base and HEAD
are printed on stderr. Invalid refs and setup/analyzer failures exit nonzero instead of skipping the gate.

Regression checks live in `scripts/checks/fallow-audit.test.mjs` and run with the regular test suite or
`pnpm exec vitest run scripts/checks/fallow-audit.test.mjs`.

##### Resolving findings instead of suppressing them

Fix findings at the source. `// fallow-ignore-next-line` hides a finding without resolving it, and
because no baseline is maintained, a hidden finding is never revisited — the debt simply stops being
reported. Resolve dead code by deleting it or narrowing the export; resolve complexity by
decomposition (extract helpers, split validation from assembly, share an algorithm rather than
duplicating it).

Complexity findings usually report `exceeded: crap`. CRAP is `complexity² × (1 − coverage)³ +
complexity` and the audit runs without coverage data, so it assumes zero coverage: a function at
cyclomatic 5 scores exactly the threshold of 30 and breaches. "It is covered by tests" is therefore
not a resolution — the analyzer cannot see that coverage, and the finding will recur on every run.
Treat cyclomatic 4 as the practical ceiling for new functions.

Suppress only when the finding is provably not actionable, such as an external contract or framework
indirection the analyzer cannot model (store state hydrated through `$state` is the recurring
example). Put `// fallow-ignore-next-line` directly above the flagged declaration and explain why
the finding cannot be fixed. Explanatory `//` lines may precede the directive; the directive must be
the final comment line. Placing more comment lines between the directive and declaration targets the
wrong line and leaves the finding unsuppressed. A suppression is a reviewable decision, not a
formality. Existing suppressions are grandfathered; remove them opportunistically when already
editing that function rather than as unrelated cleanup in someone else's change.

### 2. Security Scanning (`.github/workflows/security.yml`)

Reusable security gate called by CI, plus the weekly standalone audit:

**Jobs:**

- `security-scan` - `pnpm audit --prod --audit-level=critical` (blocking), informational
  all-dependency audit at `high` (a notice, never a failure), schedule-only outdated check,
  checksum-verified Gitleaks secret detection (blocking), preceded by a canary check that a
  generated service-role JWT in `wrangler.toml` is still reported (allowlists stay value-exact)
- `codeql` - CodeQL static analysis; the analysis must succeed, findings are triaged in code scanning

**Triggers:** `workflow_call` from CI (pull requests, main pushes, explicit dispatches including
Crowdin and release staging) and the weekly schedule (Sunday 00:00 UTC). The former push and
pull_request triggers were removed so each revision is scanned once, inside the gated run.
`CI Result` requires the call's success: scanner errors, cancellation, or a missing result fail the
aggregate. The trusted aggregate contract (`scripts/ci/validation-plan.mjs`) landed in a compatibility
change first (an absent `security` job was tolerated, a reported non-success failed); the
activation change made the job mandatory.

### 3. Release Automation (`.github/workflows/release.yml`)

Semantic versioning with batched releases. Releasing and deploying are separate: every merge to
`main` deploys through the Cloudflare and Supabase Git integrations as soon as it lands, while a
release groups everything merged since the previous tag into one version, changelog entry, and
GitHub release.

**Jobs:**

- Reuses the newest successful main `CI` run for the exact release commit, including all four test
  shards and the Supabase reset, lint, and pgTAP checks
- Runs the production build before publishing
- Generates changelog from conventional commits
- Creates GitHub releases
- Updates version in package.json

**Triggers:** A weekly schedule (Tuesdays 15:00 UTC) and manual `workflow_dispatch` on `main`
(Actions → Release → Run workflow) when a notable change should ship as a release sooner. CI
completion no longer starts a release. Other refs and events cannot publish, and there is no manual
bypass of the CI gate. semantic-release still decides whether the accumulated conventional commits
warrant a version; weeks with only internal or non-releasing commits publish nothing.

The release candidate is the run's trigger commit (`github.sha`, the head of `main` when the run
started; reruns keep it). `release-gate.mjs` finds the newest same-repository `CI` run
(`.github/workflows/ci.yml`, push or dispatch on `main`) for that exact SHA, ordered by the latest
attempt's start time so a rerun of an older run record counts as newest, and requires it to have
completed successfully. A later failed or in-progress attempt therefore blocks publication instead
of an older success being reused. It then re-reads `refs/heads/main`, both before dependency setup and again
immediately before publishing. If CI for the head is still running, or main advanced after the run
started, the run skips; dispatch Release again once main CI passes. Release never substitutes a
newer, unvalidated checkout.
The gate and its recovery helper initially load from the trusted default-branch SHA and are copied
to `RUNNER_TEMP` so checks use the same source even after checkout replacement. Only after validation does a
second checkout pin the triggering CI SHA for building and publishing; it never executes a fork
candidate.

Only release jobs share the non-cancelling `release-main` concurrency group. CI can cancel obsolete
validation independently; an active publisher is not cancelled by a newer merge. A merge in the
small interval after the last check remains subject to semantic-release's upstream check and git's
non-fast-forward push protection. No force push or rebase onto an unvalidated commit is permitted.

This removes the duplicate full test suite and database reset from the serialized release path.
The production build remains a release check. Cloudflare deployments continue independently;
this workflow controls release/version publication, not when the initial deployment starts.

**Required main policy:** `.github/main-ci-ruleset.json` records the desired API configuration for
the `Main CI freshness` repository ruleset. Rollout must apply it and verify active enforcement and
an empty bypass list before merging the automation changes. It targets
`refs/heads/main`, requires both `CI Result` and `Preview Result` from GitHub Actions (integration ID `15368`), enables
`strict_required_status_checks_policy`, and has an empty `bypass_actors` list. This applies to
all PRs and direct pushes, including administrators and automation. Existing deletion/force-push
rules remain separate. Behind branches must incorporate current main and pass CI again; do not
use an administrator bypass. GitHub enforces freshness at merge time, closing the interval after
automation's last base-SHA check. Both Crowdin and release automation verify the effective strict rule before writing main. The
administrator must verify the deployed ruleset's empty bypass list during rollout and after policy
changes. GitHub hides that list from callers without ruleset write access; automation does not
request administrative permissions merely to inspect it.

**Version-bump commit:** `scripts/release/release-commit.mjs` prepares the bumped `package.json` and
`CHANGELOG.md` as `chore(release): <version>` with no skip marker. The plugin supports the
main-only release workflow. It stages only these generated assets and rejects unrelated staged
files. `scripts/release/release-commit.sh` pushes the new commit to
`wip/release-<version>-<run-id>-<attempt>` using the built-in `GITHUB_TOKEN`.
An explicit `workflow_dispatch` starts full CI on that branch; the job has `actions: write`. After
that exact CI run and its `CI Result` pass, the trusted Release job dispatches one preview from
`main` with the CI run id and waits for the authoritative `Preview Result` on the same SHA. The
version commit is a deployable change and receives an Actions-owned preview before promotion.
Absent, failed, cancelled, skipped, or timed-out gates cannot promote it. The Release job is
bounded to 90 minutes.

Automation confirms each accepted dispatch creates a new CI run on the requested branch within
60 seconds, including queued runs, before waiting for exact-SHA checks. Dispatched Fallow audits
compare the checked-out commit with its parent, so dispatching main does not compare main with itself.

The dispatched CI status-reporting invariant and trusted-code boundary are defined in
[release publication spec](systems/ci-and-release.md#release-validation-and-publication).

After rechecking main and the policy, an ordinary non-forced push promotes the identical SHA to
main using `GITHUB_TOKEN`. A concurrent main advance rejects promotion rather than rebasing
unvalidated assets. The required check is already successful on that commit. The token suppresses
recursive main Actions runs; semantic-release then tags and publishes the validated version.
Successful promotion deletes only the staging ref still pointing at that SHA. Failed attempts
retain the staging branch for diagnosis. A cleanup failure emits a warning without undoing
publication. No token is written to a Git URL or config.

**Interrupted publication:** If tag pushing or GitHub publication fails after main promotion, rerun
the original Release workflow. `release-recovery.mjs` is enabled only for reruns and recognizes
only the direct version-commit child of the original successful main CI revision. It requires
successful exact-SHA GitHub Actions `CI Result` and `Preview Result`, exactly the two generated modified assets, a
manifest whose only change is the matching version, and a changelog that preserves all previous
content. It reconstructs the original notes and creates the missing tag/release idempotently.
An existing tag must point to that same commit; an unrelated main successor, unsuccessful CI,
conflicting tag, draft/prerelease publication, or changed asset content cannot be recovered.
The recovery step rechecks the evidence before publication and never moves main or creates another
version commit. Failures before promotion use the ordinary original-workflow retry path.

Cloudflare Git deployments remain independent and build the version commit. The footer version
comes from `packageJson.version` in `nuxt.config.ts`, so this second production build makes the
footer match the published release. The footer also shows the short build commit
(`CF_PAGES_COMMIT_SHA` on Cloudflare Pages, else `GITHUB_SHA`, via `app/utils/buildCommit.ts`),
so every deploy stays identifiable even when several merges share one version. Staging branches may also receive preview builds according
to the platform's branch settings.

> [!WARNING]
> Never write a bracketed skip marker verbatim in a commit message — including when merely
> describing one — or you will silently skip CI, Release, and the deploy for that commit. Refer to
> them unbracketed (`skip ci`, `skip actions`) instead.
>
> GitHub scans the commit message of a push and the HEAD commit of a pull request. It does **not**
> scan PR titles. Cloudflare's docs describe its markers as a commit-message _prefix_, but observed
> behaviour in this repository is broader — both `chore(release): 1.75.0 [skip ci]` (marker trailing
> the subject) and a commit carrying `[skip ci]` only in its body produced no Pages deploy at all.
> Assume any position matches.
>
> Prose inside repository files, such as this paragraph, is not scanned by either provider.

**Commit Convention:**

- `feat:` → minor version bump
- `fix:` → patch version bump
- `perf:` → patch version bump
- `revert:` → patch version bump
- `BREAKING CHANGE:` → major version bump
- `refactor:`, `docs:`, `chore:`, `ci:`, `test:`, `style:`, `build:` → no release

**Internal scopes never release.** `scripts/release/release-scope.mjs` wraps the commit analyzer and
release-notes generator (the copies `semantic-release` depends on) and drops commits whose scope is
internal before either runs, so `fix(ci):` or `feat(preview):` neither bumps the version nor appears
in `CHANGELOG.md` or the GitHub release. Reverts of those commits (Git's default
`Revert "fix(ci): …"` message or `revert: fix(ci): …`) are internal too. The list is
`INTERNAL_SCOPES` in that file (`agents`, `build`, `ci`, `config`, `dependencies`, `deps`,
`deps-dev`, `docs`,
`no-release`, `preview`, `previews`, `release`, `repo`, `scripts`, `spec`, `test`, `tests`,
`workflow`); keep the in-app changelog's internal-scope filter aligned with it. Internal commits
still deploy normally; they are only left out of versioning. Use a product scope (`app`, `api`, `maps`, …) when a change affects players.

**Release note highlights.** While generating notes, the same plugin reads the `## Release note`
section of each merged PR (from the `(#123)` suffix of its squash commit, using the release job's
`GITHUB_TOKEN`; `scripts/release/release-highlights.mjs`) and lists those sentences under
`### Highlights` above the generated Features and Bug Fixes in the GitHub release. Highlights are
not written to `CHANGELOG.md`: semantic-release regenerates notes after the version commit, and
only that pass adds them, so PR text never enters the committed, secret-scanned file. Empty
sections and `none` are skipped. A failed PR lookup is logged and skipped, so highlights never block a release. The in-app
changelog shows the first bullets of each release, so highlights appear there first.

Only a description written by someone with write access and unchanged since merge is published:
a note is skipped when the PR is not merged, its author lacks current write access (checked with
the collaborator-permission API; for other contributions, add the highlight to the GitHub release
by hand), or its GraphQL
`lastEditedAt` is at or after `mergedAt` (second precision makes an equal time ambiguous). At most
3 notes per PR and 5 per release are listed, matching the in-app changelog's per-release bullet
limit. To fix a note after merge, add it to
the GitHub release by hand rather than editing the PR (an edit after merge also removes a note
that would otherwise publish). Notes become plain text: link syntax, images, URLs of any scheme,
and HTML tags are removed (including any `<` that would still open a tag), headings inside HTML
comments or code fences are ignored, and each note is capped at 280 code points. Only top-level
bullets are published: wrapped continuation lines, nested list items, and indented code stay
with their parent bullet. Parsing is bounded before sanitization — PR text within GitHub's body
limit, each bullet within `MAX_RAW_NOTE` code points, autolink triggers detected per
whitespace-delimited token — so a long or pathological note cannot stall generation. PR lookups
run in commit order with bounded concurrency, stopping once the five-highlight cap is
collectable. PR text never enters `CHANGELOG.md`: highlights attach only when notes are
regenerated after the version commit, which is authenticated from its generated state (exactly
`CHANGELOG.md` and `package.json` changed, and the committed manifest already carries the
release version) rather than its user-controlled subject. A PR reverted within the same release contributes no highlight, and
neither does its revert, even when the revert has an internal scope; a revert of that revert
restores the original highlight.

### 4. PR Checks (`.github/workflows/pr-checks.yml`)

Enhanced PR validation:

**Jobs:**

- `PR Meta` - auto-label based on file changes, PR size classification (S/M/L/XL/XXL), and
  commit message validation
- `Lighthouse scope` - decides whether the Lighthouse audit is relevant
- `Lighthouse` - Performance checks (runs when the PR touches `app/components/`, `app/features/`,
  `.github/lighthouserc.json`, or the PR Checks workflow, or carries the `performance` or `ui` label)

**Lighthouse collection (`.github/lighthouserc.json`):** each selected URL is audited once per Lighthouse
job. Repeated runs are reserved for investigating a failure or for dedicated performance analysis;
running each of three routes three times made the Lighthouse job the dominant PR bottleneck.

**Lighthouse floors:** accessibility, best-practices and SEO are held at 0.90. Performance floors
are per route and are set from measured CI values, not aspiration, because GitHub runners are noisy.
The `/hideout` floor remains `0.20`; raising it requires fixing the underlying `/hideout` LCP
regression first (about 5.1s before the Nuxt 4.5 / Vite 8 migration versus about 11.7s after — see
issue #647), not re-tightening the gate.

### 5. Dependabot Auto Merge (`.github/workflows/dependabot-auto-merge.yml`)

Merges known low-risk Dependabot PRs after the normal PR checks complete:

**Auto-merged groups:**

- lint and format tooling
- testing tooling
- tailwind tooling
- release tooling

**Safety rules:**

- The trusted `workflow_run` follows completed PR CI. The CI run actor and triggering actor, plus
  the live PR author, must match GitHub.com's immutable Dependabot account ID (`49699333`), not a
  mutable login. A human-triggered rerun or changed PR head cannot auto-merge
- No repository checkout or candidate code execution in the privileged workflow. Dependabot's
  `pull_request_target` token is read-only, so the post-CI workflow owns preview dispatch and merge
- Only package lockfiles, package manifests, and `pnpm-workspace.yaml` are allowed; any workflow
  change stays manual
- Runtime Nuxt, Cloudflare, TypeScript compiler, catch-all dependencies, and all GitHub Actions
  updates stay manual
- GitHub Actions updates may require a repository or organization Actions allowlist change for the
  new pinned SHA, which CI on the Dependabot branch cannot validate reliably
- PR must stay on the validated head SHA, the GitHub Actions `CI Result` and `PR Meta` check runs
  must complete, the latest `Preview Result` status must be `success`, and no check run or latest
  status context may fail or remain pending; the merge command also matches the validated head
  commit to close the final race. Individual CI/security job names are no longer listed; the wait
  is bounded to 60 minutes inside a 90-minute job
- An allowlisted candidate requests one preview from the trusted `main` controller only after its
  current-head CI and other checks pass. This retains unattended auto-merge without running a Pages
  deployment for unrelated PR pushes

### 6. Stale Management (`.github/workflows/stale.yml`)

Automatic stale issue/PR management:

- Marks issues/PRs stale after 60 days and leaves a review reminder
- Closes stale issues/PRs after 14 more days
- Add `never-stale` to issues/PRs that should keep stale reminders but never auto-close
- Exempts issues/PRs from stale reminders and closing: `pinned`, `security`
- Exempts issues/PRs from auto-close only: `never-stale`

### 7. Link Check (`.github/workflows/link-check.yml`)

Validates external links in documentation:

**Checks:**

- All markdown files in `docs/` and project root
- Validates HTTP status codes (200, 204, 206, 301, 302, 308)
- Excludes localhost, internal domains, and email links

**Triggers:** Main-branch pushes affecting documentation or link-check configuration, weekly
(Sunday 00:00 UTC), manual dispatch. It does not run on pull requests because external link
availability is advisory and can fail for reasons unrelated to the change.

**On failure:** Uploads report artifact with broken links

### 8. Preview Controller (`.github/workflows/preview.yml`)

Ordinary same-repository ready PRs request previews automatically after current successful PR CI.
Drafts pause; marking ready or reopening reuses already-passed CI without another build.
Maintainers and administrators can comment `/preview` once to enable previews for a PR, including
fork PRs. The current revision is requested immediately if CI is ready; otherwise the next
successful CI run requests it. Later revisions refresh automatically after successful CI.
`/preview stop` disables automatic requests; another `/preview` enables them again. Drafts remain
paused and resume when marked ready. This opts into previews without opting into merging.
The latest unedited command from a current maintainer controls the PR. Body edits are detected with
GraphQL `lastEditedAt`; REST `updated_at` can change for metadata updates and does not by itself
invalidate a command. Missing edit metadata or inconsistent REST/GraphQL comment snapshots fail
closed. Comments predating the opt-in activation instant retain their original
one-revision meaning and do not grant persistent access. The activation instant defaults to the
contract start shipped with the handler, so no manual post-merge variable flip is required; the
optional repository variable `PREVIEW_OPT_IN_START` overrides it for continuity after handler
reverts. A non-empty value must round-trip as a canonical UTC ISO instant — `0`, date-only,
zone-less or impossible values fail
closed and grant no persistent preview access (an override earlier than the contract start
likewise grants nothing and serves as an explicit off switch).
A `/preview stop` remains a revocation barrier when its author currently verifies as maintain/admin,
or when the request handler accepted it while verifying access — recorded by an acceptance receipt
comment from `github-actions[bot]`. A historical stop lacking both is not honored, so the previous
enabled opt-in stays in control; resuming always happens with a fresh command from a current
maintainer. Manual `workflow_dispatch` previews on the trusted default branch own their
authorization directly: they carry no standing command authority and cannot be revoked by a later
stop, while requests bound through `request_comment_id` are re-verified before upload.
Readiness dispatches carry explicit policy provenance and the exact CI attempt; they recheck
stop state, readiness, current head/base/main and current successful CI immediately before upload.
Accepted original commands are collapsed with `minimizeComment` (`RESOLVED`); cosmetic API failures
do not fail previews. Stop receipts are preserved. Repeated enable commands retain an original
live grant, but any intervening accepted stop revokes that queued grant even after a resume.
Dependabot retains its dedicated automatic preview owner; `/preview` can request its current
revision, but does not add a second automatic dispatcher.
Enabling auto-merge also requests previews when no explicit preview command overrides it.
The status controller dispatches `preview.yml` on `main`, carrying the CI run ID;
it checks for a matching active dispatch created after the current CI attempt completed so repeated events preserve in-flight previews
and fork approval requests. Manual commands use that same lookup. Failed or cancelled dispatches remain retryable. Manual `/preview`
and workflow dispatch remain available. Repository `allow_auto_merge` must be enabled to use
this optional request path. Automatic events do not upload artifacts themselves.

GitHub Actions controls when pull-request previews deploy to the existing Cloudflare Pages project
(`tarkovtracker`, `tarkovtrackernuxt.pages.dev`). The controller publishes `Preview Result` on the
validated head SHA for PRs and standalone release candidates; an explicit
maintainer request or trusted merge automation
dispatch uploads the validated artifact. Cloudflare-managed preview builds are disabled while automatic production deployments
for `main` remain enabled. The live ruleset requires both `CI Result` and `Preview Result`;
rollout verifies that enforcement. The design, result contract, and invariants are specified in
[previews spec](systems/previews.md).

**Triggers:** `preview-state.yml` receives `workflow_run` for completed CI and metadata-only
`pull_request_target` events (`ready_for_review`, `converted_to_draft`, `reopened`, `auto_merge_enabled`,
`closed`). Ordinary pushes are evaluated after CI completes; main-push CI completions skip the
state job. An hourly fallback refreshes only open PRs whose head lacks the required
status, or is pending only on an unready test merge, after GitHub finishes computing it. It refreshes status without creating deployment
jobs.
`preview.yml` accepts only explicit `workflow_dispatch` with a CI run id from `main`.
Every job checks out the default branch; the privileged automatic triggers are accepted in
`.github/zizmor.yml` because the state controller is the intended trusted boundary.

**Required Actions policy:** `preview-state.yml` is the only workflow in this public repository
that uses `pull_request_target`. GitHub blocks that event by default in public repositories from
2026-11-02 unless an applicable Actions event policy allows it, so the repository carries one policy
scoped to this workflow. It is external state that no checked-in file describes; recreate it with:

```bash
gh api --method POST \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  repos/tarkovtracker-org/TarkovTracker/actions/policies \
  --input - <<'JSON'
{
  "name": "Allow pull_request_target for preview-state",
  "enforcement": "active",
  "conditions": {
    "workflow_path": {
      "include": [".github/workflows/preview-state.yml"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "restrict_action_events",
      "parameters": {
        "allowed_events": ["pull_request_target", "workflow_run", "schedule"]
      }
    }
  ]
}
JSON
```

The `restrict_action_events` allowlist is exhaustive for this workflow and does not permit
`pull_request_target` anywhere else in the repository; the default public-repository block still
applies to every other workflow.

**Jobs:** `Refresh preview state` handles automatic events in one job that publishes status and
can request a separate Preview run when the PR is opted in or auto-merge is enabled.
`Plan preview` runs only on explicit dispatch, resolves the candidate through the API, requires
successful CI evidence, verifies the artifact's manifest and digest, and publishes the interim
status. Application, configuration, and dependency changes stay `pending` until preview is requested.
`Deploy preview` runs only for that dispatch in the `preview` environment (same-repository
candidates and forks opted in by a current maintainer) or `preview-fork` (forks without that opt-in,
required maintainer approval, self-approval disabled, administrator bypass allowed), repeats every
freshness and command-authorization check, re-verifies the artifact, uploads it with pinned Wrangler
from the default-branch lockfile using `--branch preview-*`, and verifies the Cloudflare deployment
record. `Preview smoke tests` runs Playwright without Cloudflare credentials against the unique
deployment URL. `Publish preview result` rechecks freshness and publishes success only for a
still-current candidate; any failed stage publishes failure, and a controller crash publishes
failure on the candidate revision.

**Defaults:** preview-required changes stay pending until explicitly previewed; drafts stay pending;
change sets with no deployable paths receive `success: not applicable`; fork PRs need both an
explicit dispatch and environment approval. A previous success is reused only for the same revision, artifact digest,
and profile version (`[preview <digest12> v1]` marker).

**Manual preview:** `gh workflow run preview.yml --ref main -f run_id=<ci-run-id>`. Use the
successful CI run for the PR's current head. The controller repeats every eligibility and freshness
check; it cannot bypass failed CI or deploy a stale revision.

The default-branch `preview-request.yml` workflow checks a command author's current repository
role and dispatches the same trusted Preview workflow when matching CI is ready. It replies to
authorized requests with the outcome; denied requests do not receive a bot reply. Edited comments
do not grant access. Fork CI omits PR snapshots, so run selection matches the head repository,
branch, and SHA; the controller then verifies the artifact's base and test merge against live GitHub
state. Every refresh reads all comment pages and rechecks the current requester's role. Only
owner, member, or collaborator comments cause permission lookups, so public outsiders
cannot trigger one permission lookup per author; association alone never grants access. The upload
job repeats that authorization check, so a stop, deleted command, or revoked role prevents a queued
opted-in upload. An upload already underway may finish after `/preview stop`.
An associated repository user's newer stop remains a revocation barrier if their former maintainer
role can no longer be verified; a new command from a current maintainer is required to resume.
Automatic dispatches carry the command ID and fail if it was revoked or superseded before planning;
they cannot silently fall back to the manual request path.
A fork with a live maintainer opt-in uses the `preview` environment without a second approval;
an explicit fork dispatch without one retains `preview-fork` approval or an administrator override.
Repeating a request for an already validated deployment reuses its evidence. Each new head or base
still requires fresh CI, artifact verification, deployment, and smoke tests.
Commands on a revision without deployable changes acknowledge the opt-in and skip the immediate
deployment; later deployable revisions can then refresh after their own successful CI.

For pull requests, `Preview Result` is published on the validated head commit only. GitHub
regenerates the test-merge commit (new SHA, same parents and tree) when a merge is attempted, so a
status there disappears and blocks the merge; strict ruleset freshness keeps a head-bound result
tied to current main. Artifact verification still binds to the test merge and accepts a
regenerated commit only with the same base/head parents and tree. A dispatched
branch build associated with a PR can satisfy it only when the build tree matches that test merge
and the PR base is current main; otherwise the result stays pending. Crowdin, Dependabot, and
standalone release candidates read the head status. A briefly missing test merge is retried and
the result stays pending. The hourly fallback re-evaluates that head once the test merge
becomes available after the event retry. One required context appears per PR.

**Late-build shadow:** `gh workflow run finalization-shadow.yml --ref main -f pull_request=<pr-number> -f ci_run_id=<ci-run-id>`.
Only a maintain/admin actor can request this non-authoritative rehearsal. It checks the current
PR, base, test merge, CI run and attempt, then builds a deployable candidate in an isolated
credential-free container unless the PR has no deployable changes. A trusted host step rejects links and special
files before upload; a fresh trusted runner seals the output as
`pages-preview-shadow`. The shadow does not deploy, publish `CI Result`/`Preview Result`, or change
merge behavior. Ordinary PR CI continues to build and upload `pages-preview`. Re-dispatch after a
push or base change; dispatch from `main` so the trusted default-branch workflow definition runs.
Requests without deployable changes recheck the revision before finishing. Fork runs without a CI API base snapshot
fail closed in the shadow; the existing protected `preview-fork` deployment path is unaffected.

**Trusted automation:** Crowdin translation merges and release staging request one preview after
their dispatched CI run succeeds on the exact candidate SHA. Allowlisted Dependabot auto-merge
requests one after all candidate checks pass and remains the sole automatic request owner for
Dependabot. Ordinary PR revisions request previews after CI when opted in with `/preview` or when
auto-merge is enabled without an explicit `/preview stop`.

**Metrics:** each controller run summary records the action (deploy/reuse/skip/wait/fail),
revision, digest, deployment URL, whether the result was published, and the validation-to-preview
duration. Deployment (`preview-deployment-<sha>`) and smoke (`preview-smoke-<sha>`) evidence
artifacts are retained for 30 days. Count deployments, skipped drafts, reused artifacts, and
failures from these summaries during observation.

#### External settings (verified 2026-09-23)

Cloudflare MCP readback: Pages project `tarkovtracker` keeps `main` as its production branch and
keeps production Git deployments enabled. `preview_deployment_setting` is `none`; preview runtime
variables match the anonymous checked-in configuration, and production KV and Durable Object
bindings and production secrets are absent. Production deployment configuration was unchanged.
The initial rollout readback found only `CI Result`. The live September 23 ruleset requires both
`CI Result` and `Preview Result`, and `.github/main-ci-ruleset.json` matches it. Restoring the
ruleset from that file preserves both required checks.
`preview` and `preview-fork` are restricted to `main`; fork previews require approval from
`DysektAI` or `Chica999` when no live command authorizes the PR. On September 26, administrator
bypass was enabled for `preview-fork`; self-approval remains disabled. Both environments
have `CLOUDFLARE_ACCOUNT_ID`. `CLOUDFLARE_PAGES_API_TOKEN` now exists as a secret in both
environments, and the repository-scoped copy was removed. GitHub confirms secret presence but does
not reveal its value or scope; the first manual deployment checks that the token works. The connected
Cloudflare API credential cannot create API tokens.

Ordered rollout (verify `Preview Result` enforcement; apply the ruleset only if it is absent):

1. Capture settings (done above). Readback commands, run with a scoped `CLOUDFLARE_API_TOKEN`:

   ```bash
   pnpm exec wrangler pages project list
   curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/tarkovtracker" |
     jq '{production_branch, preview: (.deployment_configs.preview | {env_vars: (.env_vars | keys), kv_namespaces, durable_object_namespaces}), build_config, source}'
   gh api repos/tarkovtracker-org/TarkovTracker/rules/branches/main
   gh api repos/tarkovtracker-org/TarkovTracker/environments --jq '.environments[] | {name, protection_rules}'
   ```

2. The trusted aggregate compatibility change (`optionalJobs` tolerance in
   `scripts/ci/validation-plan.mjs`) and the preview controller/manifest pipeline are already on
   `main`.
3. The operator created a Pages-only token and stored it in both protected GitHub environments;
   the repository secret was removed on 2026-09-23. This had to precede the bootstrap merge because
   a manual dispatch can select another ref's workflow file.
4. Merge the trusted-controller bootstrap change that fixes the default-branch credential mapping
   and makes automatic controller events wait instead of uploading. A PR's edits to
   `preview-state.yml` cannot exercise itself because `workflow_run` loads that workflow from `main`.
5. The live isolation and cost controls are complete: Cloudflare automatic preview builds are off,
   production deployments remain on, and the Pages preview runtime has no production secrets or
   bindings. GitHub environments are created and protected as described above. Do not reuse the
   KV-only `CLOUDFLARE_API_TOKEN`.
6. After the bootstrap change is on `main`, dispatch `preview.yml` with the successful `run_id` for
   PR #896's current head. Confirm upload, deployment record, smoke suite, and head-SHA status.
   Dispatch from `main`; do not test candidate-controlled workflow code with deployment secrets.
7. Verify that the deployed ruleset already requires `Preview Result` alongside `CI Result`, with
   strict freshness and the empty bypass list, and that a preview-required PR with a missing or
   pending `Preview Result` is blocked. Apply `.github/main-ci-ruleset.json` only if that
   requirement is absent, then repeat the verification. Confirm one current-head application PR
   uploads, passes smoke tests, and publishes `Preview Result: success`, and that its prior
   automatic result stayed pending without a Pages build. Review the controller's failure and
   stale-revision fixtures and the existing failed PR evidence:

   ```bash
   gh api repos/tarkovtracker-org/TarkovTracker/rules/branches/main
   # Only if Preview Result is not already required:
   gh api -X PUT repos/tarkovtracker-org/TarkovTracker/rulesets/23539975 --input .github/main-ci-ruleset.json
   ```

   Check documentation-only, translation, draft transition, approved fork, superseded revision,
   and release-staging behavior on the next matching live candidates. Keep fixture coverage for
   these cases; do not create extra Pages builds solely to exercise the rollout matrix.

8. Remove temporary compatibility behavior after the new paths are verified.

**Rollback:** before enforcement, disable the `Preview` workflow and re-enable automatic Cloudflare
preview builds. After enforcement, an operator must first remove `Preview Result` from the ruleset
(explicit ruleset change) before disabling the controller; never manufacture a successful preview
status. Worker deployment, authenticated backend behavior, and production rollout keep their
existing separate verification.

## Pre-commit Hooks

Git hooks via Husky enforce quality standards. They are a local convenience; CI
`pnpm run format:check` remains the merge gate.

### Setup (main checkout)

```bash
pnpm install
pnpm run prepare
```

### Setup (git worktree)

Bare worktrees often lack `node_modules` and husky’s `.husky/_` harness, so
pre-commit becomes a silent no-op. After `git worktree add`, from the worktree
root:

```bash
bash scripts/setup/setup-worktree.sh
```

That runs `pnpm install --frozen-lockfile` and `pnpm exec husky`. If install is
impossible, format staged paths yourself before committing (for example
`prettier --write` on touched markdown, `eslint --fix` on touched app files, and
`node scripts/checks/lint-blank-lines.mjs --fix` on supported source/config files).

### Hooks

**pre-commit (`.husky/pre-commit`):**

- Runs `lint-staged` for fast, targeted formatting and linting

**commit-msg (`.husky/commit-msg`):**

- Validates commit messages via commitlint
- Enforces conventional commit format

### Commit Message Format

```text
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types:** feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, wip

_Note: `wip` is a project-specific extension and is not part of the Conventional Commits spec._

**Scopes:** app, workers, api, ui, tasks, hideout, maps, team, settings, admin, i18n, deps, config, ci, test, docs, release

**Examples:**

```bash
feat(tasks): add quest filtering by map
fix(hideout): resolve station upgrade calculation
docs(readme): update deployment instructions
chore(deps): update nuxt to v4.2.2
```

## Dependency Updates

Automated via Dependabot (`.github/dependabot.yml`):

**Features:**

- Weekly dependency update batches for the pnpm workspace (root + `workers/api-gateway`)
- Monthly grouped GitHub Actions updates for manual review
- Official GitHub Actions are allowed to propose major updates so runtime migrations do not get stuck
  behind a minor/patch-only rule
- Cooldown windows to avoid immediate churn from fresh releases
- Patch cooldown is short so safe patch updates do not sit for a full week
- Grouped minor/patch updates for low-risk tooling families
- Version updates limited to direct dependencies; vulnerable transitives still surface through security updates
- Maximum 3 concurrent dependency PRs and 1 GitHub Actions PR
- Conservative auto-merge for allowlisted low-risk Dependabot groups after CI/security checks pass
- Gitleaks runs via a pinned CLI download in CI with release checksum verification instead of the deprecated `gitleaks-action` runtime

**Current package groups:**

- nuxt ecosystem
- lint and format tooling
- testing tooling
- typescript and `@types/*`
- tailwind tooling
- cloudflare tooling
- release tooling
- remaining dependency minor/patch updates

**Review strategy:**

- Let Dependabot batch low-risk tooling updates for scheduled review windows
- Let the auto-merge workflow clear allowlisted npm tooling PRs after checks pass
- Review every GitHub Actions PR manually, including minor and patch updates; update repository and
  organization Actions allowlists first when the pinned SHA is restricted
- Keep major upgrades explicit
- Allow official GitHub-maintained actions to propose major updates when GitHub changes required
  action runtimes, but do not auto-merge them
- Keep transitive lockfile churn out of version-update PRs unless GitHub raises a security fix
- Keep Nuxt/runtime, Cloudflare deployment tooling, TypeScript compiler, and catch-all dependency updates manual
- Review security PRs promptly; they remain separate from the scheduled version-update batches unless GitHub grouped security updates are enabled in repository settings

## Development Environment Setup

Automated setup script for new contributors:

```bash
pnpm run setup
```

**Script performs:**

1. Prerequisites check (Node.js, pnpm via Corepack, git)
2. Install dependencies
3. Setup git hooks (Husky)
4. Create `.env` from `.env.example` (migrates a legacy `.env.local` if present;
   never overwrites an existing `.env`)
5. Install worker dependencies

**Manual steps after setup:**

1. Update `.env` with your Supabase credentials if you need login or sync
2. Run `pnpm run dev`
3. Visit <http://localhost:3000>

> Do not commit `.env` — it is in `.gitignore`. The canonical env-var reference
> lives in [`architecture.md`](./architecture.md) and [`runbook.md`](./runbook.md).

## Deployment Process

### Automatic Deployment

Push to `main` triggers:

1. CI validation in GitHub Actions
2. Cloudflare Pages deploy for the connected branch
3. Cloudflare-managed worker deploys for the connected branch
4. Supabase GitHub integration — applies pending DB migrations and deploys Edge Functions
   (surfaces as the `Supabase Preview` check on the merge commit)
5. Smoke tests in production

GitHub Actions deploys nothing to production; items 2-4 are separate Git integrations. Pull-request
previews use the trusted controller (§8) to upload validated CI builds only after an explicit
maintainer dispatch. Cloudflare automatic preview builds are disabled; production Git deploys remain
enabled. See the Deployment section of [`runbook.md`](./runbook.md) for what to verify after each
merge.

Each release adds one extra deploy for the `chore(release): <version>` commit that carries the
bumped `package.json`; it makes the footer version match the release. Merges between releases
deploy normally and keep the previous version number.

### Manual Deployment

Fallback only, for when an integration fails. Supabase fallbacks (`supabase db push --linked`,
`supabase functions deploy --use-api`) are documented in [`runbook.md`](./runbook.md) rather than
duplicated here:

```bash
# Local deployment (run from project root: /home/lab/TarkovTracker or equivalent)
pnpm run build
pnpm --filter api-gateway exec wrangler deploy
```

> **Note:** All local deployment commands assume you are in the project root directory.

## Monitoring & Notifications

### Coverage Reports

- Coverage is uploaded to Codecov by the CI `test` job. Repo-level config is in `.github/codecov.yml`. Uses the org-level `CODECOV_TOKEN` secret for token-authenticated uploads (required on protected branches).
- Bundle analysis is uploaded by the CI `validate` job during `pnpm run build` via `@codecov/nuxt-plugin` (configured in `nuxt.config.ts`). The plugin only activates when `CODECOV_TOKEN` holds a non-empty value, so local builds without that variable and fork pull requests are unaffected. A fork pull request receives no org secrets, so the secret expression expands to an empty string rather than being absent; the emptiness check is what keeps the plugin from loading without a usable upload token.
- The `validate` job's production build runs on fork pull requests too. It needs no secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY` expand to empty strings and the app builds in its offline configuration, which still exercises the same TypeScript, bundling, and Nitro output. Coverage and bundle uploads stay fork-skipped because those do require the org token.
- Test results (JUnit XML) are uploaded via `codecov/codecov-action` with `report_type: test_results`. Vitest outputs `test-report.junit.xml` when `CI=true` (configured in `vitest.config.ts`). The upload step is `!cancelled()`-gated so failing shards' reports still reach Codecov.
- The CI `test` job runs as a 4-way shard matrix (`Test (shard 1/4)` through `Test (shard 4/4)`). Each shard sets `VITEST_SHARD=N/4`, which enables the `github-actions` reporter (annotates failed tests on the PR diff), disables per-shard coverage thresholds, and reports only files imported by that shard. Codecov merges the per-shard lcov uploads and enforces an absolute floor via the `absolute-floor` project status in `.github/codecov.yml`.
- Local `pnpm run test` / `pnpm run test:coverage` remain unsharded. Coverage runs retain the full `app/**/*.{ts,vue}` denominator and enforce the Vitest thresholds.
- The measured logic baseline, current module mapping, coverage floors, and reproduction commands are documented in [testing-coverage.md](testing-coverage.md). Run Nuxt-generating checks separately from coverage to avoid regeneration races.

## Local Development Workflow

### Standard Flow

```bash
# Start development
pnpm run dev

# Make changes
git add .
git commit -m "feat(scope): description"  # Husky runs format + lint

# Push changes
git push  # GitHub Actions runs CI

# Create PR
# - Auto-labeled by changed files
# - Size label added
# - Commit messages validated
# - CI checks run
```

### Testing

```bash
pnpm run test           # Run all tests
pnpm run test:watch     # Watch mode
pnpm exec vitest --ui        # UI dashboard
```

### Format & Lint

```bash
pnpm run format         # Prettier + ESLint + blank-line fix
pnpm run lint           # Lint
pnpm run lint:blank-lines # Blank-line check only
pnpm run lint:fix       # Auto-fix issues
```

## Troubleshooting

### Pre-commit Hook Failing

```bash
# Skip hooks (emergency only)
git commit --no-verify -m "message"

# Fix issues
pnpm run format
pnpm run lint:fix
```

### CI Failing

**Quality job:**

- Run `pnpm run lint` locally
- Check type errors with `pnpm run typecheck`

**Test job:**

- Run `pnpm run test` locally
- Check test coverage

**Build job:**

- Run `pnpm run build` locally
- Verify environment variables

### Deployment Failing

**Pages deployment:**

- Check the Cloudflare Pages deployment log for the branch
- Verify build output in `dist`
- Verify required environment variables in Cloudflare

**Workers deployment:**

- Verify Cloudflare Worker Git deployment status or deploy with `wrangler`
- Check worker-specific secrets and bindings
- Validate `wrangler.toml` and test locally with `pnpm --filter api-gateway run dev`

## Best Practices

### Commit Messages

- Use conventional commits format
- Keep subject under 100 characters
- Reference issues: `fix(api): resolve #123`

### PRs

- Keep PRs focused (prefer size/S or size/M)
- Update tests for new features
- Run format/lint before pushing
- Start local review alongside relevant checks after the diff stabilizes; request PR review selectively under the root review policy

### Dependencies

- Let Dependabot handle scheduled version updates
- Review grouped low-risk tooling updates together
- Test major version upgrades and framework/runtime bumps locally

### Security

- Never commit secrets to repository
- Review Dependabot security PRs immediately
- Run `pnpm audit` before releases

## Configuration Files

**Workflow Automation:**

- `.github/workflows/*.yml` - GitHub Actions workflows
- `.husky/*` - Git hooks
- `commitlint.config.js` - Commit message rules
- `.github/dependabot.yml` - Dependabot update config
- `.releaserc.json` - Semantic release config

**Development:**

- `.github/labeler.yml` - Auto-labeling rules
- `scripts/setup/setup-dev-environment.sh` - Setup automation

## Additional Resources

> **Note:** External links are checked on main documentation pushes, weekly, and by manual dispatch
> via the `link-check` workflow.
> Last manual verification: 2026-01-30

| Resource             | Link                                                                                         | Notes                     |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| GitHub Actions Docs  | [docs.github.com/en/actions](https://docs.github.com/en/actions)                             | Stable documentation URL  |
| Conventional Commits | [conventionalcommits.org/en/v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)          | Versioned spec permalink  |
| Semantic Release     | [semantic-release.gitbook.io](https://semantic-release.gitbook.io/semantic-release/)         | GitBook hosted docs       |
| Dependabot Docs      | [docs.github.com/code-security/dependabot](https://docs.github.com/code-security/dependabot) | Official documentation    |
| Cloudflare Pages     | [developers.cloudflare.com/pages](https://developers.cloudflare.com/pages/)                  | Cloudflare developer docs |
