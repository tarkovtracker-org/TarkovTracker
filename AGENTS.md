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
- Brief `pnpm run brief --file <path>` (`--symbol <file:export>`, `--base <ref>`): consumers, docs,
  tests, and checks before editing; advisory, read its Uncertainty section

Prefer the single-file Vitest command from `package.json`; run the full suite only when executable
or test logic changes make it relevant.

## Validation

- Run the smallest relevant check before finishing and report what passed or failed. TypeScript
  changes: typecheck. Code changes: lint. Locale changes: `pnpm run i18n:check`. API gateway
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

- Implementation work authorizes committing and pushing in-scope topic-branch changes, opening or
  updating the PR, and running previews and smoke tests through the trusted workflows. Ready
  same-repository PRs get previews automatically after CI; post `/preview` only for forks or after
  `/preview stop` ([preview spec](docs/systems/previews.md)). Keep workflow access checks, artifact
  validation, and fork protections. Production deploys, destructive actions, and merges need
  explicit authorization.
- Fix small issues in files the change already touches; track larger unrelated work in an issue.
- Docs, translations, and formatting: self-review plus deterministic checks. Executable changes:
  one local `coderabbit review --base origin/<base> --agent --committed` (after `git fetch`) once
  the diff stabilizes, before opening the PR or marking it ready. Fix validated findings together;
  optional suggestions stay optional. If review is unavailable or rate-limited, note it in the PR
  and continue; never enable paid over-limit reviews without authorization.
- Push validated work when useful; batch fixes for one review round into one push when practical.
- Reuse reviews when a base update leaves the reviewed diff unchanged; verify the diff and assess
  integration with changed base code even after a conflict-free update. Rerun validation whose
  inputs changed. The `Main CI freshness` ruleset blocks merging a behind branch; update it
  (`gh pr update-branch <PR>`) and CI and applicable previews rerun on the new head. Request
  `@coderabbitai review` for substantial diff changes, hand-resolved conflicts, or unresolved
  integration risks (incremental reviews are off). Do not pause other merges for freshness.
- Codex only via `node scripts/codex-review/codex-review.mjs <PR> --request --wait-seconds 600`
  (omit `--request` to check status), only when CodeRabbit is rate-limited or for the final review
  of a change that needs independent review (below). Never post raw `@codex review`, repost, or
  bypass the guard; never run Codex reviews locally. Pending or unknown review is incomplete.
- Auth, billing, migrations, and database or Durable Object concurrency control (locks, claims,
  fencing) need one independent review before merge: Codex, another provider, or a human.
- Merge gate: required checks green, every review thread dispositioned (fixed, rejected with reason,
  or tracked issue), and the latest review covers the current PR diff. The PR body lists the
  validation commands and results.
- Production-readiness and security reviews are read-only; risk areas and severity live in
  `docs/code-review.md`.

## Docs

Code and executable config outrank this file; this file outranks `docs/`. Docs may lag, so verify
against code before changing behavior. Find the owning doc in `docs/README.md`, read only the needed
section (`grep -n '^#' <file>`), and link owners instead of restating them. Generated files,
Crowdin-owned locales, migration history, and `.cubic/` are not sources.
