# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to main/develop/wip branches, PRs
**Jobs:** Quality checks, tests, build validation, workers validation

### Deploy (`deploy.yml`)

**Trigger:** Push to main, manual
**Jobs:** Deploy app to Cloudflare Pages, deploy workers, smoke tests
**Requires:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### Security (`security.yml`)

**Trigger:** Push, PR, weekly schedule
**Jobs:** Dependency audit, secret scanning, CodeQL analysis

### Release (`release.yml`)

**Trigger:** Push to main (non-docs)
**Jobs:** Tests, build, semantic release
**Requires:** `GITHUB_TOKEN`

### PR Checks (`pr-checks.yml`)

**Trigger:** PR opened/updated
**Jobs:** Auto-labeling, size check, commit validation, lighthouse (optional)

### Stale (`stale.yml`)

**Trigger:** Daily schedule
**Jobs:** Mark and close stale issues/PRs

## Secrets Configuration

Required secrets in repository settings:

```text
CLOUDFLARE_API_TOKEN      - Cloudflare API token with Pages/Workers permissions
CLOUDFLARE_ACCOUNT_ID     - Cloudflare account ID
DISCORD_WEBHOOK           - Discord webhook for notifications (optional)
GITLEAKS_LICENSE          - Gitleaks license key (optional, free tier available)
```

## Workflow Status

Check workflow status:

```bash
gh run list
gh run view <run-id>
gh run watch
```

## Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
act -j quality
act -j test
act -j build
```
