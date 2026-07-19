# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to main/develop/wip branches, PRs
**Concurrency:** Outdated runs are automatically cancelled for the same PR or branch.
**Jobs:**

- `Lint & Format` — ESLint + Prettier checks
- `Type Check` — `vue-tsc` / Nuxt type checking
- `Test` — Vitest with coverage
- `Validate` — Production Nuxt build + artifact upload (main branch only)
- `Supabase DB` — Reset + lint local migrations
- `Workers` — Validate api-gateway (typecheck, OpenAPI, tests)

All jobs run in parallel; the `Workers` job no longer waits for `Validate` to finish.

### Crowdin locale PRs

PRs whose changes are limited to the non-English locale exports in `app/locales/` do not trigger
`CI`, `PR Checks`, `Security`, or `Dependabot Auto Merge`. This prevents each burst of Crowdin
synchronization commits from starting redundant repository-owned jobs. Changes to source code,
workflow files, or `app/locales/en.json` still run the normal checks.

### Security (`security.yml`)

**Trigger:** Push to main/develop, PRs, weekly schedule
**Jobs:** `Security Scan` (audit + checksum-verified Gitleaks CLI), `CodeQL` (static analysis)

### Release (`release.yml`)

**Trigger:** Push to main (excluding `**.md`, `docs/**`)
**Jobs:** `Release` (build + semantic-release)

### PR Checks (`pr-checks.yml`)

**Trigger:** PR opened/updated/reopened
**Jobs:** `PR Meta` (labels, size, commit validation, Lighthouse gating), `Lighthouse` (conditional on UI file changes or `ui`/`performance` labels)
**Lighthouse server:** Builds the Cloudflare Pages app and serves it with `wrangler pages dev`
so `/api/*` routes are available during audits. The build sets
`NUXT_PUBLIC_PROMOTED_TWITCH_ENABLED=false` so audits measure the app itself rather than the
promoted Twitch embed, whose heavy third-party iframe (script eval, layout shift, third-party
cookies) loads only when the streamer is live and previously made scores non-deterministic.
**Lighthouse thresholds:** Calibrated to the real full-data Pages preview baseline with the
promoted Twitch embed disabled (see above). Best-practices, SEO, and accessibility floors are
`error`-level at 0.9 since the embed-free audits clear them comfortably (best-practices and SEO
median 1.0, accessibility 0.92-0.96). Performance floors stay conservative: `/hideout` sits at
0.22 with no margin and `/` can dip on cold starts, so those need real layout-shift (CLS ~1.38)
and main-thread (TBT ~2.3s) work before raising. Raise `lighthouserc.json` score floors after
performance/accessibility work instead of treating the current floors as long-term targets.

### Dependabot Auto Merge (`dependabot-auto-merge.yml`)

**Trigger:** Dependabot PR opened/updated/reopened/ready for review
**Jobs:** `Auto-merge safe Dependabot PR` (allowlist gate, wait for CI/security checks, squash merge)

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark inactive issues/PRs stale, then close stale items unless labeled `never-stale`

## Check Count

| Context       | Checks                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| PR            | ~10 (Lint & Format, Type Check, Test, Validate, Supabase DB, Workers, PR Meta, Security Scan, CodeQL, Lighthouse\*) |
| Dependabot PR | ~11 (standard PR checks plus Dependabot Auto Merge when allowlisted)                                                |
| Main push     | ~9 (Lint & Format, Type Check, Test, Validate, Supabase DB, Workers, Security Scan, CodeQL, Release)                |

\*Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

## AI Review Bots

CodeRabbit skips PRs whose titles contain `Crowdin` via `.coderabbit.yaml`; normal automatic reviews
remain enabled. CodeAnt excludes the non-English locale exports via `.codeant/configuration.json`,
but its GitHub App can still post PR metadata. Kilo Code reviews are controlled by its GitHub App
dashboard and have no repository workflow switch. GitHub-managed Copilot review and the duplicate
CodeQL workflow (`dynamic/github-code-scanning/codeql`) are also controlled outside this repository;
the checked-in `Security` workflow already runs CodeQL for normal code PRs. To stop those apps and
workflows from consuming usage on the automated `locales` PR, remove this repository from their
automatic review selection or disable the duplicate integration in each vendor/GitHub dashboard.
Socket PR alerts are limited to dependency manifest changes by the root `socket.yml`; Snyk and
Supabase preview behavior is controlled by their integration settings.

## Commands

```bash
gh run list              # List recent runs
gh run view <run-id>     # View run details
gh run watch             # Watch running workflow
pnpm run supabase:check   # Validate local Supabase migration reset + lint
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
