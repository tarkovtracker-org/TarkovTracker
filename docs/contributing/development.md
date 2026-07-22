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
2. **Install dependencies**: `corepack enable && pnpm install` (Corepack resolves the pnpm version
   from `packageManager` in `package.json`)
3. **Set up environment**: run `pnpm run setup` (creates `.env` from `.env.example` if it does not
   already exist) or copy `.env.example` to `.env` manually (only if `.env` does not exist), then add
   your Supabase credentials. Nuxt auto-loads `.env` on `pnpm run dev`. Full env-var reference:
   [`../runbook.md`](../runbook.md) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
4. **Start dev server**: `pnpm run dev` (serves on `localhost:3000`)
5. **Read [`../../AGENTS.md`](../../AGENTS.md)** for detailed development guidelines

> Most features work without Supabase configured; auth and sync are simply disabled.

## Coding Standards

**See [`../../AGENTS.md`](../../AGENTS.md) for comprehensive coding standards. Key points:**

### TypeScript & Vue

- Use `<script setup lang="ts">` with TypeScript
- **No `<style>` blocks**—Tailwind v4 is the only styling approach
- 2-space indentation, 100-char line width
- Single quotes, semicolons, trailing commas (es5)

### Imports & Structure

- No blank lines between import groups
- Alphabetically sorted imports
- Use `@/` aliases instead of relative parent imports (`../../`)
- PascalCase components, camelCase functions, kebab-case files

### Styling

- **Tailwind v4 only**—no `<style>` blocks, SCSS, or scoped CSS
- Use Tailwind theme layer for colors—no hex values in templates
- Complex animations go in `app/assets/css/tailwind.css` using `@theme` or `@keyframes`
- Responsive design (mobile-first)

### Error Handling

- Log errors with `logger` from `@/utils/logger`
- Provide user-friendly error messages
- Handle edge cases gracefully

### Testing

- Write tests for new features
- Keep tests deterministic
- Mock network/Supabase calls
- Run `pnpm test` before submitting

## Common Tasks

- **Add a feature:** create a slice in `app/features/`, add a route in `app/pages/`, and a nav link
  in `app/shell/NavDrawer.vue`.
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
