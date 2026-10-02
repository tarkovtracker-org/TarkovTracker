# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to `main` and `wip/**` branches, PRs targeting `main`, manual dispatch
**Concurrency:** Outdated runs are automatically cancelled for the same PR or branch.
**Jobs:**

- `Validation plan` — classifies the diff. Pull requests that touch only root/`docs/`/`.github/`
  Markdown or Crowdin-owned `app/locales/*.json` translations run the reduced set (`Lint & Format`
  formatting, i18n when locales change, `Systems drift check`); anything else — including the
  source locale `app/locales/en.json` — every push, and every dispatch run the full set. Unreadable
  diffs fail closed to full validation.
- `CI Result` — strict aggregate of selected jobs; missing data or unexpected skips fail
- `Lint & Format` — ESLint + Prettier, i18n, Node workflow fixtures, and (for non-Markdown
  automation paths and unreadable diffs) checksum-verified `actionlint` plus `zizmor`
  (`.github/zizmor.yml` records accepted findings)
- `Fallow audit` — changed-file dead code, duplication, and complexity gate
- `Type Check` — `vue-tsc` / Nuxt type checking
- `Test (shard 1/4)` … `Test (shard 4/4)` — Vitest with coverage, sharded across 4 parallel jobs. The `github-actions` reporter annotates failed tests directly on the PR diff so the failing test name and assertion are visible without digging into logs. Shards report imported files only to avoid duplicate zero-filled entries, and Codecov merges the per-shard coverage. Unsharded local coverage retains the full `app/**/*.{ts,vue}` denominator.
- `Validate` — Production Nuxt build (all pull requests, forks included) + artifact upload (main branch only)
- `Supabase DB` — Reset + pgTAP regressions + lint local migrations
- `Systems drift check` — verifies `docs/systems/` invariants against the codebase
- `Workers` — Validate api-gateway (generated types, typecheck, OpenAPI, deployment dry-run, Node
  unit tests, and a workerd smoke using the production Wrangler configuration)

Heavy jobs run in parallel after classification; systems drift runs independently.
Lighthouse scope detection runs independently of PR metadata installation and commitlint.

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
Synchronization, branch updates, CI dispatch, and the final merge use the built-in `GITHUB_TOKEN`.
The job grants contents/pull-request write, actions write, and checks read permissions. No personal
GitHub token is required. Explicit `workflow_dispatch` starts CI on `locales` before merging and
on `main` afterward. No write token is passed to dependency installation or project validation.

When new translations are synchronized, `scripts/ci/crowdin-pr.sh` verifies an open, non-draft,
same-repository `locales` PR targeting `main`. If the branch is behind, it asks GitHub to merge main
into it using an expected-head guard and waits for the new head; conflicts fail closed. The gate
explicitly starts CI for the validated candidate. It then captures the candidate head SHA, fetches that exact commit,
and compares its full tree with a captured main SHA. Only regular non-English JSON files directly
inside `app/locales/` may differ; empty diffs, deletions, symlinks, renames from other paths, and stale
executable code are rejected. The checkout and dependency setup use this validated commit before
formatting (`format:check`), locale integrity (`i18n:check`), and systems drift (`systems:check`) run.

The final merge step rechecks PR identity, both commit SHAs, and mergeability. `MERGEABLE` / `CLEAN`
is accepted directly. If GitHub reports `MERGEABLE` / `UNSTABLE`, the gate revalidates successful
`CI Result` and `Preview Result` statuses on the exact candidate head, then attempts a regular
head-pinned merge; GitHub's server-side branch rules still enforce every required check. The gate
never uses the admin bypass. Unresolved GitHub calculations are retried up to 20 times, three
seconds apart; conflicting or otherwise ineligible states fail closed. `--match-head-commit`
atomically guards the squash merge against a last-moment PR push. A fixed commit body prevents
inherited CI-skip markers from suppressing the post-merge run. The gate is copied from trusted main
before synchronization and survives checkout.
If main or the PR changes during validation, rerun Crowdin Sync; do not bypass the guard.
If the post-merge dispatch fails, manually dispatch `CI` on `main`; rerunning a no-change sync
does not recreate the merged PR. Publication still requires successful CI for current main.
The candidate must contain captured main. Before merging, the gate awaits successful `CI Result`
and `Preview Result` statuses on that exact head (up to thirty minutes) and verifies the effective
repository rule requires both checks with strict branch freshness. The deployed no-bypass ruleset
closes the base-advance race at merge time; a missing or weakened required check leaves the PR open.
Both trusted gate scripts are preserved before checkout changes. See `docs/workflow-automation.md`
for the repository-wide policy and release compatibility.

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

**Trigger:** Weekly schedule (Tuesdays 15:00 UTC) and manual dispatch on `main`. Deploys do not
wait for it; every merge still deploys on its own.
**Jobs:** `Release` (find the newest main CI run for the trigger commit and require success, check
current main, install through the shared `setup-project` action, build, recheck, semantic-release).
The workflow reuses CI's test shards and database checks. It rejects other refs and events, failed
or unfinished CI, a moved main, and automation-skip directives before publishing. Releases batch
every commit since the previous tag; conventional commits outside internal scopes determine
whether a version is warranted (`scripts/release/release-scope.mjs`). Publication is serialized without
cancelling an active release. See `docs/workflow-automation.md` for details.

### PR Checks (`pr-checks.yml`)

**Trigger:** PR opened/updated/reopened
**Jobs:** `PR Meta` (labels, size, commit validation), `Lighthouse scope` (lightweight detection), `Lighthouse` (conditional on UI file changes, Lighthouse configuration/workflow changes, or `ui`/`performance` labels)
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
validated head SHA, squash merge). Every GitHub Actions
workflow-file change requires manual review, including changes to permissions, triggers, or commands.
Action updates additionally require repository or organization allowlist verification when they
introduce a new pinned SHA.

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark inactive issues/PRs stale, then close stale items unless labeled `never-stale`

## Merge checks

Dependabot PRs always change manifests, so they receive full CI. `Main CI freshness` requires
successful `CI Result` and `Preview Result` from GitHub Actions on an up-to-date branch, with no
bypass actors. The preview controller reports success without deployment for verified change sets with no
deployable paths; preview-required changes stay pending until an explicit validated deployment passes.
Reduced CI runs can skip jobs by design without leaving a PR blocked on a missing context. External
Codecov/Security gates remain unchanged; Codecov statuses default to success when no report exists.

`Release` runs weekly or on manual dispatch, not on CI completion; it publishes only when the
newest main CI run for its commit succeeded.
Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`.

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

## AI Review Bots

The root `AGENTS.md` owns review requirements. See
[workflow automation](../../docs/workflow-automation.md#push-cadence) for batching and freshness
reruns.
Dashboard settings must be verified separately; checked-in documentation does not prove them.

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
