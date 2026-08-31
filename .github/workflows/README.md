# GitHub Actions Workflows

Automated CI/CD and maintenance workflows for TarkovTracker.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to main/develop/wip branches, PRs
**Concurrency:** Outdated runs are automatically cancelled for the same PR or branch.
**Jobs:**

- `Lint & Format` — ESLint + Prettier checks
- `Fallow audit` — changed-file dead code, duplication, and complexity gate
- `Type Check` — `vue-tsc` / Nuxt type checking
- `Test (shard 1/4)` … `Test (shard 4/4)` — Vitest with coverage, sharded across 4 parallel jobs. The `github-actions` reporter annotates failed tests directly on the PR diff so the failing test name and assertion are visible without digging into logs. Shards report imported files only to avoid duplicate zero-filled entries, and Codecov merges the per-shard coverage. Unsharded local coverage retains the full `app/**/*.{ts,vue}` denominator.
- `Validate` — Production Nuxt build + artifact upload (main branch only)
- `Supabase DB` — Reset + pgTAP regressions + lint local migrations
- `Systems drift check` — verifies `docs/SYSTEMS.md` invariants against the codebase
- `Workers` — Validate api-gateway (generated types, typecheck, OpenAPI, deployment dry-run, Node
  unit tests, and a workerd smoke using the production Wrangler configuration)

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
**Jobs:** `PR Meta` (labels, size, commit validation, Lighthouse gating), `Lighthouse` (conditional on UI file changes, Lighthouse configuration/workflow changes, or `ui`/`performance` labels)
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

## Check Count

| Context       | Checks                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR            | ~15 (Fallow audit, Lint & Format, Type Check, Test ×4 shards, Validate, Supabase DB, Systems drift check, Workers, PR Meta, Security Scan, CodeQL, Lighthouse\*) |
| Dependabot PR | ~16 (standard PR checks plus Dependabot Auto Merge when allowlisted)                                                                                             |
| Main push     | ~14 (Fallow audit, Lint & Format, Type Check, Test ×4 shards, Validate, Supabase DB, Systems drift check, Workers, Security Scan, CodeQL, Release)               |

\*Lighthouse runs only when the PR touches UI paths or already carries `performance`/`ui`

## Secrets

Workflow-specific secrets are not required for the Gitleaks step anymore. The workflow downloads a pinned Gitleaks release and verifies its published checksum before scanning. App build jobs still use the existing Nuxt/Supabase secrets configured for CI and release.

## AI Review Bots

Cubic is the primary automatic reviewer, with Greptile retained as a useful secondary reviewer.
CodeRabbit remains enabled and skips PRs whose titles contain `Crowdin` via `.coderabbit.yaml`, but
its frequent rate limits make it best-effort rather than a required review dependency. Kilo Code is
disabled because its signal was low. CodeAnt is a removal candidate because its AI, quality,
security, and coverage checks overlap with retained integrations; its locale exclusions live in
`.codeant/configuration.json` while its activation remains dashboard-controlled. GitHub-managed
Copilot review and the duplicate CodeQL workflow (`dynamic/github-code-scanning/codeql`) are also
controlled outside this repository; the checked-in `Security` workflow already runs CodeQL for
normal code PRs. Socket PR alerts are limited to dependency manifest changes by the root
`socket.yml`; Snyk and Supabase preview behavior are controlled by their integration settings.

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
