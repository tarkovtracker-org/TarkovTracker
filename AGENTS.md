# TarkovTracker — Agent Instructions

Repository contract for coding agents. Executable config (`package.json`, `nuxt.config.ts`,
`tsconfig`, ESLint, Prettier) outranks this file; tool bridge files defer to it. Verify current
files and worktree state before claims or edits; keep changes narrow and preserve workflow
boundaries and user changes.

## Project map

- Nuxt 4 SPA (`ssr: false`; no SSR-only fetching or middleware), Vue 3 Composition API, strict
  TypeScript, Pinia, Supabase, Tailwind CSS v4, Vitest, Cloudflare Pages/Workers.
- `app/`: application, features, stores, composables, shell, server routes; Tarkov.dev proxy in
  `app/server/api/tarkov/`. `supabase/`: migrations, Edge Functions. `workers/api-gateway/`: public
  API Worker. `scripts/precompute/`: scheduled KV pipeline.
- `app/locales/en.json` is the translation source; other locale files are Crowdin-owned.

## Commands

- Install `pnpm install` | Dev `pnpm run dev` | Build `pnpm run build` | Static `pnpm run generate`
- Test `pnpm run test` | Gateway `pnpm run test:api-gateway` | Supabase `pnpm run supabase:check`
- Lint `pnpm run lint` | Blank lines `pnpm run lint:blank-lines` | Typecheck `pnpm run typecheck`
- Fallow `pnpm run lint:fallow` (`--base <ref>`, `--format json`; same command locally and in CI)
- i18n `pnpm run i18n:check` | OpenAPI `pnpm run validate:openapi` | Deps `pnpm run deps`

Prefer the single-file Vitest command from `package.json`; run the full suite only when executable
or test logic changes make it relevant.

## Validation

- Run the smallest relevant check before finishing and report what passed or failed. TypeScript
  changes: typecheck. Code changes: lint. Locale changes: `pnpm run i18n:check`. API gateway
  changes: also the checks in `workers/api-gateway/AGENTS.md`.
- Formatting is enforced by the hook and CI `format:check`; do not run the broad format command
  unless the hook was bypassed.
- Fix Fallow findings instead of suppressing them; keep new functions at cyclomatic 4 or less.
  Suppression rules: `docs/WORKFLOW_AUTOMATION.md#resolving-findings-instead-of-suppressing-them`.
- Mock Supabase and network calls in tests.

## Invariants

- Tailwind v4 utilities and theme tokens only; no `<style>`, SCSS, or scoped CSS. Use `@/` imports,
  not parent-relative paths.
- User-facing copy goes in `en.json` only, snake_case keys, reusing `common.*` where appropriate;
  missing translations use the English fallback.
- Game data comes only from `json.tarkov.dev` via `/api/tarkov/*`; never add the `api.tarkov.dev`
  GraphQL API. Keep upstream `type` discriminators; no synthetic `__typename`; no new runtime use
  of the removed task `alternatives` field.
- Modes are `pvp`, `pve`, `seasonal` (upstream `pvp-season`). Keep `ACTIVE_SEASON` synchronized
  with the database functions and preserve Seasonal history.
- Ordinary task acceptance uses the optional `active` flag. Active writes set
  `{complete:false, failed:false, active:true}`; completed, failed, and neutral writes set
  `active:false`. Missing `active` remains unknown: do not backfill ambiguous rows or mark
  automatically unlocked successors active. Legacy prerequisite fallback is documented in
  `docs/SYSTEMS.md` §2.
- Secrets stay in runtime env or platform secret stores under canonical names; never commit
  credentials, service-role keys, or generated secret-bearing files.
- Overlay consumers enforce HTTPS and preserve the cache/adaptation/overlay ordering in
  `docs/SYSTEMS.md` §1, §3–§4; task patches keep the raw upstream trader requirement shape
  before adaptation.
- Applied/shared migrations are immutable. Never run remote migration repair, reset, or squash as
  routine cleanup. Inspect production only through the read-only `scripts/prod-db` observer.

## Scoped rules — read before editing

- `supabase/**`, SQL functions, account/team/token lifecycle, or production DB work:
  `supabase/AGENTS.md`.
- `workers/api-gateway/**`: `workers/api-gateway/AGENTS.md`.
- When code changes a non-obvious system, update its section and invariants in `docs/SYSTEMS.md`
  in the same change.

## Review

- Docs, translations, mechanical formatting: self-review plus deterministic checks. Routine
  executable changes: Codex PR review. Substantial changes (public contracts, persisted state,
  cross-module behavior, auth, billing, migrations, concurrency): also one local CodeRabbit review
  of the stabilized branch diff. Auth, billing, migrations, and concurrency require independent
  review; another provider or a human substitutes if needed. Unavailable or rate-limited review is
  recorded as incomplete, without retry loops.
- Record the commit, dirty worktree state, commands, and results in the PR summary. Rerun,
  batching, and reviewer-rollout rules: `docs/WORKFLOW_AUTOMATION.md#agent-validation-and-review`.
- Production-readiness and security review requests use the dedicated review/security workflow
  when available and stay read-only. Before merging, resolve all in-scope human and automated
  feedback and verify final checks; do not mix in unrelated fixes.

## Docs — open only the section the task needs

Find the relevant heading first (`grep -n '^#' <file>`; `docs/SYSTEMS.md` alone is ~2,300 lines)
and read only that section. Search generated files, translations, migration history, `.cubic/`, and
archives only when the task requires it.
`docs/ARCHITECTURE.md` (environment map), `docs/SYSTEMS.md` (systems and invariants),
`docs/API.md`, `docs/RATE_LIMITING.md`, `docs/runbook.md` (deploys, migrations, incidents),
`docs/WORKFLOW_AUTOMATION.md` and `.github/CONTRIBUTING.md` (CI, hooks, releases, review),
`SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, optional orientation in
`docs/agent-context/summary/index.md`.
