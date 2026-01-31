# Workflow Automation Guide

Complete workflow automation setup for TarkovTracker with CI/CD pipelines, quality checks, and deployment automation.

## Overview

**Automated Workflows:**

- CI/CD pipeline with quality, testing, and builds
- Cloudflare Pages + Workers deployment
- Security scanning and dependency audits
- Automated releases with semantic versioning
- Pre-commit hooks for code quality
- Dependency update automation via Renovate

## GitHub Actions Workflows

### 1. CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push and PR:

**Jobs:**

- `validate` - Lint, type checking, format check, tests, production build (sequential steps)
- `workers` - Cloudflare Workers typecheck and OpenAPI validation

**Triggers:** Push to `main`, `develop`, `wip/**` branches and all PRs

### 2. Deployment (`.github/workflows/deploy.yml`)

Automated deployment to production:

**Jobs:**

- `deploy` - Deploy Nuxt SPA to Cloudflare Pages, deploy api-gateway and team-gateway workers
- `verify` - Smoke tests and Discord notifications

**Triggers:** After CI workflow succeeds on main (workflow_run), manual dispatch

**Required Secrets:**

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
DISCORD_WEBHOOK (optional)
```

### 3. Security Scanning (`.github/workflows/security.yml`)

Weekly security audits:

**Jobs:**

- `security-scan` - npm audit (prod and all deps), outdated check, Gitleaks secret detection
- `codeql` - CodeQL static analysis

**Triggers:** Push to main/develop, all PRs, weekly (Sunday 00:00 UTC)

**Required Secrets:**

```text
GITLEAKS_LICENSE (required for organization repos, free at gitleaks.io)
```

### 4. Release Automation (`.github/workflows/release.yml`)

Semantic versioning with automated releases:

**Jobs:**

- Runs tests and build
- Generates changelog from conventional commits
- Creates GitHub releases
- Updates version in package.json

**Triggers:** Push to `main` (non-docs changes)

**Commit Convention:**

- `feat:` → minor version bump
- `fix:` → patch version bump
- `perf:` → patch version bump
- `BREAKING CHANGE:` → major version bump

### 5. PR Checks (`.github/workflows/pr-checks.yml`)

Enhanced PR validation:

**Jobs:**

- `labeler` - Auto-label based on file changes
- `size` - PR size classification (S/M/L/XL/XXL)
- `conventional-commits` - Commit message validation
- `lighthouse` - Performance checks (when `performance` label present)

### 6. Stale Management (`.github/workflows/stale.yml`)

Automatic stale issue/PR management:

- Marks issues/PRs stale after 60 days
- Closes stale items after 14 days
- Exempts issues: `pinned`, `security`, `enhancement` labels
- Exempts PRs: `pinned`, `security`, `enhancement` labels

### 7. Link Check (`.github/workflows/link-check.yml`)

Validates external links in documentation:

**Checks:**

- All markdown files in `docs/` and project root
- Validates HTTP status codes (200, 204, 206, 301, 302, 308)
- Excludes localhost, internal domains, and email links

**Triggers:** PRs/pushes affecting markdown files, weekly (Sunday 00:00 UTC), manual dispatch

**On failure:** Uploads report artifact with broken links

## Pre-commit Hooks

Git hooks via Husky enforce quality standards:

### Setup

```bash
npm install
npm run prepare
```

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

**Scopes:** app, workers, api, ui, tasks, hideout, maps, team, settings, admin, i18n, deps, config, ci

**Examples:**

```bash
feat(tasks): add quest filtering by map
fix(hideout): resolve station upgrade calculation
docs(readme): update deployment instructions
chore(deps): update nuxt to v4.2.2
```

## Dependency Updates

Automated via Renovate (`renovate.json`):

**Features:**

- Auto-merge for dev dependencies and type definitions
- Grouped updates for related packages (eslint, nuxt, tailwind)
- Security vulnerability auto-merge
- Scheduled updates (nights/weekends)
- Maximum 3 concurrent PRs

**Package Groups:**

- eslint packages
- nuxt packages
- cloudflare packages
- tailwind packages
- testing packages

**Configuration:**

```json
{
  "schedule": ["after 10pm every weekday", "before 5am every weekday", "every weekend"],
  "prConcurrentLimit": 3,
  "automerge": true
}
```

_Automerge enabled for dev deps, types, and security updates._

## Development Environment Setup

Automated setup script for new contributors:

```bash
npm run setup
```

**Script performs:**

1. Prerequisites check (Node.js, npm, git)
2. Install dependencies
3. Setup git hooks (Husky)
4. Create `.env.local` from template
5. Install worker dependencies

**Manual steps after setup:**

1. Update `.env.local` with Supabase credentials
2. Run `npm run dev`
3. Visit http://localhost:3000

## Deployment Process

### Automatic Deployment

Push to `main` triggers:

1. CI validation (quality, tests, build)
2. Deploy to Cloudflare Pages
3. Deploy workers (api-gateway, team-gateway)
4. Smoke tests
5. Discord notification

### Manual Deployment

```bash
# Via GitHub Actions
gh workflow run deploy.yml

# Local deployment (run from project root: /home/lab/TarkovTracker or equivalent)
npm run build
cd workers/api-gateway && npx wrangler deploy
cd "$OLDPWD" && cd workers/team-gateway && npx wrangler deploy
```

> **Note:** All local deployment commands assume you are in the project root directory.
> The `cd "$OLDPWD"` returns to the previous directory before switching to the next worker.

## Monitoring & Notifications

### Discord Webhooks

Configure `DISCORD_WEBHOOK` secret for deployment notifications:

**Sent on:**

- Deployment success/failure
- Security scan findings (optional)
- Release creation (optional)

### Coverage Reports

Coverage reporting can be enabled by:

- Adding `CODECOV_TOKEN` secret to repository
- Configuring vitest with coverage options
- Adding coverage upload step to CI workflow

## Local Development Workflow

### Standard Flow

```bash
# Start development
npm run dev

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
npm run test           # Run all tests
npm run test:watch     # Watch mode
npx vitest --ui        # UI dashboard
```

### Format & Lint

```bash
npm run format         # Prettier + ESLint fix
npm run lint           # Lint check
npm run lint:fix       # Auto-fix issues
```

## Troubleshooting

### Pre-commit Hook Failing

```bash
# Skip hooks (emergency only)
git commit --no-verify -m "message"

# Fix issues
npm run format
npm run lint:fix
```

### CI Failing

**Quality job:**

- Run `npm run lint` locally
- Check type errors with `npx nuxt typecheck`

**Test job:**

- Run `npm run test` locally
- Check test coverage

**Build job:**

- Run `npm run build` locally
- Verify environment variables

### Deployment Failing

**Pages deployment:**

- Check Cloudflare API token permissions
- Verify project name in workflow
- Check build output in `dist` (Nuxt cloudflare-pages preset)

**Workers deployment:**

- Verify wrangler.toml configuration
- Check worker-specific secrets
- Test locally with `npm run dev`

## Best Practices

### Commit Messages

- Use conventional commits format
- Keep subject under 100 characters
- Reference issues: `fix(api): resolve #123`

### PRs

- Keep PRs focused (prefer size/S or size/M)
- Update tests for new features
- Run format/lint before pushing
- Wait for CI before requesting review

### Dependencies

- Let Renovate handle updates
- Review grouped updates together
- Test major version upgrades locally

### Security

- Never commit secrets to repository
- Review Dependabot/Renovate security PRs immediately
- Run `npm audit` before releases

## Configuration Files

**Workflow Automation:**

- `.github/workflows/*.yml` - GitHub Actions workflows
- `.husky/*` - Git hooks
- `commitlint.config.js` - Commit message rules
- `renovate.json` - Dependency update config
- `.releaserc.json` - Semantic release config

**Development:**

- `.github/labeler.yml` - Auto-labeling rules
- `scripts/setup-dev-environment.sh` - Setup automation

## Additional Resources

> **Note:** External links are validated automatically on PRs via the `link-check` workflow.
> Last manual verification: 2026-01-30

| Resource             | Link                                                                                 | Notes                     |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------- |
| GitHub Actions Docs  | [docs.github.com/en/actions](https://docs.github.com/en/actions)                     | Stable documentation URL  |
| Conventional Commits | [conventionalcommits.org/en/v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)  | Versioned spec permalink  |
| Semantic Release     | [semantic-release.gitbook.io](https://semantic-release.gitbook.io/semantic-release/) | GitBook hosted docs       |
| Renovate Docs        | [docs.renovatebot.com](https://docs.renovatebot.com/)                                | Official documentation    |
| Cloudflare Pages     | [developers.cloudflare.com/pages](https://developers.cloudflare.com/pages/)          | Cloudflare developer docs |
