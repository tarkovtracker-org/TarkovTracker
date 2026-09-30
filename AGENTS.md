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
  Suppression rules live in the workflow-automation doc (see `docs/README.md`).
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
- Overlay consumers enforce HTTPS and preserve the cache/adaptation/overlay ordering in the systems spec (`docs/systems/`); task patches keep the raw upstream trader requirement shape before adaptation.
- Applied/shared migrations are immutable. Never run remote migration repair, reset, or squash as
  routine cleanup. Inspect production only through the read-only `scripts/ops/prod-db` observer.

## Scoped rules — read before editing

- `supabase/**`, SQL functions, account/team/token lifecycle, or production DB work:
  `supabase/AGENTS.md`.
- `workers/api-gateway/**`: `workers/api-gateway/AGENTS.md`.
- When a change alters documented behavior or invariants, update the owning doc in the same change (behavior only — link code, don't paste it).

## Preview authorization

Implementation and production-readiness work authorize agents to commit and push in-scope
feature-branch changes, post `/preview`, deploy previews through the trusted workflow, and run
preview smoke tests without asking the user again. Preserve workflow access checks, artifact
validation, and fork environment protections. Production deployments, destructive actions, and
merges require separate explicit authorization.

## Review

- Docs, translations, and mechanical formatting require self-review and deterministic checks.
  Executable changes receive one local CodeRabbit review of the stabilized branch diff before
  pushing when available. Compare against the actual PR base using a freshly fetched remote ref
  (`coderabbit review --base origin/<base> --agent --committed`). Fix validated findings together;
  do not treat optional suggestions as mandatory. Never run Codex reviews locally.
- Commit locally as often as useful; push stabilized batches after relevant checks. Address a
  whole PR review round before the next correction push, rather than pushing per finding.
  Reuse review evidence for unchanged inputs; rerun only for substantial new behavior or unresolved
  significant findings. Update from the PR base when conflicts or integration validation require it.
- Rate limits do not stop implementation, commits, or useful validated batch pushes. Record missing
  review as incomplete and enforce required review before merge; do not retry in a loop or enable
  paid over-limit reviews without authorization. CLI and PR reviews have separate allowances.
- Automatic Codex reviews should be disabled in the dashboard; repository text does not verify
  dashboard state. Request Codex only when CodeRabbit PR and CLI reviews are rate-limited, or for
  the final pre-merge review of a risky change. Use only
  `node scripts/codex-review/codex-review.mjs <PR> --request --wait-seconds 600` when posting is authorized;
  never post raw `@codex review` comments. For read-only status/waiting, omit `--request`.
  Pending, running, unknown, or timed-out reviews remain incomplete; never bypass the guard or
  repost to speed up a review. Completion does not mean findings are resolved.
- CodeRabbit automatic incremental PR reviews are disabled in `.coderabbit.yaml`. After substantial
  follow-up changes, request `@coderabbitai review` before merge unless recorded local or independent
  review covers the final changes. Record the reviewed base and head and assess any later delta;
  an earlier green review alone does not cover new changes. Auth, billing, migrations, and concurrency
  require independent review before merge from Codex on request, another provider, or a human.
- Record the commit, dirty worktree state, commands, and results in the PR summary. Rerun,
  batching, and reviewer-rollout rules live in the workflow-automation doc (see `docs/README.md`).
- Production-readiness and security review requests use the dedicated review/security workflow
  when available and stay read-only; repo risk areas and severity live in `docs/code-review.md`.
  Before merging, resolve all in-scope human and automated feedback and verify final checks; do
  not mix in unrelated fixes.

## Docs — code is truth, docs are orientation

Hierarchy: executable config and source code outrank this file; this file outranks `docs/`.
Docs explain behavior in plain English for humans and agents and may lag — verify against code
before changing behavior.

- One fact, one owner: link the owning file, never restate code, config, or another doc.
- `docs/README.md` is the index; find the owning doc there, then read only the needed section
  (`grep -n '^#' <file>`).
- New docs go flat in `docs/` as `kebab-case.md`. Nest only for 3+ docs or non-`.md` assets.
- Generated files, Crowdin-owned locales, migration history, and `.cubic/` are not sources —
  search them only when the task requires it.
