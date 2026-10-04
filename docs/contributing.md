# Contributing Guide

Local setup, coding standards, and the pull-request process for TarkovTracker. For the
contribution workflow overview (issues, branches, labels, project board), see
[`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md). Canonical agent conventions live in
[`../AGENTS.md`](../AGENTS.md) — that file outranks this one.

## Development setup

### Prerequisites

- **Node.js** at the version in [`.nvmrc`](../.nvmrc) (`fnm use` / `nvm use`)
- **pnpm** 11.14.0 (via Corepack; matches `packageManager` in `package.json`)
- **Git**

### Installation & environment

1. **Fork the repository** and clone your fork locally
2. **Install dependencies and set up environment**: `corepack enable && pnpm run setup` (Corepack
   resolves the pnpm version from `packageManager` in `package.json`; `setup` installs with the
   frozen lockfile and creates `.env` from `.env.example` if it does not already exist). Then add
   your Supabase credentials to `.env`. Nuxt auto-loads `.env` on `pnpm run dev`. Full env-var
   reference: [`./runbook.md`](./runbook.md) and [`./architecture.md`](./architecture.md).
3. **Start dev server**: `pnpm run dev` (serves on `localhost:3000`)

> Most features work without Supabase configured; auth and sync are simply disabled.

### Coding standards

Coding standards are documented in [`../AGENTS.md`](../AGENTS.md) (Commands,
Validation, Invariants sections). That file is the canonical
source — do not duplicate its rules here. Key reminders for new contributors:

- `<script setup lang="ts">` with TypeScript strict
- Tailwind v4 only — no `<style>` blocks, SCSS, or scoped CSS
- Use `@/` aliases instead of relative parent imports
- 2-space indent, 100-char lines, single quotes, semicolons, trailing commas (es5)
- Log errors with `logger` from `@/utils/logger`

### Common tasks

- **Add a feature:** create a slice in `app/features/`, add a route in `app/pages/`, and a nav link
  in `app/features/drawer/DrawerLinks.vue`.
- **Add a store:** create it in `app/stores/`; configure persistence if it should survive reloads.
- **Add an API endpoint:** create the route in `app/server/api/` and add types in `app/types/`.
- **Add translations:** add snake_case keys to `app/locales/en.json` **only**, then run
  `pnpm run i18n:check`. Use `$t('key.path', 'Fallback')`. Crowdin propagates the other locales —
  never edit them by hand. Remove a key from `en.json` when its last usage goes; the check fails on
  keys with no possible reference in `app/` and on broken locales (invalid JSON or message syntax,
  unknown placeholders, structure mismatches). Untranslated keys fall back to English and never
  fail it.
- **Tarkov.dev import/linking:** follow the rules in [`./architecture.md`](./architecture.md)
  (persist only `tarkovUid`; the import destination mode is chosen at import time, not stored).

### Debugging

- Install the [Vue DevTools](https://devtools.vuejs.org/) browser extension for component and Pinia
  store inspection.
- Use the shared logger from `@/utils/logger`, not `console`:

  ```typescript
  import { logger } from '@/utils/logger';

  logger.debug('Debug message', { context: 'value' });
  logger.error('Error message', error);
  ```

- For local client performance profiling, set `VITE_PERF_DEBUG=true` in `.env` before starting the
  dev server. The flag also accepts `1`, `yes`, or `on`; it enables timing logs from
  `app/utils/perf.ts` and should remain unset or `false` for normal development.

### Commit conventions

- PR titles and commit headers start with a [Conventional Commits](https://www.conventionalcommits.org/)
  type: `type: summary` or `type(scope): summary`. That prefix is the only rule.
- PRs are squash-merged, so the **PR title** becomes the commit on `main` that drives releases. CI
  checks only the PR title (`PR Title` workflow); fix a failure by editing the title — no rewording
  or force-pushing. The local commit-msg hook checks the same prefix on branch commits.
- Allowed types live in `scripts/checks/commit-types.mjs`: `feat`, `fix`, `perf`, `revert`,
  `refactor`, `docs`, `test`, `style`, `build`, `ci`, `chore`, `wip`. `feat` releases a minor
  version; `fix`, `perf` and `revert` release a patch.
- Scopes are free-form. Internal scopes such as `ci`, `deps`, `docs`, `preview` or `no-release`
  never trigger a release (`scripts/release/release-scope.mjs`).
- Length, casing and body formatting are not enforced.

## Pull request process

For automatic ready-PR previews, draft pauses, stop commands and fork approvals, see the
[preview system spec](systems/previews.md). Mark an ordinary same-repository PR ready after
validation; successful current CI requests its preview without another command.

### Branching strategy

Create a branch named with a type prefix and a short description:

```bash
git checkout -b type/short-description
```

Branch naming convention:

- `fix/issue-description` - Bug fixes
- `feat/feature-name` - New features
- `enhance/improvement` - Enhancements
- `refactor/area-name` - Code refactoring
- `docs/topic` - Documentation
- `chore/task` - Maintenance tasks

Each pull request must focus on a single change (fix, update, documentation, or feature). Unrelated
changes may be requested to be split or closed.

### Before submitting

1. **Self-review your code**
   - Remove debug logs and commented code
   - Check for typos and formatting
   - Ensure no secrets or credentials

2. **Run the smallest relevant validation**
   - `pnpm run lint` (must pass with zero warnings) — for any code change
   - `pnpm run typecheck` — for TypeScript changes
   - `pnpm test` — only if your change touches executable code that could break tests
   - Test manually in browser — for UI changes
   - Test in both PvP and PvE modes — if the change is mode-specific
   - Docs-only PRs do not need lint, typecheck, or tests

3. **Update documentation**
   - Update README if adding features
   - Update [`../AGENTS.md`](../AGENTS.md) if changing architecture or repo-wide agent guidance

### PR requirements

- PR title starts with a conventional type (e.g. `feat(tasks): add objective filter`) — checked by
  the `PR Title` workflow
- All template sections completed
- Linked to related issue(s)
- Passes all CI checks
- No merge conflicts
- Approved by at least one maintainer

### PR template fields

The PR template ([`../.github/pull_request_template.md`](../.github/pull_request_template.md))
asks for the following sections. Complete every section:

- **Summary** — a brief description of what the PR does.
- **Release note** — one or two player-facing sentences (or bullets) for the next release's
  Highlights and the in-app changelog, or `none` for changes players will not notice. Describe the
  effect, not the implementation. Notes from contributors without write access are not published
  automatically; a maintainer adds them to the release.
- **Changes** — a list of the key changes made.
- **Related Issues** — link related issues using keywords (`Fixes #123`, `Closes #456`,
  `Related to #789`).
- **Testing** — mark how you tested (locally, production-like environment, unit tests, manual) and
  describe your test plan.
- **Screenshots/Videos** — add screenshots or videos for UI changes.
- **Documentation impact** — select whether behavior changed and whether docs were updated or a
  follow-up issue tracks them; tick the documents reviewed.
- **Checklist** — confirm your code follows conventions, you self-reviewed, documentation is updated,
  no new warnings/errors, tests pass, and breaking changes are checked.
- **Additional Notes** — anything reviewers should know.

### Review process

1. Maintainers and automated review tools review your PR
2. Address all feedback on the same PR branch — do not open follow-up PRs for in-scope feedback
3. Every inline review thread and every top-level/review-summary comment must have an explicit
   disposition (fixed, rejected with rationale, or deferred to a tracked issue) before merge
4. Once all reviews complete, all threads are resolved, and CI is green, a maintainer merges
5. Your contribution deploys once merged and appears in the next release (with its release note
   under Highlights)!

> The full review gate, including rate-limit handling, is in [`../AGENTS.md`](../AGENTS.md) under
> "Workflow and review".

For finding and claiming work, see
[`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) ("How to Find and Claim Work").
