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
- production database observer commands, credentials, or migration preflight behavior
- deprecated patterns that agents must avoid
- behavior of a system documented in `docs/SYSTEMS.md` (Tarkov.dev integration, data fetching
  pipeline, multi-layer caching, overlay corrections, precompute workflow, Tarkov.dev profile
  import)
- community health policy: security reporting (`SECURITY.md`), support routing
  (`SUPPORT.md`), or code of conduct (`CODE_OF_CONDUCT.md`)

If this file conflicts with executable config (eslint, prettier, tsconfig, package.json), trust the executable config, then update this file before finishing.

### System spec sync (`docs/SYSTEMS.md`)

`docs/SYSTEMS.md` is the plain-language spec for the non-obvious systems. It is written so a human
can read it and an agent can verify any claim against the code. Each system section lists
**invariants** the code must hold.

- When you change a system documented there, update the matching section in the same PR. Do not let
  the spec and the code drift.
- If a claim in `SYSTEMS.md` is wrong, fix the doc. If an invariant is violated by the code, fix the
  code. The code is the source of truth; the doc is the explanation of it.
- Do not duplicate system behavior in code comments. Put the explanation in `SYSTEMS.md` and keep
  code comments reserved for genuinely non-obvious local decisions, per the "No comments" rule
  below. This is the balance between "no comments in files" (drift/stale-comment risk) and
  "document how it works" (context for humans and agents).
- When adding a new non-obvious system, add a section to `SYSTEMS.md` with a summary, a diagram, a
  step-by-step flow, the implementing files, and the invariants.

## Source-of-Truth Priority

1. Executable config (eslint.config.mjs, .prettierrc, tsconfig, nuxt.config.ts, package.json scripts)
2. This file (AGENTS.md)
3. Tool-specific bridge files (.github/copilot-instructions.md, .claude/CLAUDE.md)

## Project Snapshot

- **Stack:** Nuxt 4 SPA (`ssr: false`), Vue 3 Composition API, TypeScript strict, Pinia, Supabase, Tailwind CSS v4, Vitest, Cloudflare Pages/Workers.
- **Runtime:** Node >=24.19.0, packageManager `pnpm@11.14.0` (engines allow `pnpm >=10.34.5 <12`).
- **Backend:** Supabase (auth, database, realtime). API proxy via Nitro server routes.
- **Deployment:** Cloudflare Pages/Workers for the frontend and `api-gateway`; the Supabase GitHub
  integration applies DB migrations and deploys Edge Functions. All three run automatically on merge
  to `main` — see the Deployment section of `docs/runbook.md`. The Pages build emits a static SPA
  shell and routes only `/api/*` plus `/overlay/*` through Pages Functions.

## Project Map

- `app/` — Nuxt 4 source. Pages, components, features, stores, composables, plugins, server routes, locales, shell.
- `app/features/` — Domain slices: `admin`, `dashboard`, `drawer`, `hideout`, `maps`, `neededitems`, `profile`, `settings`, `storyline`, `streamer-tools`, `supporter`, `tasks`, `team`.
- `app/server/api/` — Nitro server routes. `app/server/api/tarkov/` for tarkov.dev proxy.
- `app/shell/` — App chrome (AppBar, NavDrawer, AppFooter).
- `app/stores/` — Pinia stores. Core state: `useTarkovStore` with `useMetadataStore`, `useProgressStore`, `usePreferencesStore`.
- `app/locales/` — JSON locale files. `en.json` is source; non-English files are Crowdin-owned.
- `supabase/` — `config.toml`, `functions/` (Deno edge functions), `migrations/`.
- `workers/` — Cloudflare Workers. The `api-gateway` entrypoint delegates routing,
  authentication, rate limiting, and response construction to focused modules in `src/`.
- `scripts/precompute/` — standalone precompute of heavy tasks-core payloads into the `TARKOV_DATA` KV namespace, run by the scheduled GitHub Actions workflow `.github/workflows/precompute-tarkov-data.yml` (the account's Workers Free tier CPU limit rules out a scheduled Worker). Reuses the `app/server/utils` pipeline via tsx tsconfig paths; request handlers read the entries via `edgeCache`'s `precomputed` option and fall back to the per-colo Cache API when the binding or entry is absent.
- `docs/` — Project documentation.
- `public/` — Static assets.
- Config: `nuxt.config.ts`, `app.config.ts`, `eslint.config.mjs`, `.prettierrc`, `commitlint.config.js`.

## Commands

Install: `pnpm install` | Worktree bootstrap: `bash scripts/setup-worktree.sh` | Dev: `pnpm run dev` (localhost:3000) | Build: `pnpm run build` | Preview: `pnpm run preview` | Static: `pnpm run generate`

Test: `pnpm run test` | Watch: `pnpm run test:watch` | Coverage: `pnpm run test:coverage` | API gateway: `pnpm run test:api-gateway` | Supabase DB: `pnpm run supabase:check` (reset + pgTAP + lint) | Production observer: `pnpm run prod-db:test` | Single file: `pnpm exec vitest run path/to/file.test.ts` | By name: `pnpm exec vitest run -t "pattern"`

API gateway bindings: `pnpm --filter api-gateway run types` regenerates the checked-in
`workers/api-gateway/worker-configuration.d.ts`; `pnpm --filter api-gateway run types:check` detects
configuration or dashboard-secret declaration drift.

Lint: `pnpm run lint` (zero warnings) | Fallow audit: `pnpm run lint:fallow` (changed-file dead code, duplication, and complexity gate) | Blank-line lint: `pnpm run lint:blank-lines` | Fix: `pnpm run lint:fix` | Format: `pnpm run format` (Prettier + ESLint + blank-line fix) | Typecheck: `pnpm run typecheck`

i18n check: `pnpm run i18n:check` | Supabase types: `pnpm run supabase:types` | OpenAPI validate: `pnpm run validate:openapi` | Deps: `pnpm run deps` | KV precompute: `pnpm run precompute:tarkov` (needs Cloudflare env vars; normally run by CI)

## Validation Policy

Before finishing any agent task:

- Run the smallest relevant validation (typecheck for TS changes, lint for code changes, i18n:check for locale changes).
- `pnpm run lint:blank-lines` checks supported source and configuration files while preserving Markdown, generated files, and blank lines inside multiline strings/comments.
- State what validation was run and what passed/failed.
- API gateway changes also require `pnpm --filter api-gateway run types:check` and
  `pnpm --filter api-gateway exec wrangler deploy --config wrangler.toml --dry-run`.
- Do not run the full test suite unless you changed test logic or executable code that could break tests.
- Respect existing lint warnings; do not introduce new ones.
- Formatting is handled by the pre-commit hook. Do not run `pnpm run format` manually unless the hook is bypassed. CI `format:check` is the gate.
- Coverage, bundle analysis, JUnit test results, and shard configuration are handled by CI — see
  `docs/WORKFLOW_AUTOMATION.md`. CI shards report only imported files for merging; local
  `pnpm run test:coverage` remains unsharded and measures the full app source denominator.
- Lighthouse runs once per selected route per Lighthouse job on UI/performance PRs. Use repeated local or manual runs to investigate a borderline failure instead of increasing every job's collection count.

## Production Readiness Review

When asked to "review for production readiness", "deep review", "is this safe to merge", or similar:

- Invoke the `production-readiness-review` skill if available. It performs a read-only code and behavior review, not a CI/merge-status check.
- The skill loads `code_review.md` at the repo root for repo-specific validation commands and risk areas. This file is the authoritative review policy for this repo.
- The skill is read-only: it does not edit, commit, push, approve, or merge. Findings are handed off to a separate fix task.
- Do NOT substitute `coderabbit-code-review` or `pr-loop` for a production-readiness review. Those delegate to external bot reviews or CI status; this skill inspects the code directly.
- For a dedicated security audit of the diff, use `security-diff-scan` instead. For a fix-and-loop workflow, use `pr-loop` after the review.

## Hard Rules

- **SPA-only.** SSR is disabled. Do not use SSR-only features (`useAsyncData` SSR options, server-only middleware, etc.).
- **Tailwind v4 only.** No `<style>` blocks, SCSS, or scoped CSS in components. Use Tailwind theme for colors — no hex values in templates.
- **No parent-relative imports.** Use `@/` aliases. ESLint enforces this.
- **Only edit `app/locales/en.json`.** Non-English locale files are Crowdin-owned. Never copy English into non-English locales as a "fallback."
- **Keep secrets out of the repo.** Use `useRuntimeConfig()` for env-driven values.
- **No destructive git commands** (`git restore`, `git checkout --`, `git reset`, `git clean`, force-push) without explicit user approval in the current conversation.
- **No runtime dependency additions** without explaining why existing deps are insufficient.
- **Game data comes from `json.tarkov.dev` via the `/api/tarkov/*` server proxy.** Do not add usage of the `api.tarkov.dev` GraphQL API. Task objectives and prestige conditions are discriminated by the upstream `type` field; the synthetic `__typename` discriminator was removed — do not reintroduce it.
- **Do not add new runtime dependencies on Tarkov task `alternatives`.** Upstream removed the field; branch relationships must be compiled from task-status failure conditions. Existing uses remain until the shared progress engine replaces them.
- **Revoke function EXECUTE from `PUBLIC, anon, authenticated`, never `PUBLIC` alone.** Supabase
  ships `ALTER DEFAULT PRIVILEGES` on schema `public` that grants `EXECUTE` on every new function to
  `anon`, `authenticated`, and `service_role`. `REVOKE ALL ON FUNCTION ... FROM PUBLIC` only drops
  the implicit `PUBLIC` grant and leaves those explicit role grants in place, which trips advisor
  lint 0028 on `SECURITY DEFINER` functions. Trigger functions and service-role-only helpers must
  name all three roles. Grant back to `service_role` explicitly when the service role needs it.
- **Never put a bulk data rewrite in a migration.** Ship schema separately, make reads tolerate
  missing rows. See the Database Migrations section of `docs/runbook.md`.
- **Keep changes scoped** to the requested task. Prefer small, reviewable diffs.

## Coding Conventions

Formatting is enforced by Prettier + ESLint (see `.prettierrc`, `eslint.config.mjs`). Key rules:

- 2-space indent, 100-char lines, single quotes, semicolons, trailing commas (es5).
- `.env.example` files use one-line `# === TITLE` section headers, not full-width `# ===...===` separator blocks. Tokenizers compress runs of repeated characters, so a long separator costs ~2–3 tokens — the same as a short one — and only adds agent token cost. These files are read often by agents; keep headers single-line and token-efficient.
- Quote string values in `wrangler.toml` (TOML requires it). Keep `.env`/`.dev.vars` values unquoted
  unless dotenv semantics require it. See `docs/ARCHITECTURE.md` for the full quoting convention.
- Imports: alphabetically sorted, no blank lines between groups, group order: builtin → external → internal → parent → sibling → index → object → type.
- Avoid unused imports/exports.
- Keep functions small; prefer early returns. Avoid inline comments unless explaining a non-obvious decision.
- Tailwind classes are auto-sorted by Prettier via `prettier-plugin-tailwindcss`.
- For animations/utilities not in Tailwind, define them in `app/assets/css/tailwind.css` (`@utility` for custom utilities, `@keyframes` for animations).
- Inline styles only for truly dynamic values (e.g., computed positions).

Naming:

- Components: PascalCase filenames. Composables: `useCamelCase`. Stores: `useXStore`.
- Routes: kebab-case. Tests: `*.test.ts` in `__tests__/`. Constants: `UPPER_SNAKE_CASE` for globals.

## Nuxt / Vue Rules

- Vue SFCs use `<script setup lang="ts">`.
- Auto-imported Vue/Nuxt utilities (`ref`, `computed`, `watch`, `useRoute`, `useFetch`, hooks) must not be explicitly imported.
- Explicitly import Pinia stores and utilities.
- Use `definePageMeta` for route metadata (layout, middleware).
- Use `useSeoMeta` for SEO properties (`title`, `description`, `og:*`, `twitter:*`). This is the established convention across all pages — do not suggest `useHead` as a replacement.
- Reserve `useHead` for non-meta head elements only (`htmlAttrs`, `link`, `script`, `style`).
- Prefer `useFetch`/`useAsyncData` for data fetching.
- Use `*.client.ts` suffix for client-only plugins.
- Keep page files lean; move logic into features/composables.
- Avoid adding new global state unless necessary.
- Keep server handlers small and composable.

## TypeScript

- Prefer explicit types for exports. Avoid `any`; use `unknown` + narrowing.
- Use union/string literal types for constrained values. `as const` for literal inference.
- Do not duplicate types already in Supabase generated files.

## Icons

- Icons use `@nuxt/icon` (registered automatically by `@nuxt/ui`). Use `<UIcon name="i-{collection}-{name}" />` or the `icon` prop on UI components.
- Three Iconify collections are installed locally: `@iconify-json/mdi` (primary), `@iconify-json/heroicons`, `@iconify-json/lucide` (Nuxt UI internal).
- `icon.clientBundle.scan` in `nuxt.config.ts` bundles all statically-referenced icons at build time into the client bundle. This eliminates runtime CDN fetches for the vast majority of icons.
- Dynamically-bound icon names (`:name="variable"`) that the scanner cannot resolve at build time fall back to the Iconify CDN at runtime. The CSP `connect-src` entry for `api.iconify.design` exists for this fallback path.
- When adding new icons, prefer icons from the installed collections (mdi, heroicons, lucide). Adding a new collection requires installing `@iconify-json/{collection}` and adding it to `.fallowrc.json` `ignoreDependencies`.

## Localization

- Non-English files (`cs`, `de`, `es`, `fr`, `it`, `ko`, `pl`, `pt`, `ru`, `uk`, `zh`) are Crowdin-owned exports.
- vue-i18n fallback locale is `en` (`app/i18n.config.ts`). Missing non-English keys render English automatically.
- `pnpm run i18n:check` is fatal only for snake_case naming violations in `en.json`. Missing/orphaned keys in non-English files are informational. It also emits non-fatal drift warnings comparing flattened parsed values (missing keys count as English fallback): an enabled locale with >90% of values identical to the English source, or a locale file <30% identical that is missing from `SUPPORTED_LOCALES`.
- Locale keys must be snake_case. Provide fallback strings in `t('key', 'Fallback')` calls.
- When adding user-facing copy: add key to `en.json` only, run `pnpm run i18n:check`. Crowdin handles propagation.
- Crowdin-only PRs that change only non-English exports are excluded from repository-owned CI, PR metadata, security, and Dependabot workflows via their `paths-ignore` filters. Changes to source code or `en.json` still run normal checks.
- Add keys consistently with existing namespace patterns. Keep locale keys stable to avoid churn.
- The `common.*` namespace holds shared translations for values that appear across multiple features (e.g. `common.cancel`, `common.available`, `common.tasks`). When adding user-facing copy that duplicates an existing value, reference the `common.*` key instead of creating a new duplicate. If no `common.*` key exists yet, add one and reference it from all call sites. This reduces Crowdin translation segments and keeps the source locale compact.
- Avoid hard-coded user-facing strings in components.
- The sole exception to not editing non-English locale files is fixing a broken Crowdin export PR; even then, only touch the file(s) Crowdin produced.

## State, Data, and APIs

- Pinia stores in `app/stores/`, auto-registered by Nuxt. Use `pinia-plugin-persistedstate` where applicable.
- Supabase client: `app/plugins/supabase.client.ts`. Regenerate types: `pnpm run supabase:types`.
- OAuth PKCE callback: the client treats a request as an OAuth callback only on the `/auth/callback`
  route (`readOAuthCallbackCode()`); a `code` query param on any other route — e.g. a team invite
  `/team?team=...&code=...` — is left for that feature to consume and never sent to
  `exchangeCodeForSession`. `detectSessionInUrl` is disabled for every query `code` so Supabase cannot
  auto-classify a feature-specific value as PKCE; the plugin exchanges it only on the callback route.
  The PKCE exchange runs inside `$supabase.ready()` (deferred, exactly once), never in top-level plugin
  `setup()`, so an expired/replayed/invalid code rejects `ready()` for `auth/callback.vue` to surface
  and post `OAUTH_ERROR` to the login opener instead of aborting plugin initialization and stalling
  the popup until its abandonment timeout. The single exchange attempt clears the in-memory callback
  marker when it settles; a successful exchange also removes `code` and `sb_flow_id` from the callback
  URL so later `ready()` calls refresh the current session normally.
- API endpoints: `app/server/api/`. Use composables for shared data access patterns.
- Admin Pages API routes return stable machine-readable error codes in `data.code`; keep the
  English `statusMessage` as a client fallback and map known codes to localized UI copy.
- The hideout Tarkov-data route caches the adapted base payload, then applies the current overlay
  after `edgeCache()` and calls `setOverlayResponseHeaders()` before returning. Its browser
  IndexedDB entry uses the matching `json-v4` version and a one-hour TTL. Warm requests serve a
  stale overlay immediately while one Cloudflare-lifetime refresh runs in the background; failed
  deferred refreshes back off for one minute. Other overlay-enabled Tarkov-data routes cache their
  final corrected payload. Preserve this ordering so no cache layer pins stale hideout corrections.
- Overlay data must be fetched over HTTPS on every server path. `OVERLAY_URL` must be HTTPS
  (anything else falls back to the trusted `raw.githubusercontent.com` default), and no redirect may
  downgrade to plaintext: `app/server/utils/overlay.ts` follows redirects manually with a per-hop
  HTTPS check and a 3-hop cap, and the streamer Kappa editions fetch passes `redirect: 'error'`. New
  server-side overlay consumers must do one or the other. See the Overlay corrections section of
  `docs/SYSTEMS.md`.
- Task adaptation and overlay patches carry trader requirements in the raw upstream shape (one
  `traderRequirements` list discriminated by `requirementType`). The adapter and `applyOverlay`
  split them into `traderLevelRequirements` (level gates) and reputation-only `traderRequirements`;
  a task patch's `traderRequirements` replaces the whole requirement set, and the split runs for
  patched tasks and `tasksAdd` entries alike. See the Overlay corrections section of
  `docs/SYSTEMS.md`.
- Internal game modes are `pvp`, `pve`, and `seasonal`; game-data requests map Seasonal to the
  upstream `pvp-season` slug. Active Seasonal progress is keyed by season number in
  `user_game_mode_progress`, while `user_progress` remains the account-metadata and rolling-deploy
  compatibility row for persistent PvP/PvE.
- Keep the app's `ACTIVE_SEASON` number and dates synchronized with the database's
  `private.active_season_*()` functions. The Worker resolves the number from the database.
  Advancing the number starts a fresh empty Seasonal progress row without deleting history.
  Tarkov.dev profile imports support Seasonal through the upstream `pvp-season` profile path.
  EFT-log imports must remain unavailable for Seasonal until their Season log data is verified.
- Public progress API clients must send a 5–200 character `User-Agent`; infrastructure routes are exempt. Usage reporting stores the latest normalized value per token/day.
- Ordinary task acceptance is stored explicitly as optional `active`. New writes use canonical
  triples: active `{complete:false, failed:false, active:true}`, completed/failed/neutral always set
  `active:false`. Missing `active` on legacy rows means unknown; never infer it from incomplete
  flags or mass-backfill ambiguous rows. Auto-unlocked successors are neutral, not active.
- API gateway routes must call `authorize()` before validating or decoding request input (URL params
  and body). Authentication and daily-quota enforcement come first so a malformed request from an
  unauthenticated or over-quota client answers `401`/`429`, never `400`. Pass `auth.rlHeaders` into
  the resulting `400` responses so validation errors carry the same `X-RateLimit-*` headers as
  successful ones (empty on the fail-open path, where no quota decision exists).
- The `token-create` Edge Function accepts `permissions` only as a non-empty array of supported
  values (`GP`/`TP`/`WP`, matching the api-gateway `Permission` enum and the frontend
  `API_PERMISSIONS` map); any other shape is rejected with `400` before token insertion.
- API token renames update only `api_tokens.note` through authenticated owner-scoped RLS. They
  must never rotate or replace the token or change its ID, value or hash, permissions, game mode,
  or usage data.
- Team owners disband through the authenticated `team-disband` Edge Function, which calls the
  owner-scoped atomic `disband_team` RPC. The UI must require confirmation; regular `team-leave`
  remains the non-owner leave path.
- Account deletion requests consume their three-per-minute limit and record the allowed attempt in
  one `consume_account_deletion_attempt` transaction. Both the initiating function and reconciler
  must atomically claim work through `claim_account_deletion_job`; a fresh `in_progress` claim has a
  15-minute lease before reconciliation can recover it. Completion and failure writes must match
  the current claim's fencing token. Only a new user request can revive a dead-lettered job. Both
  RPCs remain service-role-only.
- The promoted Twitch stream supports a build-time fallback and an admin-managed override.
  `NUXT_PUBLIC_PROMOTED_TWITCH_ENABLED=true` directly enables the build-time fallback without an
  admin write. `public.app_settings` is service-role-only; `/api/twitch/config` resolves the
  admin-managed `promoted_twitch` override over that fallback, and `/api/admin/twitch-config` is the
  only writer. `/api/twitch/config` is edge-cached with the `promoted-twitch-config` tag and is
  invalidated by the `admin-cache-purge` edge function after a committed admin update. A successful
  immediate tag purge (with purge-by-URL fallback) schedules the same purge six seconds later to
  clear stale in-flight fills. Twitch-only purges use a distinct audit action so game-data cache
  metadata never interprets them as Tarkov-data invalidations. Purge failures return the committed
  config with an explicit warning flag so clients reconcile without repeating the write. Config responses carry the settings version
  so stale browser cache entries cannot overwrite a newer admin save. Mounted embeds refresh the
  config every five minutes while visible and on tab focus; those requests are served by the edge
  cache between fills. The admin form disables browser caching when loading config so it cannot
  submit stale settings. See the Promoted Twitch configuration section of `docs/SYSTEMS.md`.
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
- The root `socket.yml` limits Socket PR alerts to dependency manifest changes; CodeAnt locale filters live in `.codeant/configuration.json`. Kilo, Snyk, and Supabase PR integrations remain vendor-dashboard settings.
- Use browser-based dashboard inspection only as a fallback when MCP/API access is missing or insufficient.
- Production database inspection uses `scripts/prod-db`; it is read-only, emits normalized JSON with statistics-reset metadata, and must use a dedicated observer role over a direct or session-mode connection. Run the telemetry-only `canary` before enabling Pi access. Never provide Pi or another agent with service-role, postgres-admin, migration, or Management API credentials.

## Git Workflow

### PR Review Gate

- Do not merge a PR until all available automated and human reviews have finished and every in-scope comment/thread has an explicit disposition.
- For valid in-scope feedback, fix it on the same PR branch, push the change, wait for the updated review/check cycle, reply with evidence, and resolve the thread before merging. Do not open a chain of follow-up PRs for feedback that belongs to the current PR's scope.
- For invalid, already-addressed, or superseded feedback, reply with the technical rationale and evidence, then resolve the thread before merging.
- For genuinely out-of-scope valid feedback, open a tracked GitHub issue before merge, link it in the review reply, explain why it is outside the PR scope, and resolve the thread. Do not silently defer it.
- Before merge, query both inline review threads and review-summary/top-level comments; summary-only findings still require a reply or reconciliation comment even when GitHub provides no resolvable thread.
- If a review integration cannot complete because of exhausted credits, rate limits, vendor failure, or an equivalent external blocker, document that failure on the PR, perform and report a direct self-review of the diff, and only then decide whether to merge.
- Treat new comments created by the latest pushed commit as part of the same review cycle. Repeat until checks pass, reviews are complete, and unresolved thread count is zero.
- After merge, run one fresh review-thread query to verify zero unresolved threads. Post-merge follow-ups are exceptional recovery, not the normal review workflow.
- Review all Dependabot GitHub Actions PRs manually. Before merging an action SHA change, verify and
  update repository and organization Actions allowlists when they restrict that action; do not rely
  on the Dependabot branch checks to prove the new SHA is permitted.

- Prefer a normal branch in the current checkout (with existing `node_modules` and husky hooks) for the first in-flight task.
- Before edits, run `git status --short --branch`.
- Do not use `git stash` for normal context switching unless the user asks.
- Worktree policy (parallel work isolation):
  - Default to the main checkout for the first in-flight task. Do not create a worktree for solo work or for batched pre-PR edits the user is accumulating before opening a PR.
  - Create a worktree only when starting a SECOND concurrent task while the first is still in flight (uncommitted edits in the main checkout, or an open PR waiting on CI/review). The first task stays in the main checkout; the new task gets a worktree. This is what enables parallel agents without one agent reverting another's uncommitted changes.
  - Worktree convention: path `.wt/<branch>` (co-located, gitignored), created via `bash scripts/wt.sh add <branch>`. The script runs `scripts/setup-worktree.sh` so husky + lint-staged work on commit. State the worktree path in every status update so the user knows which checkout the agent is operating in.
  - One agent per worktree. Never operate in a worktree another agent is using. Never run `git worktree remove` on a worktree you did not create. If the tree is unexpectedly dirty, stop and ask the user instead of cleaning it.
  - After a worktree's PR merges, remove it with `bash scripts/wt.sh rm <branch>` so stale worktrees and branches don't accumulate.
- Before every commit: ensure hooks can run (`node_modules` present and `core.hooksPath` / `.husky/_` exist). If they cannot, either run the bootstrap script or manually format/lint staged paths (Prettier for docs/markdown; ESLint for app TS/Vue; `node scripts/lint-blank-lines.mjs --fix` for supported source/config files) so CI `format:check` will pass. Do not commit with known-skipped hooks and unformatted staged files.
- Commit scopes (from `commitlint.config.js`): `app`, `workers`, `api`, `ui`, `tasks`, `hideout`, `maps`, `team`, `settings`, `admin`, `i18n`, `deps`, `config`, `ci`, `test`, `docs`, `release`. Do not invent new scopes; omit the scope if none fits. Map common cases: `ui` for theme/styling/shell work, `docs` for repository/process documentation such as `AGENTS.md`.
- Commit types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `wip`.
- Release-producing types: `feat` triggers a minor release; `fix`, `perf`, `refactor`, and `revert` trigger a patch release. Other types do not release unless they contain a breaking change or match an explicit rule in `.releaserc.json`.
- Header max 100 chars. Subject must not be UPPER_CASE.

## Environment Variables

- Use one canonical env var name per concept. Shared Supabase project settings use `SUPABASE_URL`
  and `SUPABASE_ANON_KEY` across Nuxt, Pages, Workers, and Edge Functions; do not duplicate them
  as `NUXT_PUBLIC_SUPABASE_*` values.
- Use `NUXT_PUBLIC_*` for browser-exposed Nuxt-only runtime config.
- Use `NUXT_*` for private Nuxt runtime config (server-only).
- Browser log forwarding is opt-in: keep `NUXT_PUBLIC_CLIENT_LOG_SINK_URL` empty unless the sink is
  external or `/api/logs/client` is protected by an edge rate-limit rule.
- Use platform-native names for Supabase Edge Functions (`SUPABASE_*`, `STRIPE_*`, `DISCORD_*`).
- Treat `wrangler.toml` as the source of truth for Cloudflare Pages plaintext variables, bindings,
  and placement in production and preview. Keep only encrypted secrets in the Pages dashboard; do
  not duplicate `[vars]` there.
- Do not add legacy aliases or fallback chains without explicit approval. The environment map uses
  one canonical name per concept; deprecated Supabase, Nuxt, Vite, and Edge Function aliases have
  been removed.
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

For domain-specific component, interface, data-model, or workflow details, load `docs/agent-context/summary/index.md` on demand.

| Topic                                             | Location                      |
| ------------------------------------------------- | ----------------------------- |
| Architecture & env vars                           | `docs/ARCHITECTURE.md`        |
| System specs (caching, data, overlay, precompute) | `docs/SYSTEMS.md`             |
| API reference                                     | `docs/API.md`                 |
| Rate limiting                                     | `docs/RATE_LIMITING.md`       |
| Runbook (deploy, incidents)                       | `docs/runbook.md`             |
| Workflow automation (CI/CD, hooks, releases)      | `docs/WORKFLOW_AUTOMATION.md` |
| Contributing                                      | `.github/CONTRIBUTING.md`     |
| Security policy                                   | `SECURITY.md`                 |
| Design spec                                       | `DESIGN.md`                   |

## Custom Instructions

<!-- This section is for human and agent-maintained operational knowledge.
     Add repo-specific conventions, gotchas, and workflow rules here.
     This section is preserved exactly as-is when re-running codebase-summary. -->
