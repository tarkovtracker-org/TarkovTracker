# TarkovTracker — Agent Instructions

Repository contract for coding agents. Executable config (`package.json`, `nuxt.config.ts`,
`tsconfig`, ESLint, Prettier) outranks this file; tool bridge files defer to it. Cloud agents and
contributors may not load shared global rules, so two baselines stay here: preserve existing
worktree changes, and get explicit authorization before production deploys and destructive actions.
Merges follow the merge class below.

## Project map

- Nuxt 4 with prerendered public documents and client-rendered trackers/accounts (no server-side personalized fetching), Vue 3 Composition API, strict
  TypeScript, Pinia, Supabase, Tailwind CSS v4, Vitest, Cloudflare Pages/Workers.
- `app/`: application, features, stores, composables, shell, server routes; Tarkov.dev proxy in
  `app/server/api/tarkov/`. `supabase/`: migrations, Edge Functions. `workers/api-gateway/`: public
  API Worker. `scripts/precompute/`: scheduled KV pipeline.
- `app/locales/en.json` is the translation source; other locale files are Crowdin-owned.
- `workers/api-gateway/progress-contracts/`: versioned runtime-free rules shared by browser, Nitro and
  gateway. Ownership and downstream updates: `docs/api-ownership.md`.

## Commands

- Install `pnpm install` | Dev `pnpm run dev` | Build `pnpm run build` | Static `pnpm run generate`
- Test `pnpm run test` | Gateway `pnpm run test:api-gateway` | Supabase `pnpm run supabase:check`
- Contracts `pnpm run test:progress-contracts` | Standalone API `pnpm run verify:api-standalone`
- Lint `pnpm run lint` | Blank lines `pnpm run lint:blank-lines` | Typecheck `pnpm run typecheck`
- Fallow `pnpm run lint:fallow` (`--base <ref>`, `--format json`; same command locally and in CI)
- i18n `pnpm run i18n:check` | OpenAPI `pnpm run validate:openapi`
- Brief `pnpm run brief --file <path>` (`--symbol <file:export>`, `--base <ref>`): consumers, docs,
  tests, and checks before editing; advisory, read its Uncertainty section

Vitest auto-selects its failures-only `agent` reporter
under coding agents (`AI_AGENT=<name>` opts others in; `--reporter=default` restores per-file
output). For `test:workflow`, set `NODE_OPTIONS=--test-reporter=dot`; failures still print in full.

## Validation

- TypeScript changes: typecheck. Code changes: lint. Locale changes: `pnpm run i18n:check`. API gateway
  changes: also the checks in `workers/api-gateway/AGENTS.md`.
- Formatting is enforced by the hook and CI `format:check`; do not run the broad format command
  unless the hook was bypassed.
- Fix Fallow findings instead of suppressing them; keep new functions at cyclomatic 4 or less
  ([suppression rules](docs/workflow-automation.md#resolving-findings-instead-of-suppressing-them)).
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
- Secrets stay in runtime env or platform secret stores under canonical names; never commit
  credentials, service-role keys, or generated secret-bearing files.
- Overlay consumers enforce HTTPS and preserve the cache/adaptation/overlay ordering in
  `docs/systems/`; task patches keep the raw upstream trader requirement shape before adaptation.
- Applied/shared migrations are immutable. Never run remote migration repair, reset, or squash as
  routine cleanup. Prefer the read-only `scripts/ops/prod-db` observer for production inspection.
  Agents may collect identity/history and bounded read-only catalog evidence through authenticated
  Supabase MCP and CLI dry-runs under `docs/runbook.md#database-migrations`; never infer write authority.

## Scoped rules — read before editing

- `supabase/**`, SQL functions, account/team/token lifecycle, or production DB work:
  `supabase/AGENTS.md`.
- `workers/api-gateway/**`: `workers/api-gateway/AGENTS.md`.
- When a change alters documented behavior or invariants, update the owning doc in the same change.

## Workflow and review

- Open, ready same-repository PRs targeting `main` get previews automatically after CI; post
  `/preview` only for forks or after `/preview stop` ([preview spec](docs/systems/previews.md)).
  Keep workflow access checks, artifact validation, and fork protections.
- Translations are reviewed like docs. The local CodeRabbit review for executable changes is
  `coderabbit review --base origin/<base> --agent --committed` (after `git fetch`).
- The `Main CI freshness` ruleset blocks merging a behind branch; update it
  (`gh pr update-branch <PR>`) and CI and applicable previews rerun on the new head. Request
  `@coderabbitai review` for substantial diff changes, hand-resolved conflicts, or unresolved
  integration risks (incremental reviews are off). Do not pause other merges for freshness.
- Codex only via `node scripts/codex-review/codex-review.mjs <PR> --request --wait-seconds 600`
  (omit `--request` to check status), only when CodeRabbit is rate-limited or for the final review
  of a change that needs independent review (below). Never post raw `@codex review`, repost, or
  bypass the guard; never run Codex reviews locally. Pending or unknown review is incomplete.
- Auth, billing, migrations, and database or Durable Object concurrency control (locks, claims,
  fencing) need one independent review before merge: Codex, another provider, or a human.
- Merge class: a green, low-risk PR may merge without asking when every change is docs, tests,
  CI-only changes that keep every security control, patch/minor dependency updates outside
  `auth-and-billing`, lockfile-only refreshes, or small fixes with no confirm-required surface.
  Confirm-required (an explicit "merge" naming it, even when green): migrations or schema/RLS;
  auth, sessions, permissions, or access checks; billing, payments, or entitlements (Stripe,
  Supabase clients); secrets or credentials; major upgrades; production data scripts; deploy,
  infra, DNS, or Worker trigger config; weakening any security control, check, or ruleset; and
  public API or data-format contracts. Otherwise report it `READY` with the reason.
- The PR body lists the validation commands and results.
- Review risk areas and severity live in `docs/code-review.md`.

## Docs

Code and executable config outrank this file; this file outranks `docs/`. Docs may lag, so verify
against code before changing behavior. Find the owning doc in `docs/README.md` and link owners
instead of restating them. Generated files, Crowdin-owned locales, migration history, and `.cubic/`
are not sources.
