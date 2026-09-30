# scripts/

Repository tooling that is not part of the shipped app. Nothing here is bundled into the site; each
script is run by a `package.json` command, a Git hook, a GitHub Actions workflow, the release
tooling, or a person/agent by hand. The **Run by** column is the fastest way to confirm a file is
still live: if it names nothing, the file is a removal candidate.

Why not `.github/`? GitHub only gives special meaning to `.github/workflows/`, `.github/actions/`,
and a few config files. Many scripts here also run locally (hooks, `pnpm` commands, release
tooling, production DB access), so they live beside the code they check rather than under the CI
folder.

Behavior is documented in [`docs/workflow-automation.md`](../docs/workflow-automation.md) (CI,
hooks, previews, releases) and [`docs/systems.md`](../docs/systems.md) (precompute, drift checks).

## File extensions and naming

| Pattern             | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `*.mjs`             | Node.js script using ES modules (`import`). Run with `node`.                                |
| `*.sh`              | Bash script. Run with `bash`.                                                               |
| `*.ts`              | TypeScript, run with `tsx` (only under `precompute/`).                                      |
| `prod-db` (no ext.) | Bash wrapper so the command reads `scripts/prod-db …`; it just runs `prod-db.mjs`.          |
| `*.test.mjs`        | Vitest tests, run by `pnpm run test`.                                                       |
| `*-tests.mjs`       | `node --test` tests for Codex review tooling, run by `pnpm run test:workflow`.              |
| `ci-tests/*.mjs`    | `node --test` contract tests for workflows and automation, run by `pnpm run test:workflow`. |
| `*.smoke.mjs`       | Playwright browser smoke tests for previews; named so Vitest never picks them up.           |

## Formatting and linting

| File                      | What it does                                                           | Run by                                               |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `format-files.mjs`        | Runs Prettier over tracked files.                                      | `format:prettier`, `format:check:prettier`           |
| `lint-blank-lines.mjs`    | Enforces the compact blank-line style; `--fix` rewrites.               | `lint:blank-lines`, `format:blank-lines`, pre-commit |
| `lint-i18n.mjs`           | Checks `en.json` keys are snake_case and compares other locales' keys. | `i18n:check`, pre-commit                             |
| `fallow-audit.mjs`        | Runs Fallow code-health checks on changes against a base ref.          | `lint:fallow`                                        |
| `check-systems-drift.mjs` | Verifies volatile facts in `docs/systems.md` still match the code.     | `systems:check`, `ci.yml`                            |

## CI validation

| File                       | What it does                                                             | Run by                                                              |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `validate-changes.mjs`     | Decides which CI jobs a change needs and runs them locally or in CI.     | `validate:changes`, `ci.yml`                                        |
| `validation-plan.mjs`      | Rules mapping changed files to CI jobs; aggregates job results.          | imported by the above                                               |
| `validation-tools.mjs`     | Resolves trusted absolute paths for `git` and other tools.               | imported by the above                                               |
| `check-ci-result.mjs`      | Final CI gate: fails if any job the plan selected did not pass.          | `ci.yml`                                                            |
| `report-dispatched-ci.mjs` | Publishes the gate result as a commit status for manually dispatched CI. | `ci.yml`                                                            |
| `ensure-pnpm.sh`           | Installs the exact pnpm version pinned in `package.json`.                | `.github/actions/setup-project`, `preview.yml`, `setup-worktree.sh` |
| `github-ci-gate.sh`        | Shared shell helpers that check `main`'s ruleset and CI state.           | `crowdin-pr.sh`, `release-commit.sh`                                |
| `crowdin-pr.sh`            | Opens/updates the Crowdin translation PR after CI gates pass.            | `crowdin.yml`                                                       |

## Releases

| File                     | What it does                                                               | Run by               |
| ------------------------ | -------------------------------------------------------------------------- | -------------------- |
| `release-scope.mjs`      | Which commit scopes are internal and excluded from releases and notes.     | `.releaserc.json`    |
| `release-commit.mjs`     | semantic-release plugin that prepares the version commit.                  | `.releaserc.json`    |
| `release-commit.sh`      | Pushes that commit to a staging branch and waits for CI before tagging.    | `release-commit.mjs` |
| `release-gate.mjs`       | Allows publishing only on the weekly schedule or a maintainer dispatch.    | `release.yml`        |
| `release-recovery.mjs`   | Resumes a release that stopped partway, using published release assets.    | `release.yml`        |
| `release-highlights.mjs` | Builds player-facing highlights from each PR's `## Release note` section.  | `release-scope.mjs`  |
| `release-note-state.mjs` | In-process proof that the prepare step succeeded before notes are written. | `release-commit.mjs` |

## Previews (`preview/`)

Deploys a pull request to a Cloudflare Pages preview when a maintainer comments `/preview`. The
candidate PR's build is untrusted; everything it produces is re-verified by trusted code from
`main` before deploying. Workflows: `preview.yml`, `preview-request.yml`, `preview-state.yml`,
`finalization-shadow.yml`.

| File                        | What it does                                                            |
| --------------------------- | ----------------------------------------------------------------------- |
| `comment-request.mjs`       | Handles a `/preview` (or stop) PR comment and starts the request.       |
| `request-authorization.mjs` | Checks the commenter's repo role and opt-in rules for a request.        |
| `controller.mjs`            | Trusted controller: plans, verifies, and publishes the preview result.  |
| `github-api.mjs`            | GitHub API helpers; only Actions-created checks count as CI evidence.   |
| `build-profile.mjs`         | Picks production vs. anonymous preview build settings before the build. |
| `write-manifest.mjs`        | Writes the build's manifest of claims into the build output.            |
| `manifest.mjs`              | Manifest format, parsing, and digest.                                   |
| `archive.mjs`               | Safe ZIP reader for the build artifact (no symlinks or path traversal). |
| `profile.mjs`               | Fixed Cloudflare Pages project identity for previews.                   |
| `deployment.mjs`            | Parses Wrangler output and compares the deploy with the plan.           |
| `verify-deployment.mjs`     | Confirms the live Cloudflare deploy matches the plan before publishing. |
| `finalization-shadow.mjs`   | Read-only planner for an opt-in final build rehearsal.                  |
| `shadow-container.sh`       | Runs that rehearsal build in a container with no host credentials.      |
| `smoke/*`                   | Playwright smoke tests against the deployed preview URL.                |

## Tarkov data precompute (`precompute/`)

Scheduled every 12 hours by `precompute-tarkov-data.yml`: fetches Tarkov.dev data, runs the same
adapt/overlay pipeline as the API, and writes the result to Cloudflare KV. See the precompute
section of [`docs/systems.md`](../docs/systems.md).

| File                | What it does                                                         | Run by                     |
| ------------------- | -------------------------------------------------------------------- | -------------------------- |
| `run.ts`            | Command-line entry point.                                            | `precompute:tarkov`        |
| `precompute.ts`     | The pipeline itself.                                                 | `run.ts`                   |
| `kv.ts`             | Writes to Cloudflare KV over its REST API.                           | `precompute.ts`            |
| `nuxt-imports.ts`   | Stand-in for Nuxt's `#imports` so app server code runs outside Nuxt. | `tsconfig.json` path alias |
| `check-overlay.ts`  | Verifies production is serving a fresh, correctly overlaid payload.  | `verify:overlay`           |
| `verify-overlay.ts` | Freshness and overlay checks used by `check-overlay.ts`.             | `check-overlay.ts`         |
| `tsconfig.json`     | TypeScript settings for this folder.                                 | `typecheck`, `tsx`         |
| `__tests__/`        | Vitest tests.                                                        | `pnpm run test`            |

## Local development

| File                       | What it does                                                             | Run by           |
| -------------------------- | ------------------------------------------------------------------------ | ---------------- |
| `setup-dev-environment.sh` | First-time setup: creates `.env` from `.env.example`, installs hooks.    | `pnpm run setup` |
| `wt.sh`                    | Creates, removes, and lists Git worktrees under `.wt/`.                  | by hand          |
| `setup-worktree.sh`        | Installs deps and Git hooks inside a new worktree.                       | `wt.sh add`      |
| `check-supabase-db.sh`     | Rebuilds the **local** Supabase DB from migrations and lints the schema. | `supabase:check` |

## Production and review tools (run by hand or by agents)

| File                          | What it does                                                          | Run by                                |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `prod-db`, `prod-db.mjs`      | Read-only production database observer; the only allowed prod access. | by hand; see `AGENTS.md`              |
| `codex-review.mjs`            | Requests or waits for a Codex PR review with duplicate-post guards.   | by agents; see `AGENTS.md`            |
| `codex-review-state.mjs`      | Reads PR review state for `codex-review.mjs`.                         | `codex-review.mjs`                    |
| `codex-review-lock.mjs`       | Lock so two runs cannot request the same review.                      | `codex-review.mjs`                    |
| `workflow-metrics.mjs`        | Collects read-only CI/review timing baselines from GitHub as JSON.    | by hand; see `workflow-automation.md` |
| `workflow-metrics-timing.mjs` | Timing calculations for `workflow-metrics.mjs`.                       | `workflow-metrics.mjs`                |
