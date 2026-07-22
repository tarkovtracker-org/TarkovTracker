# Development Setup & Coding Standards

This guide covers local development setup, coding standards, common tasks, debugging, and commit
conventions for TarkovTracker. For the contribution workflow overview, see
[`../../.github/CONTRIBUTING.md`](../../.github/CONTRIBUTING.md). For pull-request requirements, see
[`./pull-requests.md`](./pull-requests.md).

## Prerequisites

- **Node.js** >= 24.12.0
- **pnpm** 11.14.0 (via Corepack; matches `packageManager` in `package.json`)
- **Git**

## Installation & Environment Setup

1. **Fork the repository** and clone your fork locally
2. **Install dependencies and set up environment**: `corepack enable && pnpm run setup` (Corepack
   resolves the pnpm version from `packageManager` in `package.json`; `setup` installs with the
   frozen lockfile and creates `.env` from `.env.example` if it does not already exist). Then add
   your Supabase credentials to `.env`. Nuxt auto-loads `.env` on `pnpm run dev`. Full env-var
   reference: [`../runbook.md`](../runbook.md) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
3. **Start dev server**: `pnpm run dev` (serves on `localhost:3000`)
4. **Read [`../../AGENTS.md`](../../AGENTS.md)** for detailed development guidelines

> Most features work without Supabase configured; auth and sync are simply disabled.

## Coding Standards

Coding standards are documented in [`../../AGENTS.md`](../../AGENTS.md) (Coding Conventions,
Nuxt / Vue Rules, TypeScript, Error Handling, Localization sections). That file is the canonical
source — do not duplicate its rules here. Key reminders for new contributors:

- `<script setup lang="ts">` with TypeScript strict
- Tailwind v4 only — no `<style>` blocks, SCSS, or scoped CSS
- Use `@/` aliases instead of relative parent imports
- 2-space indent, 100-char lines, single quotes, semicolons, trailing commas (es5)
- Log errors with `logger` from `@/utils/logger`

## Common Tasks

- **Add a feature:** create a slice in `app/features/`, add a route in `app/pages/`, and a nav link
  in `app/features/drawer/DrawerLinks.vue`.
- **Add a store:** create it in `app/stores/`; configure persistence if it should survive reloads.
- **Add an API endpoint:** create the route in `app/server/api/` and add types in `app/types/`.
- **Add translations:** add snake_case keys to `app/locales/en.json` **only**, then run
  `pnpm run i18n:check`. Use `$t('key.path', 'Fallback')`. Crowdin propagates the other locales —
  never edit them by hand.
- **Tarkov.dev import/linking:** follow the rules in [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
  (persist only `tarkovUid`; the import destination mode is chosen at import time, not stored).

## Debugging

- Install the [Vue DevTools](https://devtools.vuejs.org/) browser extension for component and Pinia
  store inspection.
- Use the shared logger from `@/utils/logger`, not `console`:

  ```typescript
  import { logger } from '@/utils/logger';

  logger.debug('Debug message', { context: 'value' });
  logger.error('Error message', error);
  ```

## Commit Conventions

- Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`. The
  commit-msg hook runs commitlint locally and CI re-checks every commit.
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
  `revert`, `wip`.
- Use an allowed scope from `commitlint.config.js` (e.g. `app`, `ui`, `api`, `tasks`, `team`,
  `i18n`, `docs`) or omit the scope if none fits — do not invent scopes.
- Keep the subject imperative and not ALL-CAPS; header max 100 chars.
- Reference issue numbers when applicable and keep commits focused and atomic.
