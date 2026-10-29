# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to `main` and `wip/**` branches, PRs targeting `main`, manual dispatch
**Concurrency:** Outdated runs are automatically cancelled for the same PR or branch.
**Jobs:**

- `Validation plan` — classifies the diff. Pull requests that touch only root/`docs/`/`.github/`
  Markdown or Crowdin-owned `app/locales/*.json` translations run the reduced set (`Lint & Format`
  formatting, i18n when locales change, `Systems drift check`, `Security`). A lockfile-only Prettier
  refresh can select the narrowly verified formatter profile: complete immutable manifests stay
  identical, only the formatter leaf and its existing plugin peer binding change, and all runtime/
  build dependency records stay unchanged. It retains lint, formatting, scanner coverage, every
  workflow test, systems drift, security and admission; app/DB/Worker/build jobs can skip. CI and
  trusted preview verification use the current base SHA, not just the PR merge base. Manifest,
  plugin package upgrades, mixed or uncertain changes — including the source locale `app/locales/en.json` — every
  push, and every dispatch run the full set. Unreadable evidence fails closed to full validation.
  See [narrow formatter validation](../../docs/workflow-automation.md#narrow-formatter-validation).
  Merge-group runs first ask main's `scripts/preview/queue-reuse.mjs` whether the queue tree is
  identical to a fully validated and previewed PR revision; if so they run only the always-selected
  jobs ([queue reuse](../../docs/merge-queue-rollout.md#reusing-identical-pr-validation-in-the-queue)).
- `CI Result` — strict aggregate of selected jobs; missing data or unexpected skips fail
- `Lint & Format` — ESLint + Prettier, i18n, Node workflow fixtures, and (for non-Markdown
  automation paths and unreadable diffs) checksum-verified `actionlint` plus `zizmor`
  (`.github/zizmor.yml` records accepted findings)
- `Fallow audit` — changed-file dead code, duplication, and complexity gate
- `Type Check` — `vue-tsc` / Nuxt type checking
- `Test (shard 1/4)` … `Test (shard 4/4)` — Vitest with coverage, sharded across 4 parallel jobs. The `github-actions` reporter annotates failed tests directly on the PR diff so the failing test name and assertion are visible without digging into logs. Shards report imported files only and skip thresholds; Codecov merges their lcov uploads.
- `Coverage thresholds` — merges the shard blob reports with the full `app/**/*.{ts,vue}` denominator (`scripts/ci/vitest-merged-coverage.mjs`) and enforces the `vitest.config.ts` thresholds. Uploads `coverage-final` for metrics.
- `Validate` — Nuxt build for full or preview-required validation, including forks; preview builds export a validated artifact and main builds export the production artifact
- `Supabase DB` — Reset + pgTAP regressions + lint local migrations
- `Systems drift check` — verifies `docs/systems/` invariants against the codebase
- `Workers` - Verify immutable frontend contracts pins, then fetch the exact tagged API source,
  compare compiled contracts, run its standalone types/schema/API/workerd/dry-run checks, and
  run all-mode frontend integration tests. No local gateway workspace remains.

Heavy jobs run in parallel after classification; systems drift runs independently.
Lighthouse scope detection runs independently of PR metadata.

### Crowdin Sync (`.github/crowdin.yml`)

**Triggers:** English source, Crowdin config, sync workflow, `scripts/ci/crowdin-pr.sh`, or
`scripts/ci/github-ci-gate.sh` changes on `main`; weekly on Mondays at 04:17 UTC; manual dispatch on
`main`. Runs are serialized without cancelling an active sync. Every run uploads `app/locales/en.json` to the Crowdin `main` branch so translators see new
strings immediately. Push runs stop there; only the weekly schedule and manual dispatch download
translations to `app/locales/%two_letters_code%.json` (preserving the directory hierarchy) and open
or merge the locale PR. Untranslated strings use the English fallback until then; dispatch the
workflow manually when translations must ship sooner. It never uploads local translations. The
existing `locales` branch supplies translation PRs targeting `main`.

Repository secrets `CROWDIN_PROJECT_ID` and `CROWDIN_PERSONAL_TOKEN` authenticate to Crowdin only.
Synchronization, branch updates, CI dispatch, and a strict-mode merge use the built-in
`GITHUB_TOKEN`; queue submission uses the
[Queue Submitter App](../../docs/merge-queue-rollout.md#queue-submitter-provisioning).
The job grants contents/pull-request write, actions write, and checks read permissions. No personal
GitHub token is required. Explicit `workflow_dispatch` starts CI on `locales` before merging and
on `main` afterward. No write token is passed to dependency installation or project validation.

When new translations are synchronized, `scripts/ci/crowdin-pr.sh` verifies an open, non-draft,
same-repository `locales` PR targeting `main`, explicitly starts CI for the validated candidate,
and captures and fetches the exact candidate head. Only regular non-English JSON files directly
inside `app/locales/` may differ; empty diffs, deletions, symlinks, renames from other paths, and stale
executable code are rejected. The checkout and dependency setup use this validated commit before
formatting (`format:check`), locale integrity (`i18n:check`), and systems drift (`systems:check`) run.

The gate's behavior follows the main policy mode reported by `scripts/ci/github-ci-gate.sh`
([current state](../../docs/merge-queue-rollout.md#current-state)):

- `queue` (live): a behind branch is left unchanged and the PR's changes are compared against its
  merge base. Later rechecks verify only that the PR head is unchanged, not the captured main SHA;
  the queue validates integration with current main. `MERGEABLE` with `CLEAN`, `UNSTABLE` or
  `BEHIND` is accepted.
- `strict` or `strict-queue` (strict freshness active; re-enabling `Main CI freshness` while the
  queue stays active yields `strict-queue`): the gate asks GitHub to merge main into a behind
  branch using an expected-head guard and waits for the new head. The candidate must contain
  captured main, its full tree is compared with that main SHA, and rechecks reject a changed PR
  head or main SHA. `MERGEABLE` / `CLEAN` is accepted directly; for `MERGEABLE` / `UNSTABLE` the
  gate first revalidates `CI Result` and `Preview Result` on the exact head.

Before submitting, the gate awaits successful `CI Result` and `Preview Result` on the exact
candidate head (each wait bounded to 60 minutes) and verifies that the effective repository rule
enforces strict freshness or the complete queue policy. Unresolved GitHub calculations are retried
up to 20 times, three seconds apart; conflicts and otherwise ineligible states fail closed in
every mode. The gate never uses the admin bypass, and GitHub's server-side branch rules still
enforce every required check; a missing or weakened required check leaves the PR open.

- `queue` and `strict-queue`: the gate awaits exact-head `Review Admission`, then submits a native
  queue entry pinned to the validated head (`scripts/ci/enqueue-pr-cli.mjs`) and reports it as
  queued. Merge-group CI validates the combined tree; main CI is not dispatched for a queued entry.
  Automation submits with the Queue Submitter App token, because a `GITHUB_TOKEN` submission
  starts no `merge_group` CI. The submitting steps set `QUEUE_SUBMITTER_REQUIRED`, so without
  the App configuration they fail before submitting instead of falling back to the job token;
  only local maintainer runs keep their inherited `gh` credential
  ([provisioning](../../docs/merge-queue-rollout.md#queue-submitter-provisioning)).
- `strict` only: `gh pr merge --squash --match-head-commit` atomically guards against a
  last-moment PR push, and a fixed commit body prevents inherited CI-skip markers from
  suppressing the post-merge run. After the merge the gate dispatches `CI` on `main`; if that
  dispatch fails, dispatch it manually (rerunning a no-change sync does not recreate the merged
  PR). Publication still requires successful CI for current main.

If the PR head changes during validation (or, with strict freshness active, main changes), rerun
Crowdin Sync; do not bypass the guard. The gate is copied from trusted main before
synchronization, and both trusted gate scripts are preserved before checkout changes. The
[Crowdin automatic merges](../../docs/systems/ci-and-release.md#crowdin-automatic-merges) spec owns
the invariants; see `docs/workflow-automation.md` for the repository-wide policy and release
compatibility.

Cloudflare Git deployments run independently of GitHub Actions. Release eligibility still requires
successful push or dispatched CI for current main, and semantic-release decides whether a version is warranted;
translation-only `chore(i18n)` commits do not themselves require a version bump.

Before enabling this workflow on `main`:

- Confirm the job token can create/update PRs and dispatch CI. A rejected request fails the workflow.
- After the first successful merge, verify a dispatched CI run validates current main and that
  Release evaluates that CI result. Check Cloudflare deployment separately.

1. Confirm the existing Crowdin source is under the Crowdin branch `main` at
   `app/locales/en.json`. Crowdin branches are separate from GitHub branches; if the source lives
   at the Crowdin project root, omit `crowdin_branch_name` before the first run.
2. Disable the native Crowdin GitHub integration's synchronization for this repository so both
   integrations cannot write concurrently. Preserve the Crowdin project, translations, and GitHub
   `locales` branch.
3. Review and merge or close any existing `locales` PR authored by a personal account. The Action
   reuses open PRs and cannot change their author. Keep the branch when disposing of the old PR.
4. Ensure Actions may create PRs and the repository's selected-action policy permits
   the pinned `crowdin/github-action` v3 commit and `actions/checkout@v7`.

After merging, inspect the first sync run and the next translation PR: verify its author, base,
and that its diff contains only expected non-English locale exports. The Action creates a PR
when it commits changed translations; a no-change run may create no PR. If necessary, dispatch
`Crowdin Sync` on `main` after new translations are available. Do not enable runner debug logging
for this workflow: the upstream Action prints its environment in debug mode.

### Crowdin locale PRs

`CI`, `PR Checks`, and `Security` report for translation-only PRs. The classifier selects
formatting, i18n, and systems drift for locale-only pull requests; the aggregate `CI Result` still
reports, and Crowdin dispatches a preview so `Preview Result` reports on the PR head; both are
required. Non-English locale formatting exclusions remain
intact. See the rollout record in `docs/workflow-automation.md`.

Crowdin Sync creates PRs using `GITHUB_TOKEN`. It explicitly dispatches and awaits full CI in addition to
direct validation before auto-merging safe translation updates.

### Security (`security.yml`)

**Trigger:** Push to `main`, PRs, weekly schedule
**Jobs:** `Security Scan` (audit + checksum-verified Gitleaks CLI), `CodeQL` (static analysis)

### Release (`release.yml`)

**Trigger:** Daily eligibility check (15:00 UTC) and manual dispatch on `main`. Scheduled publication
is due seven full days after the latest stable release, including manual releases; overdue attempts
retry daily. Checks within the interval skip setup and building. Deploys do not wait for it; every
merge still deploys on its own.
**Jobs:** `Release` (find the newest main CI run for the trigger commit and require success, check
current main, install through the shared `setup-project` action, build, recheck, semantic-release).
The workflow reuses CI's test shards and database checks. It rejects other refs and events, failed
or unfinished CI, a moved main, and automation-skip directives before publishing. Releases batch
every commit since the previous tag; conventional commits outside internal scopes determine
whether a version is warranted (`scripts/release/release-scope.mjs`). Publication is serialized without
cancelling an active release. See `docs/workflow-automation.md` for details.

### PR Title (`pr-title.yml`)

**Trigger:** PR opened/edited/updated/reopened
**Jobs:** `PR Title` — requires a conventional type prefix (`scripts/checks/check-pr-title.mjs`).
Squash merges make the title the commit on `main`, so this is the only commit-format check in CI;
edit the title to re-run it.

### PR Checks (`pr-checks.yml`)

**Trigger:** PR opened/updated/reopened
**Jobs:** `PR Meta` (labels, size), `Lighthouse scope` (lightweight detection), `Lighthouse` (conditional on UI file changes, Lighthouse configuration/workflow changes, or `ui`/`performance` labels)
**Lighthouse server:** Builds the Cloudflare Pages app and serves it with `wrangler pages dev`
so `/api/*` routes are available during audits. The build sets
`NUXT_PUBLIC_PROMOTED_TWITCH_ENABLED=false` so audits measure the app itself rather than the
promoted Twitch embed, whose heavy third-party iframe (script eval, layout shift, third-party
cookies) loads only when the streamer is live and previously made scores non-deterministic.
**Lighthouse collection:** Each selected URL is audited once per Lighthouse job. A single run keeps
the UI regression gate useful without making nine full audits block each update. Investigate
failures with local repeated runs when runner variance is suspected.
**Lighthouse thresholds:** Calibrated to the real full-data Pages preview baseline with the
promoted Twitch embed disabled (see above). Best-practices, SEO, and accessibility floors are
`error`-level at 0.9 since the embed-free audits clear them comfortably (best-practices and SEO
1.0, accessibility 0.92-0.96). Performance floors stay conservative: `/hideout` has little margin
and `/` can dip on cold starts. The `/hideout` performance floor remains 0.2; single-run scores
near the threshold can still require a rerun to distinguish runner variance from a regression.
These routes need real layout-shift (CLS ~1.38) and main-thread (TBT ~2.3s) work before raising.
Raise `lighthouserc.json` score floors after
performance/accessibility work instead of treating the current floors as long-term targets.

### Dependabot Auto Merge (`dependabot-auto-merge.yml`)

**Trigger:** Dependabot PR opened/updated/reopened/ready for review
**Jobs:** `Auto-merge safe Dependabot PR` (Dependabot-authored and Dependabot-triggered only, npm
tooling allowlist gate, wait for check runs and legacy status contexts, verify and match the
validated head SHA, then squash merge in `strict` mode or, in `queue`/`strict-queue`, await
exact-head `Review Admission` and submit a head-pinned native queue entry). Every GitHub Actions
workflow-file change requires manual review, including changes to permissions, triggers, or commands.
Action updates additionally require repository or organization allowlist verification when they
introduce a new pinned SHA.

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark inactive issues/PRs stale, then close stale items unless labeled `never-stale`

## Merge checks

Dependabot PRs receive full CI unless complete immutable evidence proves the narrow lockfile-only
Prettier profile above. A bot author or tooling label alone never selects reduced validation. Main merges only through the
native merge queue; its required checks and the strict-freshness rollback are owned by
[merge queue rollout](../../docs/merge-queue-rollout.md#current-state). The preview controller reports success without deployment for verified change sets with no
deployable paths; preview-required changes stay pending until an explicit validated deployment passes.
Reduced CI runs can skip jobs by design without leaving a PR blocked on a missing context. External
Codecov/Security gates remain unchanged; Codecov statuses default to success when no report exists.

`Release` prepares a version PR only on its daily check or manual dispatch; trusted main CI
completion only wakes finalization of an already merged version PR
([release automation](../../scripts/release/README.md#queue-promotion)). It publishes only when
the newest main CI run for its commit succeeded.
Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`.

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

## AI Review Bots

The root `AGENTS.md` owns review requirements. See
[workflow automation](../../docs/workflow-automation.md#push-cadence) for push batching.
Dashboard settings must be verified separately; checked-in documentation does not prove them.
Repository review config lives in `.coderabbit.yaml` and `greptile.json`; both skip Crowdin sync
PRs and Crowdin-owned locales ([reviewer settings](../../docs/workflow-automation.md#reviewer-settings-external-verification-pending)).

## Commands

```bash
gh run list              # List recent runs
gh run view <run-id>     # View run details
gh run watch             # Watch running workflow
pnpm run supabase:check   # Reset, run pgTAP regressions, and lint Supabase migrations
```

## Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
act -j lint-format
act -j typecheck
act -j test
act -j validate
act -j supabase-db
act -j workers
act -j pr-meta
```
