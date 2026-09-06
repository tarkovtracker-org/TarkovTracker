# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to main/develop/wip branches, PRs
**Concurrency:** Outdated runs are automatically cancelled for the same PR or branch.
**Jobs:**

- `Validation plan` — proposed scope plus full effective scope during shadow rollout
- `CI Result` — strict aggregate of selected jobs; missing data or unexpected skips fail
- `Lint & Format` — ESLint + Prettier, i18n, and Node workflow fixtures
- `Fallow audit` — changed-file dead code, duplication, and complexity gate
- `Type Check` — `vue-tsc` / Nuxt type checking
- `Test (shard 1/4)` … `Test (shard 4/4)` — Vitest with coverage, sharded across 4 parallel jobs. The `github-actions` reporter annotates failed tests directly on the PR diff so the failing test name and assertion are visible without digging into logs. Shards report imported files only to avoid duplicate zero-filled entries, and Codecov merges the per-shard coverage. Unsharded local coverage retains the full `app/**/*.{ts,vue}` denominator.
- `Validate` — Production Nuxt build + artifact upload (main branch only)
- `Supabase DB` — Reset + pgTAP regressions + lint local migrations
- `Systems drift check` — verifies `docs/SYSTEMS.md` invariants against the codebase
- `Workers` — Validate api-gateway (generated types, typecheck, OpenAPI, deployment dry-run, Node
  unit tests, and a workerd smoke using the production Wrangler configuration)

Heavy jobs run in parallel after classification; systems drift runs independently.
Lighthouse scope detection runs independently of PR metadata installation and commitlint.

### Crowdin Sync (`crowdin.yml`)

**Triggers:** English source, Crowdin config, or sync workflow changes on `main`; every six hours
at minute 17 UTC; manual dispatch on `main`. Runs are serialized without cancelling an active sync.
The workflow uploads `app/locales/en.json` to the Crowdin `main` branch and downloads translations
to `app/locales/%two_letters_code%.json`, preserving the directory hierarchy. It never uploads
local translations. The existing `locales` branch supplies translation PRs targeting `main`.

Repository secrets `CROWDIN_PROJECT_ID` and `CROWDIN_PERSONAL_TOKEN` authenticate to Crowdin only.
GitHub writes use the automatic `secrets.GITHUB_TOKEN`, with only `contents: write` and
`pull-requests: write`, so newly created PRs are authored by `github-actions[bot]`.

Before enabling this workflow on `main`:

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

`CI`, `PR Checks`, and `Security` report for translation-only PRs. During shadow rollout they retain
full validation. The proposed classifier selects formatting, i18n, and systems drift for locales;
only a verified follow-up change enables expensive-check skips. Non-English locale formatting
exclusions remain intact. See the rollout checklist in `docs/WORKFLOW_AUTOMATION.md`.

Crowdin Sync now creates PRs using `GITHUB_TOKEN`. GitHub creates their PR workflow runs in an
approval-required state; a repository writer must approve them before they execute. Removing path
exclusions does not bypass this platform requirement. See
[GitHub token event behavior](https://docs.github.com/en/actions/concepts/security/github_token).

### Security (`security.yml`)

**Trigger:** Push to main/develop, PRs, weekly schedule
**Jobs:** `Security Scan` (audit + checksum-verified Gitleaks CLI), `CodeQL` (static analysis)

### Release (`release.yml`)

**Trigger:** Successful completion of `CI` for a same-repository push to `main`.
**Jobs:** `Release` (validate the CI run and current main SHA, build, recheck, semantic-release).
The workflow reuses CI's test shards and database checks. It rejects stale commits and CI attempts,
PR/fork events, and automation-skip directives before publishing. Documentation-only pushes can
reach the gate; conventional commits determine whether a version is warranted. Publication is
serialized without cancelling an active release. See `docs/WORKFLOW_AUTOMATION.md` for details.

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
**Jobs:** `Auto-merge safe Dependabot PR` (npm tooling allowlist gate, wait for check runs and
legacy status contexts, verify and match the validated head SHA, squash merge). Every GitHub Actions
workflow-file change requires manual review, including changes to permissions, triggers, or commands.
Action updates additionally require repository or organization allowlist verification when they
introduce a new pinned SHA.

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark inactive issues/PRs stale, then close stale items unless labeled `never-stale`

## Merge checks

Existing check names and Dependabot's expected-check list are preserved. New classification and
aggregate jobs supplement them. Keep branch protection and external Codecov/Security gates unchanged
while shadow mode is validated; `CI Result` does not replace them.

Successful main CI completion separately triggers the gated `Release` workflow.
Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`.

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

## AI Review Bots

Codex is the intended primary reviewer, with one best-effort local CodeRabbit pass for substantial
behavior changes. Existing automatic provider settings remain unchanged until Codex delivery and
exclusions are verified on representative PRs. See the reviewer transition checklist in
`docs/WORKFLOW_AUTOMATION.md`; dashboard settings are not proven by checked-in configuration.

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
