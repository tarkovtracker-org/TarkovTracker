# Repository Guidelines

## Overview

- Project: Nuxt 4 SPA for TarkovTracker.
- Node >=24.12.0, npm >=11.6.2 (see `package.json` engines).
- Package manager: npm (`packageManager` is `npm@11.8.0`).
- SSR is disabled (`ssr: false`), treat the app as client-only.
- API + proxy handlers live in Nuxt server routes.
- Copilot instructions are in `.github/copilot-instructions.md`.

## Project Structure

- `app/` main Nuxt 4 source.
- `app/pages/` file-based routes (kebab-case filenames).
- `app/components/` shared UI components.
- `app/features/` feature slices and domain modules.
- `app/stores/` Pinia stores.
- `app/composables/` composables (Nuxt auto-import).
- `app/plugins/` Nuxt plugins (Supabase, i18n, Vuetify, store init).
- `app/server/api/` server API routes.
- `app/server/api/tarkov/` tarkov.dev proxy handlers.
- `app/locales/` JSON5 locale files.
- `app/assets/` shared styles/assets (if present).
- `public/` static assets served as-is.
- `docs/` project documentation.
- `supabase/` edge functions + DB assets (lint ignores `supabase/functions/**`).
- `nuxt.config.ts` and `app.config.ts` hold app configuration.
- `eslint.config.mjs` and `.prettierrc` define lint/format rules.

## Dev & Build Commands

- `npm install` installs dependencies.
- `npm run dev` starts HMR dev server at `http://localhost:3000`.
- `npm run build` creates the production SPA build.
- `npm run preview` serves the built bundle locally.
- `npm run generate` generates static output for edge/CDN hosting.
- `npm run deps` runs `taze` to check dependency updates.
- `npm run supabase:types` regenerates Supabase TS types.

## Lint & Format Commands

- `npm run lint` runs ESLint on `app/` with zero warnings.
- `npm run lint:fix` auto-fixes lint issues in `app/`.
- `npm run format` runs Prettier then ESLint fixes.
- `npm run typecheck` runs Nuxt/Vue TypeScript checking.
- Prettier targets `app/**/*.{js,ts,tsx,vue,json,json5,css,md}`.
- Prettier also formats `docs/**/*.{md,markdown}` and top-level configs.
- Formatting uses `prettier-plugin-tailwindcss` for class sorting.
- `printWidth` 100, `tabWidth` 2, `singleQuote` true, `semi` true.
- `trailingComma` is `es5`; `vueIndentScriptAndStyle` is enabled.

## Lint Rule Highlights

- No parent-relative imports (`import-x/no-relative-parent-imports`).
- Import ordering is enforced with no blank lines between groups.
- Imports are alphabetized (case-insensitive).
- `prefer-const` and `no-var` are warnings; keep modern syntax.
- `no-multiple-empty-lines` with `max: 0` avoids empty lines.
- Vue `html-self-closing` rule is disabled for now.

## Test Commands

- `npx vitest` runs the full unit test suite.
- `npx vitest --ui` opens the Vitest UI dashboard.
- `npx vitest --coverage` outputs coverage reports.
- `npx vitest path/to/file.test.ts` runs a single test file.
- `npx vitest -t "pattern"` runs tests matching a name.
- Tests live next to code under `__tests__/` folders.
- Stack: Vitest + Vue Test Utils + `@nuxt/test-utils` (globals enabled).
- Mock network/Supabase calls; keep tests deterministic.
- Prefer focused tests over end-to-end flows.

## Naming & File Conventions

- Components use PascalCase names and filenames.
- Composables use camelCase and start with `use` (e.g., `useFoo`).
- Pinia stores use `useXStore` naming.
- Route files use kebab-case (e.g., `app/pages/task-detail.vue`).
- Test files are `*.test.ts` and live in `__tests__/`.
- Constants use `UPPER_SNAKE_CASE` when globally shared.
- Prefer descriptive names over abbreviations.

## Coding Style (General)

- Vue SFCs use `<script setup lang="ts">`.
- **Tailwind v4 is the only styling approach**—no `<style>` blocks, SCSS, or scoped CSS.
- 2-space indentation and 100-character line width.
- Single quotes, semicolons, trailing commas (es5).
- Keep functions small and focused; avoid deep nesting.
- Prefer early returns to reduce indentation.
- Avoid inline comments unless a decision needs explanation.
- Keep page files lean; move logic into features/composables.
- Avoid adding new global state unless necessary.

## Imports & Modules

- Use `@/` aliases for internal imports.
- Parent-relative imports (`../`) are blocked by lint.
- Sort imports alphabetically (case-insensitive).
- Group order: builtin → external → internal → parent → sibling → index → object → type.
- No blank lines between import groups.
- Avoid unused imports and unused exports.
- Keep type-only imports explicit when helpful.

## Nuxt & Vue Conventions

- Routes map to files in `app/pages/`.
- Auto-imported components/composables should not be explicitly imported.
- Do not import Vue/Nuxt auto-imported utilities (`ref`, `computed`, `watch`, hooks, `useRoute`, `useFetch`, etc.); remove them when found.
- Explicitly import Pinia stores and utilities.
- Use `definePageMeta` and `useHead` for page metadata.
- Prefer Nuxt `useFetch`/`useAsyncData` for data fetching.
- Remember SPA mode; avoid SSR-only features.
- Keep plugins in `app/plugins/` and name them `*.client.ts` as needed.
- Use `useRuntimeConfig()` for env-driven values.
- Keep server handlers small and composable.

## Styling & UI

- **Tailwind v4 only**—do not use `<style>` blocks, SCSS, or scoped CSS in components.
- Tailwind classes are sorted by Prettier; keep class lists tidy.
- Use Tailwind theme layer for colors—no hex values in templates.
- For complex animations, define them in `app/assets/css/tailwind.css` using `@theme` or `@keyframes`.
- Prefer shared UI in `app/components/` or `app/features/**/components`.
- Use `@nuxt/ui` components consistently with existing patterns.
- Inline styles are acceptable only for truly dynamic values (e.g., computed positions).

## TypeScript Guidelines

- Prefer explicit types for exported functions, stores, and composables.
- Avoid `any`; use `unknown` + narrowing when needed.
- Use union/string literal types for constrained values.
- Keep types close to usage; reuse existing types where possible.
- Use `as const` when literal inference matters.
- Match existing patterns for enums (often union types).
- Avoid duplicating types already in Supabase generated files.

## State, Data, and APIs

- Pinia stores live in `app/stores/` and are auto-registered by Nuxt.
- Use `pinia-plugin-persistedstate` conventions where applicable.
- Supabase client is configured in `app/plugins/supabase.client.ts`.
- Regenerate Supabase types via `npm run supabase:types`.
- API endpoints live in `app/server/api/`; keep handlers small.
- Use server routes for tarkov.dev proxy logic.
- Prefer composables for shared data access patterns.
- Mock Supabase/network calls in tests.

## Error Handling & Logging

- Wrap async operations in `try/catch`.
- Log errors with `logger` from `@/utils/logger`.
- Include context in logs (feature, action, ids).
- Surface user-friendly messages in UI when possible.
- Avoid swallowing errors unless explicitly handled.
- Re-throw or return meaningful fallbacks when needed.

## Localization

- Locale files live in `app/locales/*.json5`.
- Add keys consistently with existing namespace patterns.
- Locale keys must be snake_case.
- Provide safe fallback strings where appropriate.
- Keep locale keys stable to avoid churn.
- Avoid hard-coded user-facing strings in components.

## Miscellaneous

- Static assets go in `public/`.
- Keep secrets out of the repo; use `useRuntimeConfig()`.
- The app is SPA-only; validate changes in the browser.
- Respect existing lint warnings; do not introduce new ones.
- Keep commits small and scoped when asked to commit.

## Analytics Access

- Prefer structured analytics access over dashboard scraping.
- Use GA4 MCP or BigQuery for quantitative product analysis, events, funnels, trends, and segmentation.
- Use Clarity MCP for recordings, heatmaps, rage clicks, dead clicks, quick backs, and session-level UX debugging.
- Use Cloudflare GraphQL MCP for traffic anomalies, caching, latency, bot/security noise, and edge/network diagnostics.
- When investigating user issues, correlate findings across GA4, Clarity, and Cloudflare when possible.
- Always state the date range, property/project/zone, and source used in analytics conclusions.
- Use browser-based dashboard inspection only as a fallback when MCP/API access is missing or insufficient.

## Agent Rules

- **No over-thinking in responses**. Sacrifice explanatory language for brevity—layman's terms only when necessary.
- **Be concise**. Direct responses only: "Fixed X by changing Y to Z." Minimize explanation unless asked. Use file references for context.
- **No comments** unless explicitly requested. Comments are token overhead.
- **Run `npm run format` once** before leaving code. It handles both formatting and linting. Only show errors, skip success output.
- **Run `npm run typecheck` during review/fix loops and whenever TypeScript-affecting files change.** `npm run format` does not run type checking; fix reported TS errors as part of the loop unless they are clearly unrelated blockers.
- **Own all issues**. Fix formatting, linting, and pre-existing bugs without being asked. Don't deflect with "these are from earlier changes."
- **Find root cause**. When fixing issues, identify and address the root cause, not just the symptoms.
- **Self-assess code**. Don't ask "what does this do?" Read and understand it. Only clarify ambiguous intent ("Is this supposed to do X or Y?").
- **Ask before acting on complex requests**. Clarify ambiguous or multi-interpretation tasks before proceeding—it's better to ask one question than redo work.
- **Check before isolating workspace.** Inspect the current branch, working tree, and existing worktrees first; reuse or continue when clearly appropriate, and ask before creating a new worktree when there is any ambiguity.
- **Use allowed commit scopes.** When creating commits, use the scopes listed in `commitlint.config.js`: `app`, `workers`, `api`, `ui`, `tasks`, `hideout`, `maps`, `team`, `settings`, `admin`, `i18n`, `deps`, `config`, `ci`, `test`, `docs`, `release`.
- **Do not invent new scopes.** If a change does not fit an allowed scope cleanly, omit the scope instead of using an unrecognized one.
- **Map common cases consistently.** Use `ui` for theme/styling/shell work and `docs` for repository/process documentation such as `AGENTS.md`.
- **Never run destructive git commands without explicit user approval in the current conversation**. This includes `git restore`, `git checkout --`, `git reset` (any mode), `git clean`, and force-push operations. Always ask first.

## Git Workspace Isolation

- Default to one task per worktree.
- Before edits, run `git status --short --branch` and `git worktree list`.
- Reuse the current worktree when the request clearly belongs to the same task or branch already in progress.
- Reuse an existing sibling worktree when it already matches the task instead of creating a duplicate for the same work.
- If the current checkout is dirty, belongs to another task, or the user starts a new independent task, recommend isolation instead of mixing changes in place.
- Before creating a new worktree, briefly state what you found and ask whether to continue here, reuse an existing worktree, or create a new one. Only create without asking when the user explicitly requested a new worktree, branch isolation, or parallel task checkout.
- Do not create multiple worktrees for the same task or branch unless the user explicitly asks for another one.
- Keep the primary repo checkout clean on `main`; do task work in sibling worktrees named like `../<repo>-<branch-slug>`.
- Base new task worktrees from `main` unless the user explicitly asks for another base branch.
- Branch names should be short and task-scoped, for example `review/pr-236`, `fix/foo`, `chore/readme`, or `spike/new-idea`.
- Do not use `git stash` for normal context switching. Prefer a new worktree; if a checkpoint is needed, prefer a local WIP commit.
- Never mix unrelated work in the same worktree and never make quick side changes inside an active PR or review worktree.
- After isolating work, state the branch and filesystem path in one short line, then continue.
- When work is complete, suggest exact cleanup commands for removing the worktree and deleting the branch, but do not run them unless the user asks.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions to answer, if any.
