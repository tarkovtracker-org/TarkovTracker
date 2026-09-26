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
- Codex is the intended primary PR reviewer. GitHub App delivery and exclusions must be verified before disabling existing automatic providers; dashboard state is not inferred from repository configuration.

## Agent validation and review

`package.json` defines commands; the root `AGENTS.md` defines required validation and review, and
path-scoped `supabase/AGENTS.md` and `workers/api-gateway/AGENTS.md` add area-specific rules.
`code_review.md` supplements that contract with risk areas, without requiring the full suite for
unrelated changes. Worktree setup and the shared CI setup action use `scripts/ensure-pnpm.sh` to
verify pnpm against `packageManager`, preparing its complete integrity-qualified pin even when the installed version matches.

Run focused checks while implementing, then required checks after the diff stabilizes. Record the
commit, dirty worktree state, commands, and results in the PR summary. Invalidate affected results
when their inputs change. Batch substantiated corrections; defer unrelated cleanup and optional
style suggestions.

Documentation, translation, and mechanical formatting changes need deterministic checks and
self-review. Routine executable changes also receive Codex PR review. Substantial behavior changes
(public contracts, persisted state, cross-module behavior, auth, billing, migrations, concurrency)
also receive one best-effort local CodeRabbit review of the complete branch diff after it stabilizes.
Auth, billing, migration, and concurrency changes require independent review; another provider or
human substitutes if needed. Record missing/rate-limited review as incomplete without retry loops.
Only substantial behavioral corrections or unresolved significant findings warrant a local rerun.

### Reviewer transition: external verification pending

1. Verify Codex delivers a review on a representative application PR.
2. Verify a translation-only PR consumes no automatic review, and a mixed translation/code PR is
   still reviewed. Use selective review requests until exclusions are demonstrated.
3. After delivery is established, disable duplicate automatic CodeRabbit, Cubic, and Greptile
   reviews in their repository/dashboard settings; retain manual access. Record the PR links and
   observed settings here. Existing settings remain unchanged until that evidence exists.
4. Check an existing-review revision and unavailable/quota-exhausted behavior: preserve completed
   review evidence by revision and never report an unavailable review as successful.

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
known documentation-only change sets need no deployable preview; translations, configuration,
dependencies, executable changes, and unknown or unreadable paths require one, so a
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
[SYSTEMS.md §14](SYSTEMS.md#14-release-validation-and-publication).

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

The shared setup action uses `.nvmrc`, the full `packageManager` pin, pnpm caching, and a frozen
installation. Each caller owns checkout history and credential settings. `Lint & Format` runs lint
and Prettier once each (lint already includes blank-line validation), plus i18n and workflow fixtures.
When automation files change it also runs pinned, checksum-verified release binaries of `actionlint`
(syntax, expression, and shellcheck errors) and `zizmor` (workflow security) at `low` severity and
above; `.github/zizmor.yml` records the accepted findings with their justification. Neither tool is
Node tooling, so both are pinned in the workflow step rather than `package.json`. To update either,
change the version and the `SHA256` value to the `digest` GitHub records for the release asset.
The four Vitest shards, dedicated Deno tests, Supabase validation, Worker validation, and production
build retain their existing commands and environment behavior. Tests in `scripts/ci-tests/` use
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
full validation: application code and Vitest fixtures consume it, and `scripts/crowdin-pr.sh` draws
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
   assertion in `scripts/ci-tests/workflows.mjs` in the same change (workflow edits select full
   validation, so `test:workflow` runs on the rollback itself); the flag remains supported.
3. Release deduplication is handled separately in [PR #805](https://github.com/tarkovtracker-org/TarkovTracker/pull/805).
   Path selection does not change release triggers, validation, or main-run cancellation.
   Do not treat local fixtures as evidence of GitHub App or branch-protection behavior.

The initial observations come from the pre-rollout baseline collected on 2026-09-06, which was
archived in git history once the rollout completed (recorded 2026-09-16; no report file remains
in-tree).
The read-only `scripts/workflow-metrics.mjs` collector samples the preceding 20 merged PRs and emits
per-PR CI and release timings as JSON. Run it with authenticated `gh` and save stdout to a report:

```bash
node scripts/workflow-metrics.mjs --before <rollout-ISO-time>
node scripts/workflow-metrics.mjs --after <rollout-ISO-time> --count 20
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

`scripts/fallow-audit.mjs` creates a temporary local clone and two analysis commits. Both contain
a physical copy of the current generated `.nuxt` context; the second contains the current source
tree. This prevents Fallow's internal base snapshot from symlinking the generated tsconfig and
resolving its relative `@/` aliases against the wrong directory. Dependencies are linked from the
installed checkout. Neither the source index, source files, branches, nor Git worktree registrations
are modified, and the temporary clone is removed after success or failure. Run `pnpm install`
first, as usual, to prepare dependencies and Nuxt types.

Use `--format json` for structured findings. Each run uses fresh analysis without reusable caches.
The report's Git IDs belong to the temporary analysis commits; the original source base and HEAD
are printed on stderr. Invalid refs and setup/analyzer failures exit nonzero instead of skipping the gate.

Regression checks live in `scripts/fallow-audit.test.mjs` and run with the regular test suite or
`pnpm exec vitest run scripts/fallow-audit.test.mjs`.

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
  checksum-verified Gitleaks secret detection (blocking)
- `codeql` - CodeQL static analysis; the analysis must succeed, findings are triaged in code scanning

**Triggers:** `workflow_call` from CI (pull requests, main pushes, explicit dispatches including
Crowdin and release staging) and the weekly schedule (Sunday 00:00 UTC). The former push and
pull_request triggers were removed so each revision is scanned once, inside the gated run.
`CI Result` requires the call's success: scanner errors, cancellation, or a missing result fail the
aggregate. The trusted aggregate contract (`scripts/validation-plan.mjs`) landed in a compatibility
change first (an absent `security` job was tolerated, a reported non-success failed); the
activation change made the job mandatory.

### 3. Release Automation (`.github/workflows/release.yml`)

Semantic versioning with automated releases:

**Jobs:**

- Reuses the successful `CI` run for the exact `main` commit, including all four test shards
  and the Supabase reset, lint, and pgTAP checks
- Runs the production build before publishing
- Generates changelog from conventional commits
- Creates GitHub releases
- Updates version in package.json

**Triggers:** Completion of `CI` for a successful same-repository push or explicit dispatch on `main`. PR runs, failed
or cancelled CI, and fork runs cannot publish. Successful CI reruns can retry release eligibility;
there is no manual bypass of the CI gate. Documentation-only pushes may reach the gate, but
semantic-release still decides whether the accumulated conventional commits warrant a version.

`release-gate.mjs` re-reads the triggering run and `refs/heads/main` before dependency setup and
again immediately before publishing. It verifies the CI workflow path, conclusion, SHA, and run
attempt. Superseded commits skip; release never substitutes a newer, unvalidated checkout.
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

**Version-bump commit:** `scripts/release-commit.mjs` prepares the bumped `package.json` and
`CHANGELOG.md` as `chore(release): <version>` with no skip marker. The plugin supports the
main-only release workflow. It stages only these generated assets and rejects unrelated staged
files. `scripts/release-commit.sh` pushes the new commit to
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
[SYSTEMS.md §14](SYSTEMS.md#14-release-validation-and-publication).

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
footer match the published release. Staging branches may also receive preview builds according
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
- `refactor:` → patch version bump
- `revert:` → patch version bump
- `BREAKING CHANGE:` → major version bump

### 4. PR Checks (`.github/workflows/pr-checks.yml`)

Enhanced PR validation:

**Jobs:**

- `PR Meta` - auto-label based on file changes, PR size classification (S/M/L/XL/XXL), and
  commit message validation
- `Lighthouse scope` - decides whether the Lighthouse audit is relevant
- `Lighthouse` - Performance checks (runs when the PR touches `app/components/`, `app/features/`,
  `lighthouserc.json`, or the PR Checks workflow, or carries the `performance` or `ui` label)

**Lighthouse collection (`lighthouserc.json`):** each selected URL is audited once per Lighthouse
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

Maintainers and administrators can comment `/preview` once to enable previews for a PR, including
fork PRs. The current revision is requested immediately if CI is ready; otherwise the next
successful CI run requests it. Later revisions refresh automatically after successful CI.
`/preview stop` disables automatic requests; another `/preview` enables them again. Drafts remain
paused and resume when marked ready. This opts into previews without opting into merging.
The latest unedited command from a current maintainer controls the PR. Comments predating the
opt-in activation instant retain their original one-revision meaning and do not grant persistent
access. The activation instant defaults to the contract start shipped with the handler, so no
manual post-merge variable flip is required; the optional repository variable
`PREVIEW_OPT_IN_START` overrides it for continuity after handler reverts. A non-empty value must
round-trip as a canonical UTC ISO instant — `0`, date-only, zone-less or impossible values fail
closed and grant no persistent preview access (an override earlier than the contract start
likewise grants nothing and serves as an explicit off switch).
A `/preview stop` remains a revocation barrier when its author currently verifies as maintain/admin,
or when the request handler accepted it while verifying access — recorded by an acceptance receipt
comment from `github-actions[bot]`. A historical stop lacking both is not honored, so the previous
enabled opt-in stays in control; resuming always happens with a fresh command from a current
maintainer. Manual `workflow_dispatch` previews on the trusted default branch own their
authorization directly: they carry no standing command authority and cannot be revoked by a later
stop, while requests bound through `request_comment_id` are re-verified before upload.
Dependabot retains its dedicated automatic preview owner; `/preview` can request its current
revision, but does not add a second automatic dispatcher.
Enabling auto-merge also requests previews when no explicit preview command overrides it.
The status controller dispatches `preview.yml` on `main`, carrying the CI run ID;
it checks for a matching active dispatch created after the current CI attempt completed so repeated events preserve in-flight previews
and fork approval requests. Failed or cancelled dispatches remain retryable. Manual `/preview`
and workflow dispatch remain available. Repository `allow_auto_merge` must be enabled to use
this optional request path. Automatic events do not upload artifacts themselves.

GitHub Actions controls when pull-request previews deploy to the existing Cloudflare Pages project
(`tarkovtracker`, `tarkovtrackernuxt.pages.dev`). The controller publishes `Preview Result` on the
validated head SHA for PRs and standalone release candidates; an explicit
maintainer request or trusted merge automation
dispatch uploads the validated artifact. Cloudflare-managed preview builds are disabled while automatic production deployments
for `main` remain enabled. The live ruleset requires both `CI Result` and `Preview Result`;
rollout verifies that enforcement. The design, result contract, and invariants are specified in
[SYSTEMS.md §19](SYSTEMS.md#19-actions-owned-cloudflare-previews).

**Triggers:** `preview-state.yml` receives `workflow_run` for completed CI and metadata-only
`pull_request_target` events (`ready_for_review`, `converted_to_draft`, `auto_merge_enabled`,
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
documentation-only PRs receive `success: not applicable`; fork PRs need both an explicit dispatch
and environment approval. A previous success is reused only for the same revision, artifact digest,
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
Documentation-only commands acknowledge the opt-in and skip the immediate deployment; later
executable revisions can then refresh after their own successful CI.

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
credential-free container unless the PR is docs-only. A trusted host step rejects links and special
files before upload; a fresh trusted runner seals the output as
`pages-preview-shadow`. The shadow does not deploy, publish `CI Result`/`Preview Result`, or change
merge behavior. Ordinary PR CI continues to build and upload `pages-preview`. Re-dispatch after a
push or base change; dispatch from `main` so the trusted default-branch workflow definition runs.
Docs-only requests recheck the revision before finishing. Fork runs without a CI API base snapshot
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
   `scripts/validation-plan.mjs`) and the preview controller/manifest pipeline are already on
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
bash scripts/setup-worktree.sh
```

That runs `pnpm install --frozen-lockfile` and `pnpm exec husky`. If install is
impossible, format staged paths yourself before committing (for example
`prettier --write` on touched markdown, `eslint --fix` on touched app files, and
`node scripts/lint-blank-lines.mjs --fix` on supported source/config files).

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
> lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`runbook.md`](./runbook.md).

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

A releasing merge deploys twice: once for the merge commit, then again for the
`chore(release): <version>` commit that carries the bumped `package.json`. The second
deploy is what makes the footer version match the release, so treat it as part of the merge rather
than a stray build.

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

- Coverage is uploaded to Codecov by the CI `test` job. Repo-level config is in `codecov.yml`. Uses the org-level `CODECOV_TOKEN` secret for token-authenticated uploads (required on protected branches).
- Bundle analysis is uploaded by the CI `validate` job during `pnpm run build` via `@codecov/nuxt-plugin` (configured in `nuxt.config.ts`). The plugin only activates when `CODECOV_TOKEN` holds a non-empty value, so local builds without that variable and fork pull requests are unaffected. A fork pull request receives no org secrets, so the secret expression expands to an empty string rather than being absent; the emptiness check is what keeps the plugin from loading without a usable upload token.
- The `validate` job's production build runs on fork pull requests too. It needs no secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY` expand to empty strings and the app builds in its offline configuration, which still exercises the same TypeScript, bundling, and Nitro output. Coverage and bundle uploads stay fork-skipped because those do require the org token.
- Test results (JUnit XML) are uploaded via `codecov/codecov-action` with `report_type: test_results`. Vitest outputs `test-report.junit.xml` when `CI=true` (configured in `vitest.config.ts`). The upload step is `!cancelled()`-gated so failing shards' reports still reach Codecov.
- The CI `test` job runs as a 4-way shard matrix (`Test (shard 1/4)` through `Test (shard 4/4)`). Each shard sets `VITEST_SHARD=N/4`, which enables the `github-actions` reporter (annotates failed tests on the PR diff), disables per-shard coverage thresholds, and reports only files imported by that shard. Codecov merges the per-shard lcov uploads and enforces an absolute floor via the `absolute-floor` project status in `codecov.yml`.
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
- `scripts/setup-dev-environment.sh` - Setup automation

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
