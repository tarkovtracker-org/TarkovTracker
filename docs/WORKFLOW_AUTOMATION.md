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

## GitHub Actions Workflows

### 1. CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push and PR:

**Jobs:**

- `validate` - Lint, type checking, format check, tests, production build (sequential steps)
- `workers` - Cloudflare Workers typecheck and OpenAPI validation

**Triggers:** Push to `main`, `develop`, `wip/**` branches and all PRs

### 2. Security Scanning (`.github/workflows/security.yml`)

Weekly security audits:

**Jobs:**

- `security-scan` - npm audit (prod and all deps), outdated check, checksum-verified Gitleaks secret detection
- `codeql` - CodeQL static analysis

**Triggers:** Push to main/develop, all PRs, weekly (Sunday 00:00 UTC)

### 3. Release Automation (`.github/workflows/release.yml`)

Semantic versioning with automated releases:

**Jobs:**

- Runs tests and build
- Validates local Supabase migrations with `npm run supabase:check`
- Generates changelog from conventional commits
- Creates GitHub releases
- Updates version in package.json

**Triggers:** Push to `main` (non-docs changes)

**Commit Convention:**

- `feat:` → minor version bump
- `fix:` → patch version bump
- `perf:` → patch version bump
- `BREAKING CHANGE:` → major version bump

### 4. PR Checks (`.github/workflows/pr-checks.yml`)

Enhanced PR validation:

**Jobs:**

- `labeler` - Auto-label based on file changes
- `size` - PR size classification (S/M/L/XL/XXL)
- `conventional-commits` - Commit message validation
- `lighthouse` - Performance checks (when `performance` label present)

### 5. Dependabot Auto Merge (`.github/workflows/dependabot-auto-merge.yml`)

Merges known low-risk Dependabot PRs after the normal PR checks complete:

**Auto-merged groups:**

- lint and format tooling
- testing tooling
- tailwind tooling
- release tooling
- official GitHub Actions
- third-party GitHub Actions minor/patch updates

**Safety rules:**

- Dependabot-only, `main`-targeted PRs only
- No repository checkout in the privileged `pull_request_target` workflow
- Only package lockfiles, package manifests, and workflow files are allowed
- Runtime Nuxt, Cloudflare, TypeScript compiler, catch-all npm, and `.claude-plugin` updates stay manual
- PR must be mergeable and all standard CI/security checks must finish without failures

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

Automated via Dependabot (`.github/dependabot.yml`):

**Features:**

- Weekly npm update batches across the app root and `workers/api-gateway`
- Monthly grouped npm batches for `.claude-plugin` MCP tooling
- Monthly grouped GitHub Actions updates
- Official GitHub Actions are allowed to take major updates so runtime migrations do not get stuck behind a minor/patch-only rule
- Cooldown windows to avoid immediate churn from fresh releases
- Patch cooldown is short so safe patch updates do not sit for a full week
- Grouped minor/patch updates for low-risk tooling families
- Version updates limited to direct dependencies; vulnerable transitives still surface through security updates
- Maximum 3 concurrent npm PRs and 1 GitHub Actions PR
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
- remaining npm minor/patch updates
- claude-plugin MCP runtime and dev tooling

**Review strategy:**

- Let Dependabot batch low-risk tooling updates for scheduled review windows
- Let the auto-merge workflow clear allowlisted tooling/action PRs after checks pass
- Keep major upgrades explicit
- Allow official GitHub-maintained actions to take major updates when GitHub changes required action runtimes
- Keep transitive lockfile churn out of version-update PRs unless GitHub raises a security fix
- Keep Nuxt/runtime, Cloudflare deployment tooling, TypeScript compiler, catch-all npm, and `.claude-plugin` updates manual
- Keep `.claude-plugin` updates out of the main app queue; review them monthly as isolated tooling maintenance
- Review security PRs promptly; they remain separate from the scheduled version-update batches unless GitHub grouped security updates are enabled in repository settings

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

1. CI validation in GitHub Actions
2. Cloudflare Pages deploy for the connected branch
3. Cloudflare-managed worker deploys for the connected branch
4. Smoke tests in production

### Manual Deployment

```bash
# Local deployment (run from project root: /home/lab/TarkovTracker or equivalent)
npm run build
cd workers/api-gateway && npx wrangler deploy
```

> **Note:** All local deployment commands assume you are in the project root directory.

## Monitoring & Notifications

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

- Check the Cloudflare Pages deployment log for the branch
- Verify build output in `dist`
- Verify required environment variables in Cloudflare

**Workers deployment:**

- Verify Cloudflare Worker Git deployment status or deploy with `wrangler`
- Check worker-specific secrets and bindings
- Validate `wrangler.toml` and test locally with `npm run dev`

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

- Let Dependabot handle scheduled version updates
- Review grouped low-risk tooling updates together
- Test major version upgrades and framework/runtime bumps locally

### Security

- Never commit secrets to repository
- Review Dependabot security PRs immediately
- Run `npm audit` before releases

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
