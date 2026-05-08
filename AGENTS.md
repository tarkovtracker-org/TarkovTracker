# Repository Guidelines

## Overview

- Project: Nuxt 4 SPA for TarkovTracker.
- Node >=24.12.0, npm >=11.6.2 (see `package.json` engines).
- Package manager: npm (`packageManager` is `npm@11.13.0`).
- SSR is disabled (`ssr: false`), treat the app as client-only.
- API + proxy handlers live in Nuxt server routes.
- Supabase is the primary backend/data layer.
- Copilot instructions are in `.github/copilot-instructions.md`.

## Project Structure

- `app/` main Nuxt 4 source.
- `app/pages/` file-based routes (kebab-case filenames).
- `app/components/` shared UI components.
- `app/features/` feature slices and domain modules.
- `app/stores/` Pinia stores.
- `app/composables/` composables (Nuxt auto-import).
- `app/plugins/` Nuxt plugins (Supabase, i18n, analytics, store init).
- `app/server/api/` server API routes.
- `app/server/api/tarkov/` tarkov.dev proxy handlers.
- `app/server/middleware/` server middleware.
- `app/server/utils/` server utilities.
- `app/shell/` app chrome components.
- `app/locales/` JSON locale files.
- `app/assets/` shared styles/assets (if present).
- `public/` static assets served as-is.
- `docs/` project documentation.
- `supabase/` edge functions + DB assets (lint ignores `supabase/functions/**`).
- `nuxt.config.ts` and `app.config.ts` hold app configuration.
- `eslint.config.mjs` and `.prettierrc` define lint/format rules.

## Architecture Notes

- Current feature slices under `app/features/` include `admin`, `dashboard`, `drawer`, `hideout`, `maps`, `neededitems`, `profile`, `settings`, `storyline`, `streamer-tools`, `tasks`, and `team`.
- Core app state is coordinated through `useTarkovStore` with `useMetadataStore`, `useProgressStore`, and `usePreferencesStore`.

## Dev & Build Commands

- `npm install` installs dependencies.
- `npm run dev` starts HMR dev server at `http://localhost:3000`.
- `npm run build` creates the production SPA build.
- `npm run preview` serves the built bundle locally.
- `npm run generate` generates static output for edge/CDN hosting.
- `npm run deps` runs `taze` to check dependency updates.
- `npm run test` runs the full unit test suite.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:coverage` runs coverage.
- `npm run test:api-gateway` runs Worker tests.
- `npm run validate:openapi` validates the Worker OpenAPI contract.
- `npm run i18n:check` validates locale keys against `app/locales/en.json`; it is fatal **only** for snake_case naming violations in `en.json`. Missing or orphaned keys in non-English locales are reported informationally and do not fail the check (Crowdin reconciles them on its sync cycle).
- `npm run supabase:types` regenerates Supabase TS types.

## Lint & Format Commands

- `npm run lint` runs ESLint on `app/` with zero warnings.
- `npm run lint:fix` auto-fixes lint issues in `app/`.
- `npm run format` runs Prettier then ESLint fixes.
- `npm run typecheck` runs Nuxt/Vue TypeScript checking.
- Prettier targets `app/**/*.{js,ts,tsx,vue,json,css,md}`.
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

- `npm run test` runs the full unit test suite.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:coverage` outputs coverage reports.
- `npm run test:api-gateway` runs the API gateway tests.
- `npx vitest` runs Vitest directly when you need ad hoc options.
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

- **Only edit `app/locales/en.json`.** Do not add, remove, rename, or reformat keys in any non-English locale file (`cs`, `de`, `es`, `fr`, `it`, `ko`, `pl`, `pt`, `ru`, `uk`, `zh`) — Crowdin owns those and reconciles adds/removes on its sync cycle.
- vue-i18n is configured with `fallbackLocale: 'en'` (`app/i18n.config.ts`), so any key missing from a non-English locale automatically renders the English value at runtime. Never copy English text into non-English locales as a "fallback" — it is redundant and can register in Crowdin as a completed translation.
- When adding or changing user-facing copy, add the key only to `en.json`, keep it stable, then run `npm run i18n:check`. Crowdin handles propagation and translation on its sync cycle.
- `npm run i18n:check` is intentionally lenient on the non-English files: missing keys and orphaned/extra keys are reported as informational only (the runtime fallback or the next Crowdin sync handles them). The check is fatal **only** for snake_case naming violations in `en.json`.
- The sole exception is fixing a broken Crowdin export PR — and even then, only touch the file(s) Crowdin produced.
- Add keys consistently with existing namespace patterns.
- Locale keys must be snake_case.
- Provide a fallback string in `t('key', 'Fallback')` calls for user-visible strings, matching surrounding component patterns.
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

## External Data Rules

- When using Tarkov API or MCP tools, state only what the API returned.
- Missing API data is not proof the item, mechanic, or content does not exist in-game; say the API does not show it.

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
- **Prefer simple branching.** Use the current checkout and a normal branch unless the user explicitly asks for a worktree or the current checkout is unsafe.
- **Use allowed commit scopes.** When creating commits, use the scopes listed in `commitlint.config.js`: `app`, `workers`, `api`, `ui`, `tasks`, `hideout`, `maps`, `team`, `settings`, `admin`, `i18n`, `deps`, `config`, `ci`, `test`, `docs`, `release`.
- **Do not invent new scopes.** If a change does not fit an allowed scope cleanly, omit the scope instead of using an unrecognized one.
- **Map common cases consistently.** Use `ui` for theme/styling/shell work and `docs` for repository/process documentation such as `AGENTS.md`.
- **Never run destructive git commands without explicit user approval in the current conversation**. This includes `git restore`, `git checkout --`, `git reset` (any mode), `git clean`, and force-push operations. Always ask first.

## Git Workflow

- Prefer a normal branch in the current checkout for new work.
- Before edits, run `git status --short --branch`.
- Do not create a worktree unless the user explicitly asks, the current checkout is unsafe to use, or an existing PR/branch must be tested separately.
- If a worktree is truly needed, explain why, name the exact path and branch, and keep repeating that path in status updates.
- Never mix unrelated changes in one commit or PR.
- Do not use `git stash` for normal context switching unless the user asks.
- Never run destructive git commands without explicit approval in the current conversation.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions to answer, if any.

# Agent Instructions

Fast Apply: IMPORTANT: Use `edit_file` over `str_replace` or full file writes. It works with partial code snippets—no need for full file content.

Warp Grep: warp-grep is a subagent that takes in a search string and tries to find relevant context. Best practice is to use it at the beginning of codebase explorations to fast track finding relevant files/lines. Do not use it to pin point keywords, but use it for broader semantic queries. "Find the XYZ flow", "How does XYZ work", "Where is XYZ handled?", "Where is <error message> coming from?"
