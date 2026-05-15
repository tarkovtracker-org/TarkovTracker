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
so `/api/*` routes are available during audits.
**Lighthouse thresholds:** Calibrated to the real full-data Pages preview baseline. Raise
`lighthouserc.json` score floors after performance/accessibility work instead of treating
the current floors as long-term targets.

### Dependabot Auto Merge (`dependabot-auto-merge.yml`)

**Trigger:** Dependabot PR opened/updated/reopened/ready for review
**Jobs:** `Auto-merge safe Dependabot PR` (allowlist gate, wait for CI/security checks, squash merge)

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark inactive issues/PRs stale, then close stale items unless labeled `never-stale`

## Check Count

| Context       | Checks                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| PR            | ~10 (Lint & Format, Type Check, Test, Validate, Supabase DB, Workers, PR Meta, Security Scan, CodeQL, Lighthouse\*) |
| Dependabot PR | ~11 (standard PR checks plus Dependabot Auto Merge when allowlisted)                                    |
| Main push     | ~9 (Lint & Format, Type Check, Test, Validate, Supabase DB, Workers, Security Scan, CodeQL, Release)    |

\*Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

## AI Review Bots

CodeRabbit automatic reviews are disabled in `.coderabbit.yaml`; invoke it on demand with `@coderabbitai review`. CodeAnt and Kilo Code PR reviews are controlled by their GitHub App dashboards, not GitHub Actions in this repo. Keep those apps disabled or remove this repository from their automatic review selections, then invoke them manually from their PR comments or dashboards when needed.

## Commands

```bash
gh run list              # List recent runs
gh run view <run-id>     # View run details
gh run watch             # Watch running workflow
npm run supabase:check   # Validate local Supabase migration reset + lint
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
