# Repository Guidelines

## Overview

- Project: Nuxt 4 SPA for TarkovTracker.
- Node >=24.12.0, npm >=11.6.2 (see `package.json` engines).
- Package manager: npm (`packageManager` is `npm@11.7.0`).
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
- Prettier targets `app/**/*.{js,ts,tsx,vue,json,json5,css,scss,md}`.
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
- Provide safe fallback strings where appropriate.
- Keep locale keys stable to avoid churn.
- Avoid hard-coded user-facing strings in components.

## Miscellaneous

- Static assets go in `public/`.
- Keep secrets out of the repo; use `useRuntimeConfig()`.
- The app is SPA-only; validate changes in the browser.
- Respect existing lint warnings; do not introduce new ones.
- Keep commits small and scoped when asked to commit.

## Agent Rules

- **No over-thinking in responses**. Sacrifice explanatory language for brevity—layman's terms only when necessary.
- **Be concise**. Direct responses only: "Fixed X by changing Y to Z." Minimize explanation unless asked. Use file references for context.
- **No comments** unless explicitly requested. Comments are token overhead.
- **Run `npm run format` once** before leaving code. It handles both formatting and linting. Only show errors, skip success output.
- **Own all issues**. Fix formatting, linting, and pre-existing bugs without being asked. Don't deflect with "these are from earlier changes."
- **Self-assess code**. Don't ask "what does this do?" Read and understand it. Only clarify ambiguous intent ("Is this supposed to do X or Y?").
- **Ask before acting on complex requests**. Clarify ambiguous or multi-interpretation tasks before proceeding—it's better to ask one question than redo work.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions to answer, if any.
