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

`package.json` defines commands; `AGENTS.md` defines required validation and review.
`code_review.md` supplements that contract with risk areas, without requiring the full suite for
unrelated changes. Worktree setup and the shared CI setup action use `scripts/ensure-pnpm.sh` to
verify pnpm against `packageManager`, activating its complete integrity-qualified pin when needed.

Run focused checks while implementing, then required checks after the diff stabilizes. Record the
commit, dirty worktree state, commands, and results in the PR summary. Invalidate affected results
when their inputs change. Batch substantiated corrections; defer unrelated cleanup.

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

Runs on pushes to `main`, `develop`, and `wip/**`, and PRs targeting `main` or `develop`,
including translation-only PRs. All eligible push runs retain full validation.

The lightweight `changes` job emits proposed and effective selections. **Shadow rollout is enabled**:
the effective selection runs every existing CI job. `CI Result` always evaluates the job outcomes and
fails on missing classifier data, selected failures/cancellations, or unexpected skips. Systems drift
runs independently on every CI run. Existing check names, Dependabot expectations, fork restrictions,
security checks, and Codecov statuses remain unchanged; the aggregate does not replace external gates.

The shared setup action uses `.nvmrc`, the full `packageManager` pin, pnpm caching, and a frozen
installation. Each caller owns checkout history and credential settings. `Lint & Format` runs lint
and Prettier once each (lint already includes blank-line validation), plus i18n and workflow fixtures.
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

Local mode combines the merge-base diff with staged, unstaged, and untracked paths. Explicit CI
mode reads only the revision diff; full mode forces full selection. Explanation mode executes no
checks. Local mode runs lint, formatting, typecheck, workflow fixtures, unit tests, i18n, and systems
drift for executable changes; apply path-specific `AGENTS.md` checks as well. CI/full execution adds
Fallow, build, database and Worker checks, and Deno tests, requiring their usual runtimes and build
environment. CI itself retains sharding, secrets/fork rules, and report uploads in workflow jobs.
Link validation remains in the existing Link Check workflow for applicable documentation paths.

The proposed reduced selection covers only root `.md` files, Markdown under `docs/` and `.github/`,
and `app/locales/*.json`. `DESIGN.md`, generated code, scripts, dependencies, configuration, public
assets, and unknown paths select full validation. Renames include both paths and deletions remain
visible. Empty diffs, missing refs, malformed arguments, and Git errors conservatively select full
validation. Non-English formatting exclusions and Crowdin ownership remain intact.

#### CI rollout and measurements

1. Merge policy/setup, then the shadow classifier and aggregate. Capture a successful and failing
   executable PR, a documentation-only PR, a translation-only PR, and a mixed PR. Confirm the proposed
   selections and aggregate conclusions, including the existing Dependabot and coverage behavior.
2. Only after that evidence, remove `--shadow` from the classifier invocation in a follow-up change.
   Retain `--full` for push events. Check required-check settings before enabling skips; do not change
   those settings in this rollout. Roll back selection by restoring `--shadow`.
3. Release deduplication is handled separately in [PR #805](https://github.com/tarkovtracker-org/TarkovTracker/pull/805).
   This shadow rollout does not change release triggers, validation, or main-run cancellation.
   Do not treat local fixtures as evidence of GitHub App or branch-protection behavior.

The initial observations are recorded in [the baseline report](ci-turnaround-baseline.md).
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

### 2. Security Scanning (`.github/workflows/security.yml`)

Weekly security audits:

**Jobs:**

- `security-scan` - pnpm audit (prod and all deps), schedule-only informational outdated check, checksum-verified Gitleaks secret detection
- `codeql` - CodeQL static analysis

**Triggers:** Push to main/develop, all PRs, weekly (Sunday 00:00 UTC)

### 3. Release Automation (`.github/workflows/release.yml`)

Semantic versioning with automated releases:

**Jobs:**

- Runs tests and build
- Resets and lints local Supabase migrations and runs pgTAP database regressions with
  `pnpm run supabase:check`
- Generates changelog from conventional commits
- Creates GitHub releases
- Updates version in package.json

**Triggers:** Push to `main` (non-docs changes)

**Version-bump commit:** `@semantic-release/git` commits the bumped `package.json` and `CHANGELOG.md`
as `chore(release): <version> [skip actions]`. The marker is deliberately `[skip actions]` rather
than `[skip ci]`:

- GitHub Actions treats `[skip actions]` as a skip marker, so this workflow does not re-trigger
  itself. ([Skipping workflow runs](https://docs.github.com/en/actions/managing-workflow-runs/skipping-workflow-runs))
- Cloudflare Pages does **not** recognize `[skip actions]`. Its skip markers are `[CI Skip]`,
  `[CI-Skip]`, `[Skip CI]`, `[Skip-CI]`, and `[CF-Pages-Skip]`.
  ([GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/))

That asymmetry is the point. The footer version comes from `packageJson.version` in
`nuxt.config.ts`, which is baked into the bundle at build time and surfaced through
`runtimeConfig.public.appVersion`. The merge commit is built _before_ semantic-release bumps
`package.json`, so if Cloudflare also skipped the bump commit the deployed site would advertise the
previous version until the next unrelated push to `main`. Letting Pages build the bump commit costs
one extra deploy per release and keeps the displayed version honest.

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

- `labeler` - Auto-label based on file changes
- `size` - PR size classification (S/M/L/XL/XXL)
- `conventional-commits` - Commit message validation
- `lighthouse` - Performance checks (runs when the PR touches `app/components/`, `app/features/`,
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

- Dependabot-only, `main`-targeted PRs only
- No repository checkout in the privileged `pull_request_target` workflow
- Only package lockfiles, package manifests, and `pnpm-workspace.yaml` are allowed; any workflow
  change stays manual
- Runtime Nuxt, Cloudflare, TypeScript compiler, catch-all dependencies, and all GitHub Actions
  updates stay manual
- GitHub Actions updates may require a repository or organization Actions allowlist change for the
  new pinned SHA, which CI on the Dependabot branch cannot validate reliably
- PR must stay on the validated head SHA and finish all check runs and the latest result for each
  legacy status context without failures or pending results; the merge command also matches the
  validated head commit to close the final race

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

**Triggers:** PRs/pushes affecting markdown files, weekly (Sunday 00:00 UTC), manual dispatch

**On failure:** Uploads report artifact with broken links

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

GitHub Actions itself deploys nothing; items 2-4 are separate Git integrations. See the Deployment
section of [`runbook.md`](./runbook.md) for what to verify after each merge.

A releasing merge deploys twice: once for the merge commit, then again for the
`chore(release): <version> [skip actions]` commit that carries the bumped `package.json`. The second
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
- Bundle analysis is uploaded by the CI `validate` job during `pnpm run build` via `@codecov/nuxt-plugin` (configured in `nuxt.config.ts`). The plugin only activates when `CODECOV_TOKEN` is set, so local builds are unaffected.
- Test results (JUnit XML) are uploaded via `codecov/codecov-action` with `report_type: test_results`. Vitest outputs `test-report.junit.xml` when `CI=true` (configured in `vitest.config.ts`). The upload step is `!cancelled()`-gated so failing shards' reports still reach Codecov.
- The CI `test` job runs as a 4-way shard matrix (`Test (shard 1/4)` through `Test (shard 4/4)`). Each shard sets `VITEST_SHARD=N/4`, which enables the `github-actions` reporter (annotates failed tests on the PR diff), disables per-shard coverage thresholds, and reports only files imported by that shard. Codecov merges the per-shard lcov uploads and enforces an absolute floor via the `absolute-floor` project status in `codecov.yml`.
- Local `pnpm run test` / `pnpm run test:coverage` remain unsharded. Coverage runs retain the full `app/**/*.{ts,vue}` denominator and enforce the Vitest thresholds.

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

> **Note:** External links are validated automatically on PRs via the `link-check` workflow.
> Last manual verification: 2026-01-30

| Resource             | Link                                                                                         | Notes                     |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| GitHub Actions Docs  | [docs.github.com/en/actions](https://docs.github.com/en/actions)                             | Stable documentation URL  |
| Conventional Commits | [conventionalcommits.org/en/v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)          | Versioned spec permalink  |
| Semantic Release     | [semantic-release.gitbook.io](https://semantic-release.gitbook.io/semantic-release/)         | GitBook hosted docs       |
| Dependabot Docs      | [docs.github.com/code-security/dependabot](https://docs.github.com/code-security/dependabot) | Official documentation    |
| Cloudflare Pages     | [developers.cloudflare.com/pages](https://developers.cloudflare.com/pages/)                  | Cloudflare developer docs |
