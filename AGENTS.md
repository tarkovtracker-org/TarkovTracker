# TarkovTracker — Agent Instructions

This file is the canonical agent contract for this repository.
All AI coding agents (pi, Claude Code, Copilot, Codex, Windsurf, Gemini, CodeRabbit) treat this as the source of truth.

## Maintenance Contract

Update this file or a scoped child `AGENTS.md` in the same PR when a change modifies:

- package manager, runtime, build, lint, test, or dev-server commands
- folder layout, module boundaries, entrypoints, generated files, or aliases
- public API shape, auth flow, data model, env vars, or external services
- required validation steps, PR/release workflow, or commit scopes
- localization workflow, Crowdin behavior, or locale file ownership
- analytics tooling, MCP access, or external data integrations
- deprecated patterns that agents must avoid

If this file conflicts with executable config (eslint, prettier, tsconfig, package.json), trust the executable config, then update this file before finishing.

## Source-of-Truth Priority

1. Executable config (eslint.config.mjs, .prettierrc, tsconfig, nuxt.config.ts, package.json scripts)
2. This file (AGENTS.md)
3. Tool-specific bridge files (.github/copilot-instructions.md, .claude/CLAUDE.md)

## Project Snapshot

- **Stack:** Nuxt 4 SPA (`ssr: false`), Vue 3 Composition API, TypeScript strict, Pinia, Supabase, Tailwind CSS v4, Vitest, Cloudflare Pages/Workers.
- **Runtime:** Node >=24.12.0, npm >=11.6.2 (packageManager: npm@11.13.0).
- **Backend:** Supabase (auth, database, realtime). API proxy via Nitro server routes.
- **Deployment:** Cloudflare Pages/Workers.

## Project Map

- `app/` — Nuxt 4 source. Pages, components, features, stores, composables, plugins, server routes, locales, shell.
- `app/features/` — Domain slices: `admin`, `dashboard`, `drawer`, `hideout`, `maps`, `neededitems`, `profile`, `settings`, `storyline`, `streamer-tools`, `supporter`, `tasks`, `team`.
- `app/server/api/` — Nitro server routes. `app/server/api/tarkov/` for tarkov.dev proxy.
- `app/shell/` — App chrome (AppBar, NavDrawer, AppFooter).
- `app/stores/` — Pinia stores. Core state: `useTarkovStore` with `useMetadataStore`, `useProgressStore`, `usePreferencesStore`.
- `app/locales/` — JSON locale files. `en.json` is source; non-English files are Crowdin-owned.
- `supabase/` — `config.toml`, `functions/` (Deno edge functions), `migrations/`.
- `workers/` — Cloudflare Workers (api-gateway).
- `docs/` — Project documentation.
- `public/` — Static assets.
- Config: `nuxt.config.ts`, `app.config.ts`, `eslint.config.mjs`, `.prettierrc`, `commitlint.config.js`.

## Commands

Install: `npm install` | Dev: `npm run dev` (localhost:3000) | Build: `npm run build` | Preview: `npm run preview` | Static: `npm run generate`

Test: `npm run test` | Watch: `npm run test:watch` | Coverage: `npm run test:coverage` | API gateway: `npm run test:api-gateway`

Lint: `npm run lint` (zero warnings) | Fix: `npm run lint:fix` | Format: `npm run format` (Prettier + ESLint fix) | Typecheck: `npm run typecheck`

i18n check: `npm run i18n:check` | Supabase types: `npm run supabase:types` | OpenAPI validate: `npm run validate:openapi` | Deps: `npm run deps`

## Validation Policy

Before finishing any agent task:

- Run the smallest relevant validation (typecheck for TS changes, lint for code changes, i18n:check for locale changes).
- State what validation was run and what passed/failed.
- Do not run the full test suite unless you changed test logic or executable code that could break tests.
- Respect existing lint warnings; do not introduce new ones.
- Formatting is handled by the pre-commit hook (husky + lint-staged runs prettier + eslint --fix on staged files). Do not run `npm run format` manually unless the hook is bypassed.

## Hard Rules

- **SPA-only.** SSR is disabled. Do not use SSR-only features (`useAsyncData` SSR options, server-only middleware, etc.).
- **Tailwind v4 only.** No `<style>` blocks, SCSS, or scoped CSS in components. Use Tailwind theme for colors — no hex values in templates.
- **No parent-relative imports.** Use `@/` aliases. ESLint enforces this.
- **Only edit `app/locales/en.json`.** Non-English locale files are Crowdin-owned. Never copy English into non-English locales as a "fallback."
- **Keep secrets out of the repo.** Use `useRuntimeConfig()` for env-driven values.
- **No destructive git commands** (`git restore`, `git checkout --`, `git reset`, `git clean`, force-push) without explicit user approval in the current conversation.
- **No runtime dependency additions** without explaining why existing deps are insufficient.
- **Keep changes scoped** to the requested task. Prefer small, reviewable diffs.

## Coding Conventions

Formatting is enforced by Prettier + ESLint (see `.prettierrc`, `eslint.config.mjs`). Key rules:

- 2-space indent, 100-char lines, single quotes, semicolons, trailing commas (es5).
- Imports: alphabetically sorted, no blank lines between groups, group order: builtin → external → internal → parent → sibling → index → object → type.
- Avoid unused imports/exports.
- Keep functions small; prefer early returns. Avoid inline comments unless explaining a non-obvious decision.

Naming:

- Components: PascalCase filenames. Composables: `useCamelCase`. Stores: `useXStore`.
- Routes: kebab-case. Tests: `*.test.ts` in `__tests__/`. Constants: `UPPER_SNAKE_CASE` for globals.

## Nuxt / Vue Rules

- Vue SFCs use `<script setup lang="ts">`.
- Auto-imported Vue/Nuxt utilities (`ref`, `computed`, `watch`, `useRoute`, `useFetch`, hooks) must not be explicitly imported.
- Explicitly import Pinia stores and utilities.
- Use `definePageMeta` and `useHead` for page metadata.
- Prefer `useFetch`/`useAsyncData` for data fetching.
- Use `*.client.ts` suffix for client-only plugins.
- Keep page files lean; move logic into features/composables.
- Avoid adding new global state unless necessary.
- Keep server handlers small and composable.

## TypeScript

- Prefer explicit types for exports. Avoid `any`; use `unknown` + narrowing.
- Use union/string literal types for constrained values. `as const` for literal inference.
- Do not duplicate types already in Supabase generated files.

## Localization

- `app/locales/en.json` is the source locale. Only edit this file.
- Non-English files (`cs`, `de`, `es`, `fr`, `it`, `ko`, `pl`, `pt`, `ru`, `uk`, `zh`) are Crowdin-owned exports.
- vue-i18n fallback locale is `en` (`app/i18n.config.ts`). Missing non-English keys render English automatically.
- `npm run i18n:check` is fatal only for snake_case naming violations in `en.json`. Missing/orphaned keys in non-English files are informational.
- Locale keys must be snake_case. Provide fallback strings in `t('key', 'Fallback')` calls.
- When adding user-facing copy: add key to `en.json` only, run `npm run i18n:check`. Crowdin handles propagation.
- Add keys consistently with existing namespace patterns. Keep locale keys stable to avoid churn.
- Avoid hard-coded user-facing strings in components.
- The sole exception to not editing non-English locale files is fixing a broken Crowdin export PR; even then, only touch the file(s) Crowdin produced.

## State, Data, and APIs

- Pinia stores in `app/stores/`, auto-registered by Nuxt. Use `pinia-plugin-persistedstate` where applicable.
- Supabase client: `app/plugins/supabase.client.ts`. Regenerate types: `npm run supabase:types`.
- API endpoints: `app/server/api/`. Use composables for shared data access patterns.
- Mock Supabase/network calls in tests. Keep tests deterministic.

## Error Handling

- Wrap async operations in `try/catch`. Log with `logger` from `@/utils/logger`.
- Include context in logs (feature, action, ids). Surface user-friendly messages in UI.
- Re-throw or return meaningful fallbacks; do not swallow errors silently.

## Analytics & External Data

- Prefer structured analytics over dashboard scraping: GA4 MCP/BigQuery for funnels/trends, Clarity MCP for recordings/heatmaps, Cloudflare GraphQL for traffic/caching/latency.
- When investigating user issues, correlate across GA4, Clarity, and Cloudflare when possible.
- Always state date range, property/project/zone, and source used in analytics conclusions.
- When using Tarkov API or MCP tools, state only what the API returned. Missing API data is not proof the content doesn't exist in-game.
- Use browser-based dashboard inspection only as a fallback when MCP/API access is missing or insufficient.

## Git Workflow

- Prefer a normal branch in the current checkout.
- Before edits, run `git status --short --branch`.
- Never mix unrelated changes in one commit or PR.
- Do not use `git stash` for normal context switching unless the user asks.
- Do not create a worktree unless the user explicitly asks, the current checkout is unsafe, or an existing PR/branch must be tested separately. If a worktree is truly needed, explain why, name the exact path and branch, and keep repeating that path in status updates.
- Commit scopes (from `commitlint.config.js`): `app`, `workers`, `api`, `ui`, `tasks`, `hideout`, `maps`, `team`, `settings`, `admin`, `i18n`, `deps`, `config`, `ci`, `test`, `docs`, `release`. Do not invent new scopes; omit the scope if none fits. Map common cases: `ui` for theme/styling/shell work, `docs` for repository/process documentation such as `AGENTS.md`.
- Commit types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `wip`.
- Header max 100 chars. Subject must not be UPPER_CASE.

## Environment Variables

- Use one canonical env var name per concept.
- Use `NUXT_PUBLIC_*` for browser-exposed Nuxt runtime config.
- Use `NUXT_*` for private Nuxt runtime config (server-only).
- Use platform-native names for Supabase Edge Functions (`SUPABASE_*`, `STRIPE_*`, `DISCORD_*`).
- Do not add legacy aliases or fallback chains without explicit approval.
- If an env var is renamed, update source, docs, examples, CI/deploy references, and tests in the same change.
- See `docs/ARCHITECTURE.md` for the canonical env var map.

## Agent Behavior

- **Be concise.** Direct responses only. Minimize explanation unless asked.
- **No comments** in code unless explicitly requested.
- **Own issues introduced by the current change.** Fix pre-existing issues only when they block validation or are directly related to the task. Report unrelated pre-existing issues separately instead of expanding the diff.
- **Find root cause.** Address root cause, not symptoms.
- **Self-assess code.** Read and understand it. Only clarify ambiguous intent.
- **Ask before acting** on complex or multi-interpretation tasks.
- **Plan mode:** keep plans concise. List unresolved questions at the end.

## Tool-Specific Notes

- **Claude Code:** `.claude/CLAUDE.md` imports this file. Use `.claude/rules/` for path-scoped rules.
- **GitHub Copilot:** `.github/copilot-instructions.md` contains lean Copilot-specific context.
- **CodeRabbit:** `.coderabbit.yaml` configures review behavior and path instructions. Auto-detects `AGENTS.md`.

## Deeper References

- Agent-context index: `docs/agent-context/README.md`
- Style, testing, and validation details: `docs/agent-context/style-and-validation.md`
- Architecture: `docs/ARCHITECTURE.md`
- Contributing: `docs/CONTRIBUTING.md`
- Runbook: `docs/runbook.md`
- API docs: `docs/API.md`
- Workflow automation: `docs/WORKFLOW_AUTOMATION.md`
- Analytics setup: `docs/codex-analytics-setup.md`
- Design spec: `DESIGN.md`
