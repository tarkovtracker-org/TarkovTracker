# TarkovTracker — Agent Instructions

This file is the repository contract for coding agents. Keep it compact: executable configuration
is authoritative for commands and style, while the system docs hold detailed behavior.

## Source of truth and scope

- Verify the current files, configuration, and worktree before making claims or edits.
- Keep changes narrow and durable; preserve existing workflow boundaries and user changes.
- If code changes a non-obvious system, update the matching section and invariants in
  `docs/SYSTEMS.md` in the same change.
- Trust executable config first (`package.json`, `nuxt.config.ts`, `tsconfig`, ESLint, Prettier), then
  this file, then tool-specific bridge files.

## Project shape

- Stack: Nuxt 4, Vue 3 Composition API, TypeScript strict, Pinia, Supabase, Tailwind CSS v4,
  Vitest, and Cloudflare Pages/Workers.
- SPA only: `ssr: false`; do not add SSR-only data fetching or middleware.
- `app/` contains the Nuxt application, features, stores, composables, shell, and server routes.
  Tarkov.dev proxy routes live under `app/server/api/tarkov/`.
- `supabase/` contains migrations and Edge Functions. `workers/` contains Cloudflare Workers,
  including the focused `api-gateway` modules. `scripts/precompute/` is the scheduled KV pipeline.
- `app/locales/en.json` is the translation source. Non-English locale files are Crowdin-owned.

## Commands

Install: `pnpm install` | Dev: `pnpm run dev` | Build: `pnpm run build` | Static: `pnpm run generate`

Test: `pnpm run test` | API gateway: `pnpm run test:api-gateway` | Supabase: `pnpm run supabase:check`

Lint: `pnpm run lint` | Blank lines: `pnpm run lint:blank-lines` | Typecheck: `pnpm run typecheck`

i18n: `pnpm run i18n:check` | OpenAPI: `pnpm run validate:openapi` | Dependencies: `pnpm run deps`

Use the single-file Vitest command from `package.json` for focused tests. Do not run the full suite
unless executable or test logic changes make it relevant.

## Required validation

- Run the smallest relevant check before finishing and report what passed or failed.
- TypeScript changes require typecheck; code changes require lint; locale changes require
  `pnpm run i18n:check`.
- API gateway changes also require `pnpm --filter api-gateway run types:check` and
  `pnpm --filter api-gateway exec wrangler deploy --config wrangler.toml --dry-run`.
- Formatting is enforced by the repository hook and CI `format:check`; do not run the broad format
  command unless the hook is bypassed.
- Mock Supabase and network calls in tests so they stay deterministic.

## Invariants

- Use Tailwind v4 utilities and theme tokens; components do not add `<style>`, SCSS, or scoped CSS.
  Use `@/` aliases rather than parent-relative imports.
- Add user-facing copy to `en.json` only, with snake_case keys and the existing `common.*` keys
  where appropriate. Missing translations use the English fallback.
- Game data comes from `json.tarkov.dev` through `/api/tarkov/*`; do not add the `api.tarkov.dev`
  GraphQL API. Preserve upstream `type` discriminators and do not restore synthetic `__typename`.
  Do not add new runtime dependencies on the removed task `alternatives` field.
- Internal modes are `pvp`, `pve`, and `seasonal`; Seasonal maps to upstream `pvp-season`. Keep
  `ACTIVE_SEASON` synchronized with the database functions and preserve Seasonal history.
- Keep secrets in runtime environment or platform secret stores. Use canonical environment names;
  never commit credentials, service-role keys, or generated secret-bearing files.
- API gateway routes authenticate and enforce quota before decoding or validating input. Validation
  errors retain rate-limit headers. Public progress clients send a 5–200 character `User-Agent`.
- Security-definer and service-role-only Supabase functions revoke `EXECUTE` from `PUBLIC`, `anon`,
  and `authenticated`, granting `service_role` explicitly where required.
- Never put bulk data rewrites in migrations. Ship schema separately and make reads tolerate missing
  rows. Production database inspection uses the read-only `scripts/prod-db` observer workflow.
- Overlay consumers enforce HTTPS and preserve the cache/adaptation/overlay ordering documented in
  `docs/SYSTEMS.md`. Task patches keep the raw upstream trader requirement shape before adaptation.
- API token renames update only the owner-scoped note; team owners disband through the confirmed
  owner function; account deletion jobs use the documented claim/fencing transactions.

## Documentation pointers

- Architecture and environment map: `docs/ARCHITECTURE.md`
- System specifications and invariants: `docs/SYSTEMS.md`
- API and rate limits: `docs/API.md`, `docs/RATE_LIMITING.md`
- Deployment and incidents: `docs/runbook.md`
- CI, hooks, releases, and review workflow: `docs/WORKFLOW_AUTOMATION.md`, `.github/CONTRIBUTING.md`
- Security, support, and conduct: `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`
- Deeper agent context: `docs/agent-context/summary/index.md`

## Review and release tasks

For production-readiness or security review requests, use the dedicated review/security workflow
when available and keep the review read-only. Before merging a reviewed change, resolve all
in-scope human and automated feedback and verify the final checks; do not mix unrelated fixes into
the requested change.
