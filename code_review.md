# TarkovTracker — Code Review Policy

Repo-specific review policy loaded by the `production-readiness-review` skill.
Its validation commands and risk areas override the skill's defaults.

## Table of Contents

- [Validation Commands](#validation-commands)
- [Mandatory Checks](#mandatory-checks)
- [Risk Areas](#risk-areas)
- [Severity Calibration](#severity-calibration)
- [Deployment And Rollback](#deployment-and-rollback)

## Validation Commands

Run these in order. All must pass before a READY verdict.

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run i18n:check
pnpm run validate:openapi
```

If the change touches `workers/api-gateway`, also run:

```bash
pnpm run test:api-gateway
```

If the change touches `supabase/functions/`, note that edge functions run on
Deno and are not covered by `pnpm run test`. Inspect them manually for Deno API
compatibility.

## Mandatory Checks

Hard rules the reviewer must verify for every diff:

- No SSR-only features (`useAsyncData` SSR options, server-only middleware) — this
  is a SPA-only project (`ssr: false`).
- No parent-relative imports — all imports use `@/` aliases (ESLint enforces this).
- No hex color values in templates — use Tailwind theme tokens.
- No `<style>` blocks, SCSS, or scoped CSS — Tailwind v4 only.
- Only `app/locales/en.json` edited for locale changes — non-English files are
  Crowdin-owned. Never copy English into non-English locales as a fallback.
- No secrets or credentials in code or config — use `useRuntimeConfig()` for
  env-driven values.
- No new runtime dependencies without justification that existing deps are
  insufficient.
- No destructive git commands in CI or scripts.

## Risk Areas

### Database Migrations (Supabase)

- **Where:** `supabase/migrations/`
- **Check:** Forward compatibility — old frontend code runs against the new schema
  during rolling deploy. No destructive `ALTER TABLE` without a staged rename
  (add new column → backfill → dual-read/dual-write → drop old). No `NOT NULL`
  columns without a default or backfill. RLS policy changes must not widen access
  unintentionally. RPC additions must not bypass RLS. Test rollback if a down
  migration exists; if none, note that the migration is irreversible.
- **Recent context:** `add_api_usage_daily`, `add_user_preferences_tasks_require_trader_levels`,
  `add_merge_progress_rpc` — verify these don't break existing callers.

### Cloudflare Workers / Durable Objects

- **Where:** `workers/api-gateway/src/index.ts` (rate limiter DO), `workers/tarkov-precompute/`
- **Check:** DO alarm lifecycle — no orphaned alarms, no double-fire without
  idempotency, no alarm leaks on cleanup. The current branch (`fix-do-alarm-overhead`)
  is specifically addressing alarm overhead — verify that lazy expiration does not
  leave stale rate-limit state. DO storage transactions are single-writer; no
  cross-DO atomicity assumptions. KV eventual consistency — reads after writes may
  be stale. CPU limits on Workers Free tier rule out scheduled Workers for
  precompute (hence the GitHub Actions workflow).

### KV Precompute Entries

- **Where:** `scripts/precompute/`, `app/server/utils/edgeCache.ts`, request
  handlers reading the `TARKOV_DATA` KV namespace
- **Check:** Entry shape compatibility — the precompute script and the request
  handlers must agree on key shape and payload schema. Handlers must fall back to
  the per-colo Cache API when the KV binding or a specific entry is absent. A
  schema change in the precompute script must be deployed before the handler
  change that depends on it, or the handler must tolerate both shapes.

### External API Proxy (tarkov.dev)

- **Where:** `app/server/api/tarkov/`
- **Check:** Timeout handling, error propagation to the client, cache headers,
  rate limiting via the api-gateway. No unproxied external calls from the client.
  No secrets in proxy headers. CORS preflight caching is throttled — verify
  changes to proxy headers don't invalidate the cache incorrectly.

### Auth And Realtime (Supabase)

- **Where:** `app/plugins/supabase.client.ts`, stores using auth state
  (`useTarkovStore`, `useProgressStore`)
- **Check:** Session lifecycle — token refresh, session restore on reload.
  Realtime subscription cleanup on component unmount (no subscription leaks).
  RLS policy changes in migrations. No client-side service-role keys. Auth state
  changes must not reset unrelated store state.

### Locale Fallback

- **Where:** `app/locales/`, `app/i18n.config.ts`
- **Check:** Fallback locale is `en`. Missing non-English keys render English
  automatically — do not copy English into non-English files. Key names are
  snake_case (`pnpm run i18n:check` is fatal for violations). `t('key', 'Fallback')`
  calls must have fallback strings. New user-facing strings must add the key to
  `en.json` only; Crowdin handles propagation.

### Environment Variables

- **Where:** `nuxt.config.ts`, `docs/ARCHITECTURE.md` env var map
- **Check:** One canonical env var name per concept. `NUXT_PUBLIC_*` for
  browser-exposed, `NUXT_*` for server-only. Platform-native names for Supabase
  Edge Functions (`SUPABASE_*`, `STRIPE_*`, `DISCORD_*`). No legacy aliases or
  fallback chains. If an env var is renamed, source, docs, examples, CI/deploy
  references, and tests must all update in the same change.

### Pinia Store State

- **Where:** `app/stores/`
- **Check:** `useTarkovStore` is the core state. Changes to its shape must not
  break `useMetadataStore`, `useProgressStore`, or `usePreferencesStore`.
  Persisted state (`pinia-plugin-persistedstate`) must remain backward-compatible
  — a stored shape change can corrupt existing user sessions. Avoid adding new
  global state unless necessary.

## Severity Calibration

- **P0:** User progress or team data loss in Supabase, auth bypass, service-role
  key exposure to client, DO storage corruption, broken deployment (site won't
  load), irreversible migration that corrupts existing rows.
- **P1:** Broken feature for a user segment, migration that breaks rolling deploy,
  realtime subscription leak causing stale state, KV key shape mismatch between
  precompute and handler, RLS policy widening access, persisted store shape
  change that corrupts sessions.
- **P2:** Missing test coverage for a risky change, silent error swallow, missing
  fallback string in a new locale key, performance regression on a hot path
  (dashboard load, task list render), N+1 query in a loop.
- **P3:** Minor naming, non-blocking cleanup, optional test for an edge case,
  locale key naming inconsistency (snake_case violation caught by i18n:check is
  P1 since it blocks CI).

## Deployment And Rollback

- **Platform:** Cloudflare Pages (frontend), Cloudflare Workers (api-gateway,
  precompute), Supabase (database, auth, realtime, edge functions).
- **Frontend rollback:** Pages deployments can be rolled back via the Cloudflare
  dashboard (Pages project → Deployments → target production deployment →
  Rollback to this deployment). Wrangler does not provide a CLI rollback for
  Pages.
- **Workers rollback:** Workers versions can be rolled back via
  `wrangler rollback [VERSION_ID]`. Omitting the version ID selects the
  preceding version interactively.
- **Supabase rollback:** Migrations may not be reversible. Treat migration-only
  PRs as high-risk and require a rollback plan in the PR description. If a down
  migration exists, verify it actually reverses the up migration.
- **Rolling compatibility:** Old frontend code may run against new Supabase
  schema for minutes during deploy. Migrations must be forward-compatible (old
  code reads new schema without error).
- **Env vars:** New env vars must be set in Cloudflare/Supabase before the code
  that uses them deploys. Note any new env vars in the PR description and verify
  they are documented in `docs/ARCHITECTURE.md`.
- **Precompute ordering:** If a precompute payload schema changes, the
  precompute workflow must run and populate KV before the handler change deploys.
  Otherwise handlers must tolerate both old and new payload shapes.
