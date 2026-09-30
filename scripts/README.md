# scripts/

Repository tooling that is not part of the shipped app. Nothing here is bundled into the site. Each
script is run by a `package.json` command, a Git hook, a GitHub Actions workflow, the release
tooling, or a person or agent by hand. Every folder has its own README listing each file, what it
does, and what runs it. If a file's **Run by** entry names nothing, it is a removal candidate.

Behavior is documented in [`docs/workflow-automation.md`](../docs/workflow-automation.md) (CI,
hooks, previews, releases) and [`docs/systems.md`](../docs/systems.md) (precompute, drift checks).

## Folders

| Folder                                 | Purpose                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| [`checks/`](./checks/)                 | Formatting, linting, and consistency checks you can run locally or in CI. |
| [`ci/`](./ci/)                         | CI job planning, result gates, and GitHub automation helpers.             |
| [`codex-review/`](./codex-review/)     | Tool agents use to request or wait for a Codex PR review.                 |
| [`ops/`](./ops/)                       | Read-only production database observer.                                   |
| [`precompute/`](./precompute/)         | Scheduled pipeline that precomputes Tarkov data into Cloudflare KV.       |
| [`preview/`](./preview/)               | `/preview` pipeline that deploys a PR to Cloudflare Pages.                |
| [`release/`](./release/)               | semantic-release plugins, release gate, and recovery.                     |
| [`setup/`](./setup/)                   | Local development setup, Git worktrees, and pnpm bootstrap.               |
| [`workflow-tests/`](./workflow-tests/) | Contract tests for GitHub workflows and automation scripts.               |

## Why not `.github/`?

GitHub only gives special meaning to `.github/workflows/`, `.github/actions/`, and a few config
files; a script there is loaded by path exactly like one here. Many of these scripts also run
locally (hooks, `pnpm` commands, release tooling, production DB access), so all tooling lives in
one place and is grouped by purpose.

## File extensions and naming

| Pattern            | Meaning                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `*.mjs`            | Node.js script using ES modules (`import`). Runs with `node`, no build.  |
| `*.sh`             | Bash script. Run with `bash`.                                            |
| `*.ts`             | TypeScript run with `tsx` (only `precompute/`, which imports app code).  |
| `ops/prod-db`      | Extensionless Bash wrapper so the command reads `scripts/ops/prod-db …`. |
| `*.test.mjs`       | Vitest tests, run by `pnpm run test`.                                    |
| `*-tests.mjs`      | `node --test` tests in `codex-review/`, run by `pnpm run test:workflow`. |
| `workflow-tests/*` | `node --test` tests, run by `pnpm run test:workflow`.                    |
| `*.smoke.mjs`      | Playwright smoke tests for previews; Vitest never picks them up.         |
