# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to main/develop/wip branches, PRs
**Jobs:** `Validate` (lint, typecheck, format, test, build), `Workers` (validate both workers)
**Artifacts:** Build uploaded on main branch for deploy reuse

### Deploy (`deploy.yml`)

**Trigger:** After CI succeeds on main, or manual dispatch
**Jobs:** `Deploy` (app + workers), `Verify` (smoke tests + Discord)
**Note:** Reuses build artifact from CI (no redundant builds)
**Requires:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### Security (`security.yml`)

**Trigger:** Push to main/develop, PRs, weekly schedule
**Jobs:** `Security Scan` (audit + gitleaks), `CodeQL` (static analysis)

### Release (`release.yml`)

**Trigger:** Push to main (excluding `**.md`, `docs/**`)
**Jobs:** `Release` (build + semantic-release)

### PR Checks (`pr-checks.yml`)

**Trigger:** PR opened/updated/labeled
**Jobs:** `PR Meta` (labels, size, commit validation), `Lighthouse` (conditional on ui/performance label)

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark and close stale issues/PRs

## Check Count

| Context | Checks |
|---------|--------|
| PR | ~6 (Validate, Workers, PR Meta, Security Scan, CodeQL, Lighthouse*) |
| Main push | ~5 (Validate, Workers, Security Scan, CodeQL, Release) |
| After CI | ~2 (Deploy, Verify) |

*Lighthouse only runs with `performance` or `ui` label

## Secrets

```text
CLOUDFLARE_API_TOKEN   - Cloudflare API token
CLOUDFLARE_ACCOUNT_ID  - Cloudflare account ID
DISCORD_WEBHOOK        - Discord notifications (optional)
GITLEAKS_LICENSE       - Gitleaks license key (optional)
```

## Commands

```bash
gh run list              # List recent runs
gh run view <run-id>     # View run details
gh run watch             # Watch running workflow
gh workflow run deploy   # Manual deploy trigger
```

## Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
act -j validate
act -j workers
act -j pr-meta
```
