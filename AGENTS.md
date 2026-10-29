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
  `app/server/api/tarkov/`. `supabase/`: migrations, Edge Functions. `workers/contract-tests/`:
  consumer integration with the separately owned public API Worker. `scripts/precompute/`: scheduled KV pipeline.
- `app/locales/en.json` is the translation source; other locale files are Crowdin-owned.
- Shared pure progress rules are owned by `tarkovtracker-org/TarkovTracker-API` and consumed here
  as `@tarkovtracker/progress-contracts` from an immutable release. Ownership: `docs/api-ownership.md`.

## Commands

- Install `pnpm install` | Dev `pnpm run dev` | Build `pnpm run build` | Static `pnpm run generate`
- Test `pnpm run test` | Supabase `pnpm run supabase:check`
- Contract pins `pnpm run check:progress-contracts` | Versioned API parity `pnpm run verify:api-parity`
- Lint `pnpm run lint` | Blank lines `pnpm run lint:blank-lines` | Typecheck `pnpm run typecheck`
- Fallow `pnpm run lint:fallow` (`--base <ref>`, `--format json`; same command locally and in CI)
- i18n `pnpm run i18n:check`
- Brief `pnpm run brief --file <path>` (`--symbol <file:export>`, `--base <ref>`): consumers, docs,
  tests, and checks before editing; advisory, read its Uncertainty section

Vitest auto-selects its failures-only `agent` reporter
under coding agents (`AI_AGENT=<name>` opts others in; `--reporter=default` restores per-file
output). For `test:workflow`, set `NODE_OPTIONS=--test-reporter=dot`; failures still print in full.

## Validation

- TypeScript changes: typecheck. Code changes: lint. Locale changes: `pnpm run i18n:check`. External API integration
  changes: also the checks in `workers/contract-tests/AGENTS.md`; public API runtime changes belong
  in `tarkovtracker-org/TarkovTracker-API`.
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
- `workers/contract-tests/**`: `workers/contract-tests/AGENTS.md`.
- When a change alters documented behavior or invariants, update the owning doc in the same change.

## Workflow and review

- Open, ready same-repository PRs targeting `main` get previews automatically after CI; post
  `/preview` only for forks or after `/preview stop` ([preview spec](docs/systems/previews.md)).
  Keep workflow access checks, artifact validation, and fork protections.
- Translations are reviewed like docs. The local CodeRabbit review for executable changes is
  `coderabbit review --base origin/<base> --agent --committed` (after `git fetch`); skip it when
  unavailable or rate-limited.
- `main` merges only through the native merge queue, which builds each entry on current main; do
  not update a behind branch merely to enqueue it. Review Admission verifies the immutable PR head
  and resolved findings; sensitive changes also need exact-head approval. When the merge class
  below allows merging, run `gh pr merge <PR> --auto --match-head-commit <reviewed-head>` right
  after pushing the reviewed head and end the turn; GitHub enqueues it once the required checks
  pass. If no provider or collaborator review will cover that head, post the self-admission
  below before ending the turn so `Review Admission` can pass. Report `QUEUED` if GitHub queued it
  at once, otherwise `AUTO-MERGE ON`. High-risk PRs stop at `READY` with the reason instead. Actions owns integration/merge. State, lifecycle and
  rollback: `docs/merge-queue-rollout.md`.
- Review bots (CodeRabbit, cubic, Codex) are best-effort: use them when available, never wait on
  one that is unavailable, rate-limited, skipped, or quiet past its normal latency. Fix valid
  findings they post. Request `@coderabbitai review` only for substantial new diff or
  hand-resolved conflicts (incremental reviews are off).
- Codex only via `node scripts/codex-review/codex-review.mjs <PR> --request --wait-seconds 600`
  (omit `--request` to check status); never post raw `@codex review`, repost, or run it locally.
  It is optional: an unavailable or usage-limited Codex is noted, not awaited.
- When no provider review covers the exact head, an agent with merge authority and repo admin
  access self-admits after its own review by posting `/approve <40-char head SHA>` alone in a
  comment ([approval commands](docs/merge-queue-rollout.md#approval-commands)). From an admin that
  one comment is both the review attestation and the sensitive-change approval; CI and preview
  stay gated by the required checks, so it need not wait for them. Without admin access, a
  non-author write collaborator's exact-head approving GitHub review still admits; their `/approve`
  comment covers only sensitive-change approval. Repeat after any new head.
  Auth, migrations, RLS and concurrency changes take this route; verify them with
  `pnpm run supabase:check` or the owning tests instead of waiting for a human.
- Merge class: a green PR may merge without asking unless it is high-risk. High-risk (needs the
  user's explicit "merge" naming it): destructive or data-losing migrations (drops, type
  narrowing, bulk rewrites); production data scripts, backfills or migration repair; billing,
  payments or entitlements; secrets or credentials; DNS, hosting or Worker trigger config;
  weakening a security control, check, or ruleset; breaking public API or data-format contracts;
  and major (or `0.x` cross-minor) upgrades of auth, database or billing dependencies. Otherwise
  merge; report high-risk PRs `READY` with the reason.
- The PR body lists the validation commands and results.
- Review risk areas and severity live in `docs/code-review.md`.

## Docs

Code and executable config outrank this file; this file outranks `docs/`. Docs may lag, so verify
against code before changing behavior. Find the owning doc in `docs/README.md` and link owners
instead of restating them. Generated files, Crowdin-owned locales, migration history, and `.cubic/`
are not sources.
