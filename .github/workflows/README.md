# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to main/develop/wip branches, PRs
**Jobs:** `Validate` (lint, typecheck, format, test, build), `Supabase DB` (reset + lint local migrations), `Workers` (validate api-gateway)

### Security (`security.yml`)

**Trigger:** Push to main/develop, PRs, weekly schedule
**Jobs:** `Security Scan` (audit + checksum-verified Gitleaks CLI), `CodeQL` (static analysis)

### Release (`release.yml`)

**Trigger:** Push to main (excluding `**.md`, `docs/**`)
**Jobs:** `Release` (build + semantic-release)

### PR Checks (`pr-checks.yml`)

**Trigger:** PR opened/updated/reopened
**Jobs:** `PR Meta` (labels, size, commit validation, Lighthouse gating), `Lighthouse` (conditional on UI file changes or `ui`/`performance` labels)

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark and close stale issues/PRs

## Check Count

| Context   | Checks                                                                            |
| --------- | --------------------------------------------------------------------------------- |
| PR        | ~7 (Validate, Supabase DB, Workers, PR Meta, Security Scan, CodeQL, Lighthouse\*) |
| Main push | ~6 (Validate, Supabase DB, Workers, Security Scan, CodeQL, Release)               |

\*Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

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
act -j validate
act -j supabase-db
act -j workers
act -j pr-meta
```
