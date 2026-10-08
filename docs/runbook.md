# Production Runbook

## Required Environment Variables

Canonical variable map (owner): [`architecture.md` §Environment Variables](./architecture.md#environment-variables).
Naming: `NUXT_*` = Nuxt private (server-only), `NUXT_PUBLIC_*` = Nuxt public (browser-exposed).

**Nuxt app (Cloudflare Pages):** see the canonical map for `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`NUXT_SUPABASE_SERVICE_KEY`, `APP_URL`, `API_ALLOWED_HOSTS`, and `API_TRUST_PROXY`. Plaintext
`[vars]` stay in `wrangler.toml`; encrypted secrets stay in the Pages dashboard. Previews use
`CF_PAGES_URL`. Forwarded headers are trusted only when `API_TRUST_PROXY=true` or `NITRO_PRESET`
is explicitly set to a `cloudflare*` preset.

### Stripe checkout (Nuxt server)

See the canonical map for `STRIPE_SECRET_KEY` and the nine `STRIPE_PRICE_*` IDs used by the Nuxt
`/api/stripe/checkout` route to create Checkout Sessions.

### Stripe webhook (Supabase Edge Function `stripe-webhook`)

Receipt completion, fenced retries, migration-before-handler rollout and historical receipt
disposition: [Stripe webhook recovery](./stripe-webhook-recovery.md).

Set these in Supabase Dashboard → Project Settings → Edge Functions (canonical definitions in
[`architecture.md` §Environment Variables](./architecture.md#environment-variables) and
`supabase/functions/.env.example`):

- `STRIPE_WEBHOOK_SECRET` (Stripe Dashboard → Webhooks → Signing secret)
- `STRIPE_SECRET_KEY` (Stripe Dashboard → Developers → API keys); required so refund and
  dispute events can correlate the charge back to its subscription/customer before revoking
  supporter access. The function refuses to start without it.
- The nine `STRIPE_PRICE_*` IDs; the webhook uses these IDs as the source of truth when a customer
  changes plans in Stripe's portal.
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (auto-injected in hosted Supabase)
- `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_SUPPORTER_ROLE_ID` for role sync. The
  per-tier role IDs `DISCORD_SCAV_ROLE_ID` / `DISCORD_TIMMY_ROLE_ID` / `DISCORD_CHAD_ROLE_ID` are
  optional for local and preview deployments (role sync skips the tier role when one is unset), but
  production must set all three because the supporter page and Terms advertise tier roles for
  recurring supporter subscriptions as a live perk (no "coming soon" qualifier).
- `DISCORD_LINKED_ROLE_ID` for the role applied after a user links Discord from Settings.
- `APP_URL` for `admin-cache-purge` cache-key construction.

Configure the Stripe webhook endpoint to send:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`
- `charge.dispute.created`

Checkout is only for the first subscription. Existing active or past-due subscribers change tiers,
cancel, and update payment methods through Stripe Customer Portal. A partial refund does not revoke
access; full refunds and chargebacks follow the revocation policy in the webhook.
Configure one Stripe product per tier (Scav, Timmy, and Chad), with that tier's monthly, six-month,
and yearly prices. Enable Customer Portal subscription updates across those three products, with
`price` as an allowed update and immediate invoicing for prorations. Stripe rejects a portal product
that contains multiple prices with the same billing interval, so do not collapse tiers into one
product.

### Account IP audit

- `NUXT_ACCOUNT_IP_HASH_SECRET` (canonical map) for the Nuxt `/api/account/activity` route. It
  stores an HMAC digest of each authenticated user's IP address, never the raw address. Use a
  unique, long random value and retain it while historical hashes need to remain comparable.

## Optional Environment Variables

See the canonical map for `NUXT_LOG_SINK_URL`, `NUXT_PUBLIC_CLIENT_LOG_SINK_URL`,
`NUXT_PUBLIC_LOG_LEVEL`, `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`,
`NUXT_TEAM_MEMBERS_CACHE_TTL_MS`, `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`, and
`NUXT_SHARED_PROFILE_CACHE_TTL_MS`. Operational note: set the browser log sink at build time to
`/api/logs/client` only when the edge/WAF rate limit for that path is enabled, or use an external
collector URL.

## Pre-Deploy Validation

1. `pnpm run format:check`
2. `pnpm run lint`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run supabase:check`
6. `pnpm run build`
7. `pnpm run audit:dependencies`
8. For the tarkov.dev profile cleanup rollout, snapshot `public.user_progress` before applying the
   destructive cleanup migration.

## Seasonal Rollover

Seasonal progress is reset by advancing the active season number, not by deleting rows. The new
number selects a fresh `(user_id, seasonal, season_number)` row for every account; historical rows
remain available for rollback and audit but are excluded from active progress, teams, profiles,
backups, prestige, realtime, and public API reads.

Prepare and deploy each rollover in two releases during the no-write gap between seasons:

1. Prepare the next `ACTIVE_SEASON` values, matching database functions, metadata assertions, and
   displayed season copy on separate application and database branches. Run the normal pre-deploy
   validation plus the Supabase DB and API gateway suites for both final states.
2. After the previous season's announced cutoff, deploy only the database migration that replaces
   `private.active_season_number()`, `private.active_season_starts_on()`, and
   `private.active_season_ends_at()`. Verify all three functions before continuing. During this gap
   `sync_user_game_mode_progress` skips the Seasonal entry of any client still bundling the previous
   season number, so no old-season state reaches the new season while those clients keep syncing
   their persistent PvP and PvE progress normally.
3. Deploy the application release that updates `ACTIVE_SEASON` in `app/utils/constants.ts`. Verify
   the app countdown and `/progress` Seasonal row selection before announcing the new season open.
4. Do not combine the database flip and application constants in one merge because their production
   deployment order is uncontrolled. Do not delete the previous season's rows.

## Deployment

### Internal game-data browser verification

Application support is disabled by default and does not itself enforce CDN access.
Use the [browser-clearance rollout and rollback procedure](./tarkov-clearance-rollout.md)
for staging, alias closure, Access-protected automation, exact production approval and
readback evidence. **Disable the edge challenge rule before removing frontend recovery.**
Production deployment, Cloudflare mutations and merge require separate approval.

Merging to `main` deploys through three integrations — none of them GitHub Actions. Each one builds
and deploys only when its trigger matches the merge, and surfaces as a check on the merge commit
when it runs:

| What                                 | Mechanism                    | Check on the merge commit     |
| ------------------------------------ | ---------------------------- | ----------------------------- |
| Frontend                             | Cloudflare Pages Git build   | `Cloudflare Pages`            |
| `api-gateway` Worker                 | Cloudflare Workers Git build | `Workers Builds: api-gateway` |
| DB migrations **and** Edge Functions | Supabase GitHub integration  | `Supabase Preview`            |

The Worker build is path-filtered. Its `Deploy default branch` trigger runs `npx wrangler deploy`
in root directory `workers/api-gateway`, with no build command. It builds `main` only when any
commit in a push changes a file under one of its build watch paths (marked below), or when
Cloudflare skips
[watch-path matching](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
(0 changed files, 20+ commits or 3000+ files in one push). A merge outside the watch paths gets no
Worker build, no `Workers Builds: api-gateway` check and no new Worker deployment; that is expected,
not a broken integration.

Every build input is watched, plus `patches/**` and `.nvmrc`, so dependency and shared-code merges
redeploy the Worker without a manual build. Besides its directory, the build reads the
sources it bundles, every `package.json` and `tsconfig.json` esbuild applies to them, the pnpm
workspace files that install Wrangler and esbuild, and the `nuxt.config.ts` and transitive local
imports the install's `postinstall` evaluates. Its inputs, kept in sync with the code by
`scripts/workflow-tests/worker-build-inputs.mjs`:

<!-- api-gateway-build-inputs:start -->

- `workers/api-gateway/**` — watched
- `app/features/resources/resourceData.ts` — watched (`nuxt prepare` import)
- `app/locales/en.json` — watched (`nuxt prepare` import)
- `app/utils/apiProtectionConfig.ts` — watched (`nuxt prepare` import)
- `app/utils/buildCommit.ts` — watched (`nuxt prepare` import)
- `app/utils/csp.ts` — watched (`nuxt prepare` import)
- `app/utils/entryRecoveryScript.ts` — watched (`nuxt prepare` import)
- `app/utils/locales.ts` — watched (`nuxt prepare` import)
- `app/utils/nuxtSecurityConfig.ts` — watched (`nuxt prepare` import)
- `app/utils/prerenderOutput.ts` — watched (`nuxt prepare` import)
- `app/utils/routeSeo.ts` — watched (`nuxt prepare` import)
- `app/utils/runtimeConfig.ts` — watched (`nuxt prepare` import)
- `app/utils/shellConfig.ts` — watched (`nuxt prepare` import)
- `app/utils/stripBareNodeImports.ts` — watched (`nuxt prepare` import)
- `app/utils/theme.ts` — watched (`nuxt prepare` import)
- `app/utils/turnstileKeys.ts` — watched (`nuxt prepare` import)
- `package.json` — watched (module type for the bundled files above; pnpm version and the
  `postinstall` that workspace installs run)
- `tsconfig.json` — watched (compiles the bundled files above; extends the generated
  `.nuxt/tsconfig.json`)
- `nuxt.config.ts` — watched (the `postinstall` `nuxt prepare` writes `.nuxt/tsconfig.json`
  from it; the `app/utils/` modules it imports must also load for that install to succeed)
- `pnpm-lock.yaml` — watched (pins Wrangler, esbuild and every installed package)
- `pnpm-workspace.yaml` — watched (workspace membership, esbuild override, allowed build
  scripts)

<!-- api-gateway-build-inputs:end -->

Progress contracts now live under the already-watched `workers/api-gateway/**` path. The
existing trigger still also watches the retired `shared/**` and `app/utils/modeProgress.ts`
paths; this preparatory change does not modify the integration.

A new build input must be added to the trigger's watch paths in the same change, or production
keeps the previous Worker build until a watched file changes.
The check also rejects a deploy redirect (`.wrangler/deploy/config.json`), `wrangler.json` or
`wrangler.jsonc` in `workers/api-gateway`, `workers/` or the repository root, which that deploy
command would use instead of `workers/api-gateway/wrangler.toml`, and `wrangler.toml` settings it
does not model. The root `.nvmrc` is watched so a Node bump rebuilds the Worker, although
Cloudflare documents Node version files only in the build's root directory, `workers/api-gateway`,
which has none.

The Supabase check keeps the name `Supabase Preview` on `main`, where it targets the **production**
project rather than a preview branch. Per-PR preview deploys are intentionally disabled to avoid
per-preview billing, which is why the same check reports `skipping` on pull requests.

Two things need operator attention beyond the automated integrations.

First, ship the frontend and both Supabase migrations as one release. The migrations remove the
client broadcast permission and the direct write grants that older bundles rely on, and deployment
order across the three integrations is uncontrolled. After the release, reload or close stale tabs:
a tab still running the previous bundle keeps a channel and write path that no longer exist and will
stop receiving team updates until it reloads.

Second, private Realtime channels are only enforced when **Allow public access** is disabled under
the project's Realtime settings in the Supabase dashboard. The `realtime.messages` policies shipped by
`20260830120000_secure_team_realtime_channels.sql` authorize the private `team:<id>` join, but with
public access still enabled a client can join a same-named public topic. Row data stays protected by
table RLS either way; disable the setting to close topic-level access. The migration deliberately
leaves no client INSERT policy on `realtime.messages`, so no team member can publish broadcasts.

The steps below are therefore mostly verification. The manual commands are a fallback for when an
integration fails or is unavailable, not the normal path.

1. Merge to `main` and verify CI workflow `Validate`, `Supabase DB`, and `Workers` jobs are green.
2. Confirm the Pages project remains **fail open** so prerendered public documents and finite
   client documents still serve if the Functions daily quota is exhausted. Dynamic `/profile/*`,
   `/api/*`, and `/overlay/*` paths require available Functions capacity; missing static paths must
   return HTTP 404. Verify the document inventory and routing described in
   [Public rendering and discovery](architecture.md#public-rendering-and-discovery).
3. **Verify DB migrations applied.** The Supabase integration applies pending migrations on merge.
   Confirm rather than assume:

   ```bash
   supabase migration list --linked   # any row with a blank REMOTE column is still pending
   ```

   If a migration is still pending, apply it manually:

   ```bash
   supabase db push --linked
   ```

   `db push` is safe to run when nothing is pending — it reports `Remote database is up to date`.
   Verify the object itself landed, not just the version row; for a constraint, check
   `pg_constraint` (`convalidated = false` is expected for `NOT VALID`).

   **Ordering caveat:** migrations, Workers and Edge Functions all deploy from the same merge and
   you cannot control the order between them. Code that depends on a new DB object (e.g. a worker
   calling the `merge_progress_data` RPC) can briefly run against a database that does not have it
   yet. When the dependency matters, land the migration in an **earlier release** than the code
   that uses it; adding a DB object ahead of its caller is safe, the reverse is not.

   **Constraint/validation ordering:** the same applies when a migration adds a CHECK constraint
   that an Edge Function also enforces in application code (e.g.
   `api_tokens_token_value_game_mode_match` and the `tokenValue` guards in `token-create`). If the
   constraint lands first, the still-unvalidated function can attempt a write the constraint
   rejects, and the resulting Postgres `23514` (`check_violation`) surfaces as whatever that
   function maps `23514` to — `token-create` reports it as `409 Token limit reached (3 active)`,
   which sends debugging the wrong way. Ship the function validation in an earlier release than the
   constraint when that distinction matters.

4. **Pre-deploy secret check (api-gateway Worker):** before merging a change that relies on
   `IP_HASH_SECRET` (e.g. any change to abuse-gate logs that emit `ip_hash`), confirm the secret is
   already provisioned on the production `api-gateway` Worker:

   ```bash
   wrangler secret list --config workers/api-gateway/wrangler.toml   # confirm IP_HASH_SECRET is listed
   wrangler secret put IP_HASH_SECRET --config workers/api-gateway/wrangler.toml   # set if missing
   ```

   The api-gateway Worker auto-deploys from `main` on merge. If `IP_HASH_SECRET` is absent at
   deploy time, `abuse_gate_429` and `abuse_gate_unavailable` log lines emit `ip_hash: null`,
   defeating the IP-level abuse observability the change introduced. Provision the secret **before**
   merging so the first post-merge request already has a non-null HMAC identifier.
   Do not commit the value.

5. Confirm the `Cloudflare Pages` and `Supabase Preview` checks succeeded on the merge commit. If
   the push changed `workers/api-gateway/**` or bypassed watch-path matching, also confirm
   `Workers Builds: api-gateway` succeeded on it. Otherwise, if it changed an unwatched
   [Worker build input](#deployment), no check appears and the Worker still needs a build.
   `/health` reports a fixed version, so it identifies no build.
6. **Verify Edge Functions deployed.** The Supabase integration deploys every function under
   `supabase/functions/` on merge; confirm each changed function reports a new version in the
   Supabase dashboard. Manual fallback:

   ```bash
   supabase functions deploy --use-api
   ```

   Deploy **all** functions, not one. A scoped `supabase functions deploy <name>` omits
   `supabase/functions/deno.json`, so the bare specifiers it maps (`shared/auth`) fail to resolve
   and the deploy is rejected with a `Relative import path ... not prefixed with / or ./ or ../`
   bundling error. `--use-api` applies the per-function `verify_jwt` settings from
   `supabase/config.toml`.

7. Confirm workers are serving the expected revision:
   - `workers/api-gateway`
8. Smoke test:
   - `https://tarkovtracker.org`
   - `https://api.tarkovtracker.org/health`
9. If the tarkov.dev profile cleanup migration shipped, note that old manual backups may still
   contain historic imported profile snapshots until users regenerate them.

When a user unlinks their Discord identity, the `discord-unlink` Edge Function first revokes all
managed roles from that Discord account, then the client removes the identity and the database
trigger deletes the corresponding `discord_account_links` row and clears the denormalized supporter
Discord ID. Eligible lifetime and active-subscription roles are restored when an identity is linked
again. Manual role sync removes stale tier roles, preserves the base Supporter role for users with
paid support history, and reports a join-server warning when the Discord account is not a member of
the configured guild.

## Reusable production QA accounts

Two ordinary test identities in production project `knptqelvsodccnoehmbj` are retained between
authorized smoke tests:

- **Owner:** `production-smoke-owner@tests.tarkovtracker.invalid`, user ID
  `663b3094-f3bd-41aa-81c7-b50a801d2ba1`.
- **Member:** `production-smoke-member@tests.tarkovtracker.invalid`, user ID
  `d5004745-9d38-4b5f-8da4-1f3abca83907`.

Their trusted Auth `app_metadata` has `production_smoke: true`,
`production_smoke_label: "owner"` or `"member"`, and
`production_smoke_project: "knptqelvsodccnoehmbj"`. Verify the project, exact user IDs, emails,
markers, ordinary `authenticated` role, and absence of super-admin status before issuing a session.
These markers identify fixtures; they grant no application privileges or billing benefits.

Generated credentials are encrypted in the Supabase Vault secret
`tarkovtracker.production-smoke.accounts`. Access it only through an already authorized operational
connection. Do not print decrypted values or put them in Git, tool output, process arguments, or
browser storage. Verify `anon` and `authenticated` have neither Vault schema usage nor SELECT on
`vault.secrets` or `vault.decrypted_secrets`; never grant browser access to the secret.

Production email/password sign-in is disabled. To test the existing OAuth-only application without
changing Auth providers or sending email, an authorized server-side Auth administrator can issue
`auth.admin.generateLink({ type: 'magiclink', email })` for the verified fixture, then exchange the
returned `properties.hashed_token` with `auth.verifyOtp({ token_hash, type: 'magiclink' })`. Verify
the returned user's ID, trusted markers, and role again. Keep generated links and OTP material
private and short-lived. Only the resulting ordinary user session belongs in an isolated test
browser; privileged keys stay outside the browser. See the official
[generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) and
[verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp) contracts.

Run saves, reloads, disconnected edits, imports, team/profile reads, and API checks against these
identities through normal application, RPC, and Edge Function paths. Use temporary teams and API
tokens; after testing, leave as the member, disband as the owner, revoke every test token, restore
private profile visibility, sign out test sessions, and remove local session/credential files.
Retain both accounts and the encrypted Vault record. This fixture does not authorize deployments,
migrations, or writes to other accounts.

The accounts follow the ordinary [inactivity policy](./account-retention.md). Successful sign-in
and authenticated testing renew their activity; keeping the fixture does not exempt it from
inactivity cleanup. Follow that policy when scheduling fixture reuse; do not grant supporter,
Storage, or administrator privileges to bypass retention. Credentials can be rotated through an
authorized operation without changing account IDs.

## Known Benign Database Signals

These show up in Supabase logs / query performance and are expected. Do not treat as incidents.

1. `database "supabase_admin" does not exist` (SQLSTATE `3D000`, FATAL)
   - Source: Supabase platform-internal process on the DB host. The log event shows
     `parsed.connection_from: ::1` (loopback), `parsed.user_name: supabase_admin`,
     `parsed.command_tag: startup`. A local health/liveness probe authenticates as the
     `supabase_admin` role without specifying a database, so libpq defaults the db name to the
     role name, which doesn't exist.
   - Not us: no repo, edge function, CI, or app connection uses the `supabase_admin` Postgres
     role (app + functions use `@supabase/supabase-js` over HTTPS). Not fixable from our account.
   - Handling: suppress in log views / drains by excluding `sql_state_code = '3D000'` with
     `user_name = 'supabase_admin'`. Safe because our app never connects as `supabase_admin`.

2. `realtime.list_changes(...)` as the top query by total time (role `supabase_admin`)
   - Source: Supabase Realtime's continuous WAL poller. Tops the chart by call volume, not
     latency (low mean time, ~99.9999% cache hit). Expected for an always-on poller.
   - Health checks: replication slots are `active`/`streaming` with `0 GB` lag, and the
     `supabase_realtime` publication is explicitly scoped to a named table list (not
     `FOR ALL TABLES`). This is the desired configuration. The current list is
     `public.user_progress` (added by `20251205120619`), `public.user_system` (added by
     `20260830120000`), `public.supporters` (added by `20260714065213`), and
     `public.user_game_mode_progress` plus `public.team_memberships` (both added by
     `20260804043342`). Verify with
     `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` and update
     this list whenever a migration adds or removes a table.
   - Watch for: occasional high max-time correlates with an inactive/lagging replication slot.
     Verify with `supabase inspect db replication-slots --linked` (lag should stay ~0).

3. Duplicate realtime-enable migrations (benign)
   - `20251205120619_enable_realtime_user_progress.sql` plus `_dup_1` (`20251205171031`) and
     `_dup_2` (`20251205171557`) all run the same idempotent
     `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_progress` (guarded by a
     `WHERE pubname...` existence check). Already applied to production; do not delete (would
     desync migration history). Avoid this duplicate-add pattern in future migrations.

## Database Migrations

### Immutable history and remote synchronization

- **Applied/shared migration files are immutable**, including comments, formatting, filenames, and
  timestamps. Treat every migration on `main` as applied unless an operator proves otherwise. Never
  rewrite history merely to satisfy SonarCloud, reduce file count, or make a fresh reset pass.
- A real schema, permission, or function change after deployment requires a new forward migration.
  For an intentional historical maintainability finding, record an issue-specific disposition in the
  analysis service with evidence; do not weaken the global gate or change old SQL. A genuine security
  defect still requires remediation, not automatic acceptance because its migration is historical.
- Before a migration PR, fetch `origin/main` and inspect
  `git diff --name-status origin/main...HEAD -- supabase/migrations`. Existing-file modifications,
  deletions, and renames are a stop condition unless part of an explicitly approved recovery or
  baseline project. Restoring an accidentally edited file to its deployed Git revision is not a new
  schema change; verify the resulting PR has no historical SQL diff.
- The implementing agent collects migration evidence directly using available authenticated MCP,
  the read-only observer, and CLI access. Operator-provided records are not required. Record the
  verified target project/ref, Git SHA, CLI version, capture time and sanitized results before merge
  and repeat the relevant checks after integration. When the CLI is linked, use:

  ```bash
  git rev-parse HEAD
  pnpm exec supabase --version
  pnpm exec supabase projects list
  pnpm exec supabase migration list --linked
  pnpm exec supabase db push --linked --dry-run --skip-vault
  ```

  Confirm the remote project ref in `projects list` matches the linked ref stored in the gitignored
  `supabase/.temp/project-ref` (written by `supabase link`), and every evidence record names it, so
  output cannot be mistaken for another project's history. `project_id` in `supabase/config.toml` is
  a local host-level identifier, not the remote project ref.

  A local-only version is pending; a remote-only version is missing from the checkout. Stop on
  unexpected versions or ordering differences and reconcile against deployment records before any
  push. After deployment, expect no pending migrations for the deployed revision. A branch with new
  migrations legitimately has pending versions before deployment; record that exact expected set.
  If linked CLI access is unavailable, verify the authenticated MCP project URL against the
  observer's `project_ref`, collect observer/MCP migration history, and run `migration list` and
  `db push --dry-run --skip-vault` with `--db-url` using the dedicated observer connection. This is
  equivalent evidence for the verified target; record the transport used rather than claiming a
  linked command ran. A CLI dry-run checks the pending migration plan, not SQL execution or locks;
  validate SQL in a disposable database and inspect production catalogs separately.

  Prefer the observer for telemetry and relation inspection. Authenticated MCP may collect bounded,
  catalog-only SELECT results for function contracts, dependencies, grants and triggers that the
  observer cannot report. Do not execute mutation routines or read application rows through this
  exception. Never pass privileged credentials to the observer. Load only the credentials needed
  for each CLI command, keep passwords out of arguments/logs using `PGPASSFILE`, keep TLS validation
  enabled, and never use `--debug` with production credentials. Always include `--skip-vault` on a
  dry-run so configuration cannot update Vault secrets. Inspection does not authorize deployment,
  migration repair, reset, privilege changes or other remote writes. If required evidence cannot be
  collected, report the precise gap instead of treating green CI as production clearance.

- **Deploy migrations only from a revision that is already merged to `main`.** Pushing from an
  unmerged branch moves remote history ahead of the checkout, and every later `main` build then fails
  the `Supabase Preview` check with `Remote migration versions not found in local migrations
directory.` until the deployed file lands. That check runs on `main` pushes and is skipped on pull
  requests, so the breakage only becomes visible after merge. If an out-of-band apply is unavoidable,
  merge the exact deployed file immediately afterwards and record the revision, version list, and file
  hashes; `scripts/ops/prod-db migration-history` shows `missing_locally` for exactly this condition. The
  fix is always to land the deployed file, never `migration repair --status reverted`, which would
  falsify applied history and let a later push re-run the SQL.
- `migration list` compares **timestamps only**. Matching rows do not detect edited SQL or schema
  drift. Preserve the deployed Git revision, compare historical file contents against it, replay
  locally with `pnpm run supabase:check`, and verify affected remote objects, grants, RLS, triggers,
  and job configuration through approved inspection. Deployment success alone is not catalog proof.
- `migration repair` changes history records, not schema. Never mark unapplied SQL as applied or
  applied SQL as reverted simply to make the lists match. `db pull` can also update remote history;
  neither is a routine read-only sync operation. Remote repair, reset, or squash requires explicit
  operator approval and a recorded recovery plan. The named legacy reconciliation exception below
  is not blanket authorization to repair other versions.

### Minimize churn, not the audit trail

The default is to keep deployed history and reduce unnecessary migrations **before deployment**:

- Iterate on one cohesive migration for an unmerged change instead of appending a migration for each
  review correction, but only after proving those versions have never run in any shared environment.
  A disposable local database can be reset and replayed; a shared preview/staging database counts as
  deployed history. If application status is uncertain, preserve the version and use a forward fix.
- Keep independent deployment phases separate when required for rolling compatibility, lock budgets,
  or operational safety. Never combine schema changes with bulk backfills just to save files.
- Do not create migrations for documentation, static-analysis-only cleanup, or changes that leave the
  deployed database unchanged. Do not delete old migrations because newer ones supersede their objects.
- File count alone is not a reason to squash. Measure local/CI replay time before proposing a baseline.
  Baseline replacement is a separate operator-approved maintenance project, not an agent cleanup task.

An approved baseline project must freeze migration delivery, inventory every shared environment,
archive the original Git history and migration records with a recovery plan, and prove both fresh
bootstrap and existing-environment continuation on disposable databases. Compare schema, owners,
grants, RLS, functions, triggers, publications, required reference data, cron jobs, and storage setup.
The Supabase squash command produces a schema-only result and omits data changes, including cron jobs,
storage buckets, and Vault entries. Reconstruct required non-schema state explicitly without exporting
secrets into Git or replaying obsolete backfills. An operator must coordinate the history cutover for
all environments so existing databases do not execute a fresh-install baseline over live objects.
Until that project is separately approved and verified, keep all applied migration files in place.

References: [migration history](https://supabase.com/docs/reference/cli/supabase-migration-list),
[squash limitations](https://supabase.com/docs/reference/cli/supabase-migration-squash), and
[history repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

### Seasonal-team index recovery (#646)

The applied migration `20260804043344_add_seasonal_team_index_concurrently.sql` uses
`CREATE INDEX CONCURRENTLY IF NOT EXISTS`. A cancelled/failed concurrent build can leave an
invalid index, and rerunning that statement skips the existing name without repairing it. Do not
edit the historical migration or rebuild a healthy index just because this failure is possible.

An authorized operator first records the project identity, deployed revision, PostgreSQL version,
and migration-history/pending-version evidence described above. Obtain the following catalog
results through the operator's approved database access; the Pi observer does not accept arbitrary
SQL. Do not supply operator credentials to an agent.

```sql
SELECT c.oid::regclass AS index_name,
       c.relkind,
       i.indrelid::regclass AS table_name,
       i.indisvalid,
       i.indisready,
       i.indislive,
       CASE WHEN i.indexrelid IS NOT NULL
            THEN pg_catalog.pg_get_indexdef(i.indexrelid) END AS definition
FROM pg_catalog.pg_class AS c
LEFT JOIN pg_catalog.pg_index AS i ON i.indexrelid = c.oid
WHERE c.oid = pg_catalog.to_regclass('public.idx_user_system_seasonal_team_id');

SELECT pid, command, phase
FROM pg_catalog.pg_stat_progress_create_index
WHERE relid = pg_catalog.to_regclass('public.user_system');
```

Expected definition: a nonunique B-tree index on `public.user_system(seasonal_team_id)`, with no
predicate, expression, or extra columns. Catalog inspection must use a role with visibility into
all relevant operations. Review current lock/activity reports too; an empty progress view alone
is not a concurrency guarantee. Coordinate the maintenance window so no migration or other index
maintenance starts between inspection and recovery.

| Observed state                                                         | Action                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Expected definition; valid, ready, and live                            | Record the evidence and leave the index in place.                                                                           |
| Expected definition; invalid but live; no active build/maintenance     | Review and authorize the concurrent rebuild below.                                                                          |
| Missing index, wrong definition, unexpected relation kind, or not live | Stop this recovery path. Investigate schema drift and prepare a separately reviewed forward schema change or recovery plan. |
| Active build or conflicting maintenance                                | Let the operator investigate the operation; do not cancel it or start another rebuild automatically.                        |

For the confirmed invalid, otherwise expected index, PostgreSQL supports rebuilding that exact
index without changing its definition:

```sql
REINDEX INDEX CONCURRENTLY public.idx_user_system_seasonal_team_id;
```

Run it as a **single statement in a verified autocommit operator session**, outside `BEGIN`,
a function, or a `DO` block. Set bounded session lock/statement timeouts appropriate to the
observed table size and maintenance window. Concurrent rebuilding permits ordinary writes but
still consumes I/O, needs space for another index, and can wait for existing transactions.
Do not route this command through the migration runner: this repository has observed that
`supabase:disable-transaction` did not disable its transaction wrapper. Rebuilding the existing
expected index is an explicitly reviewed operational repair; it does not justify editing or
repairing migration history. A changed index definition still requires a forward schema change.

Afterward, rerun both catalog queries and record that the expected definition is unchanged and
`indisvalid`, `indisready`, and `indislive` are all true. If interrupted again, stop and inspect the
result before retrying. Concurrent reindexing can leave temporary `_ccnew` or `_ccold` indexes;
follow PostgreSQL's failure-state guidance after verifying their identity and dependencies rather
than deleting objects by suffix alone. Attach before/after evidence and the operation result to
issue #646 (or its deployment record). Until that evidence exists, production index validity is
**unverified**, even when repository CI is green.

The failure and repair were reproduced in an isolated PostgreSQL 17 database: cancel a concurrent
build while it waits for an open writer, observe invalid/not-ready flags, verify `IF NOT EXISTS`
leaves those flags unchanged, then run the single-statement concurrent reindex and verify the
original definition is valid/ready/live. This validates the procedure, not the deployed index.

References: [CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html),
[REINDEX and interrupted-build recovery](https://www.postgresql.org/docs/17/sql-reindex.html), and
[pg_index validity flags](https://www.postgresql.org/docs/17/catalog-pg-index.html).

### Execution and deployment safety

- **Never put a bulk data rewrite in a migration.** Migrations run in a transaction, so a
  statement that exceeds `statement_timeout` rolls the whole file back — schema included — while the
  Cloudflare Pages deploy from the same merge still succeeds. That is what took production down on
  2026-08-06: the seasonal backfill timed out, `user_game_mode_progress` and
  `sync_user_game_mode_progress` never got created, and the new frontend shipped against the old
  schema, so every signed-in client got `404`s. Ship the schema first and make the app tolerate rows
  that do not exist yet. If materialization is later required, use the approved operational process
  below rather than another migration.
- **Do not run a whole-table backfill through the migration runner on this project.** It was tried
  twice on 2026-08-06 and failed both times, the second time taking user-facing writes with it. The
  retry held an open transaction inserting into `user_game_mode_progress` for 30+ minutes, so every
  signed-in client blocked on conflicting inserts during its startup sync and the app looked like a
  broken login while auth itself was healthy. Two properties make this worse than it sounds: a
  migration file is applied atomically even with `-- supabase:disable-transaction` (verified with a
  probe whose earlier statements were rolled back by a later failure), so a backfill cannot be staged
  inside one file; and the runner retries a failed migration on **every** later push to `main`,
  including `chore(release)` commits, so a failing backfill re-runs unattended.
  Prefer avoiding the data movement by making every read path fall back to the old source. If a
  complete materialization later becomes a product requirement, treat it as approved operational
  data maintenance rather than a schema migration: wait for a healthy Disk I/O Budget, invoke one
  small key range per independently committed SQL Editor operation during low traffic, record
  completed ranges in the incident/change log, and stop if database latency, CPU, memory, lock waits,
  or I/O pressure rises.
  This is a narrow exception for idempotent data maintenance; schema changes still require migration
  files. Never put multiple range calls in one migration file because the deployment runner applies
  the file atomically.
- **Raise `statement_timeout` explicitly when a migration scans or rewrites whole tables**, and pair
  the `SET` with a trailing `RESET statement_timeout;`.
- **Nothing in CI runs a migration against production-sized data.** `supabase:check` resets an empty
  local database, so per-row cost is invisible. Before merging a migration that touches every row,
  estimate the row count and the per-row work by hand.
- **Migrations are the source of truth. Do not change the production schema directly** via the
  Supabase dashboard / SQL editor. Direct edits cause drift: a fresh environment built from
  migrations no longer matches production, and the next `db push` can fail or apply destructive
  changes. Always write a migration.
- **GitHub Actions does not apply migrations — the Supabase integration does.** The `Supabase DB`
  job only validates (`supabase:check` = local reset + lint) and no workflow runs `db push`.
  Application to production happens automatically on merge to `main` via the Supabase GitHub
  integration, which surfaces as the `Supabase Preview` check on the merge commit. Per-PR preview
  databases are intentionally **disabled** (they bill per ephemeral preview DB), so that same check
  reports `skipping` on pull requests. Confirm the result after every merge and apply manually only
  if something is still pending:

  ```bash
  supabase migration list --linked   # blank REMOTE column = still pending
  supabase db push --linked          # fallback if the integration did not apply it
  ```

  Then verify the change landed (e.g. catalog query / `has_column_privilege`).

- Verify migrations reproduce prod: `supabase db reset --local`, then dump both and compare
  (`supabase db dump --local` vs `--linked`). Catalog-level checks (columns, constraints,
  indexes, grants, policies, functions, triggers via `information_schema` / `pg_catalog`) are
  more reliable than dump text, which differs by harmless column/statement ordering.
- Platform-managed extensions (`pg_graphql`, `pg_net`) differ between the local stack and prod;
  migrations do not control these and the difference is expected.

### Platform-owned public relation defaults

The client-access invariant in [progress storage](./systems/progress-storage.md#invariants)
covers the reserved creating role tracked by [#1133](https://github.com/tarkovtracker-org/TarkovTracker/issues/1133).
Customer migrations run as `postgres`; that role cannot change `supabase_admin` default ACLs
without membership or superuser authority. Supabase's
[existing-project opt-in procedure](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
targets only `postgres`. Its announced platform rollout is not evidence that this project's
reserved-role defaults have changed. No supported customer operation for that change was found
in the documented procedure. Do not grant reserved-role membership, escalate credentials, or
install privileged hooks to work around the boundary.

Platform extension installation is a relevant creation path, even when requested by `postgres`.
[Supautils delegates privileged extension creation to its configured superuser](https://github.com/supabase/supautils/blob/df32bd65e4d13212bf812ee966a51132d034bc17/README.md#privileged-extensions);
this project's installed configuration names `supabase_admin`. Extension member relations
placed in `public` can therefore inherit that role's defaults. This is a possible future-object
exposure, not evidence of an existing platform-owned public table. Supabase also uses the role
for [internal upgrades and automations](https://supabase.com/docs/guides/database/postgres/roles#supabase_admin);
the current inventory cannot guarantee the schemas or owners of future platform objects.

**Operational policy**

- Create application relations through reviewed `postgres` migrations with explicit client
  grants, RLS where applicable, and the required service-role grants. The separate
  [#1134](https://github.com/tarkovtracker-org/TarkovTracker/pull/1134) handles existing application
  grants and `postgres` table/view defaults; do not infer its deployment from this audit.
- Install extensions in a schema outside the configured Data API exposed schemas where supported;
  review fixed-schema extensions individually. Check the target schema, dependencies and expected
  creating role before enabling or upgrading an extension. Do not assume `extensions` is
  unexposed merely because of its name. Supabase's
  [PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis) recommends a
  dedicated schema instead of `public`.
- Repeat the catalog checks below before and after extension changes, platform/database upgrades,
  restores, and any observation of a new platform-owned public relation. Compare owners and
  extension membership, not only relation names. Also collect `scripts/ops/prod-db schema` for
  column ACLs and effective inherited/PUBLIC grants, and inspect RLS policies and view security
  settings before accepting client access.
- If a platform-owned public relation appears, stop the related feature rollout until its actual
  client access and service-role requirements are reviewed. Use a forward migration for
  customer-authorized per-object grants/revokes only when the catalog confirms grant authority.
  Otherwise request remediation through Supabase Support: provide the project ref, creating role,
  global/public ACL readback, relation/extension identity and required service-role access; ask
  whether the feature can use an unexposed schema and whether provider-side default changes are
  supported. Do not report provider remediation as completed without a response and readback.
- Preserve service-role DML on application tables and required view/sequence access. After any
  approved remediation, rerun these checks and the affected feature smoke tests; absence of client
  defaults alone is insufficient. A catalog grant does not prove a view is updatable or a request
  succeeds through the Data API.

**Read-only catalog checks**

Verify the target using the [production inspection procedure](#database-migrations) first.
Use authenticated Supabase MCP for the following catalog-only SELECTs when the dedicated observer
does not expose default ACLs. Never pass privileged credentials to the observer. Record the project
ref, Git revision, capture time and results. Query errors, missing expected roles or an unexpected
inventory are incomplete evidence, not a passing audit.

Confirm the role boundary and extension delegation:

```sql
SELECT current_timestamp AS captured_at, current_database() AS database_name,
       current_user AS execution_role, r.rolsuper AS postgres_superuser,
       pg_has_role('postgres', 'supabase_admin', 'MEMBER') AS postgres_member_of_supabase_admin,
       pg_has_role('postgres', 'supabase_admin', 'SET') AS postgres_can_set_supabase_admin,
       current_setting('supautils.privileged_extensions_superuser', true) AS extension_creating_role
FROM pg_catalog.pg_roles r
WHERE r.rolname = 'postgres';
```

Inventory table/view and sequence defaults for **every creating role**, both global and `public`
scopes. Keep the object types separate: sequence privileges differ from table privileges.
Schema defaults add to global defaults; a schema-only revoke cannot cancel a global grant.
[PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
apply when objects are created, not retrospectively. An absent `pg_default_acl` entry means
PostgreSQL's built-in defaults, not missing owner privileges; for tables these do not grant client
access. Check grants to `PUBLIC` and roles inherited by the client roles as well as direct grants.

```sql
SELECT pg_get_userbyid(d.defaclrole) AS creating_role,
       CASE d.defaclobjtype WHEN 'r' THEN 'table/view' WHEN 'S' THEN 'sequence' END AS object_type,
       CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE n.nspname END AS scope,
       CASE WHEN a.grantee IS NULL THEN '(empty ACL)'
            WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       coalesce(array_agg(a.privilege_type ORDER BY a.privilege_type)
         FILTER (WHERE a.privilege_type IS NOT NULL), ARRAY[]::text[]) AS privileges,
       coalesce(bool_or(a.is_grantable), false) AS has_grant_option
FROM pg_catalog.pg_default_acl d
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
LEFT JOIN LATERAL pg_catalog.aclexplode(nullif(d.defaclacl, '{}'::aclitem[])) a ON true
WHERE d.defaclobjtype IN ('r', 'S')
  AND (d.defaclnamespace = 0 OR n.nspname = 'public')
GROUP BY d.defaclrole, d.defaclobjtype, d.defaclnamespace, n.nspname, a.grantee
ORDER BY creating_role, object_type, scope, grantee;
```

Inventory public tables, partitions, views, materialized views, foreign tables and sequences,
including extension membership and effective relation-level access (schema USAGE included).
This complements rather than replaces the observer's column-grant report.

```sql
SELECT c.relname AS relation, c.relkind AS kind,
       pg_get_userbyid(c.relowner) AS owner, e.extname AS extension,
       c.relrowsecurity AS rls_enabled,
       (SELECT jsonb_object_agg(r.rolname, ARRAY(
          SELECT p.privilege
          FROM unnest(CASE WHEN c.relkind = 'S'
            THEN ARRAY['SELECT', 'USAGE', 'UPDATE']
            ELSE ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                       'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
          END) AS p(privilege)
          WHERE pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE')
            AND CASE WHEN c.relkind = 'S'
              THEN pg_catalog.has_sequence_privilege(r.oid, c.oid, p.privilege)
              ELSE pg_catalog.has_table_privilege(r.oid, c.oid, p.privilege)
            END
          ORDER BY p.privilege
        ))
        FROM pg_catalog.pg_roles r
        WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
       ) AS effective_relation_privileges
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_depend dep
  ON dep.classid = 'pg_catalog.pg_class'::regclass AND dep.objid = c.oid
 AND dep.objsubid = 0 AND dep.refclassid = 'pg_catalog.pg_extension'::regclass
 AND dep.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension e ON e.oid = dep.refobjid
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY owner, relation;
```

**Production readback — 2026-10-07**

Authenticated MCP project discovery verified `knptqelvsodccnoehmbj` as TarkovTracker.org,
host `db.knptqelvsodccnoehmbj.supabase.co`, PostgreSQL 17.6.1.048. Catalog SELECTs at
05:27–05:30 UTC were collected from checkout `3e5cab49`; no production mutation was performed.

- Execution role `postgres`: not a superuser; neither MEMBER of nor able to SET ROLE to
  `supabase_admin`. Privileged extension creation is configured to use `supabase_admin`.
- No global table-default ACL entries. Both `postgres` and `supabase_admin` have `public`
  table defaults granting SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and
  MAINTAIN to `anon`, `authenticated`, `postgres` and `service_role`, without grant option.
  These are pre-#1134 defaults, not a successful hardening readback.
- All 19 public tables and two views are owned by `postgres`; no public sequences or extension
  member relations were found. Service-role schema USAGE and SELECT/INSERT/UPDATE/DELETE are
  effective on all 21 relations. All 19 tables have RLS enabled; the two view RLS flags are false,
  which does not describe the underlying tables' policies or the views' security settings.
- Eight installed extensions: `hypopg`, `index_advisor`, `pg_cron`, `plpgsql` and
  `supabase_vault` owned by `supabase_admin`; `pg_stat_statements`, `pgcrypto` and
  `uuid-ossp` owned by `postgres`. None has `public` as its extension namespace.
- Supported outcome for #1133: retain provider-owned defaults under this operational policy and
  re-audit on the triggers above. No provider support response or reserved-role default change is
  claimed. Application-grant rollout and readback remain owned by #663/#1134.

**Default-ACL follow-up — 2026-10-07 06:03 UTC**

The expanded table/view-and-sequence query was executed through authenticated MCP for the same
verified project after merging main `35ffee6d` into this branch. It returned no global entries for
either object type. `postgres` public table/view defaults now grant only `postgres` and
`service_role` all eight privileges; the client grants removed by #1134 are absent.
`supabase_admin` public table/view defaults are unchanged. Public sequence defaults for both creating
roles grant SELECT, UPDATE and USAGE to `anon`, `authenticated`, `postgres` and `service_role`,
without grant option. Sequence defaults were outside #1134's table/view hardening and remain
unchanged by this documentation-only PR. This follow-up checks defaults, not application-table
grants, feature behavior or the full migration ledger.

### Progress transfer and freshness rollout

For `20260906174817_suppress_unchanged_progress_writes.sql` and
`20260906234500_track_mode_progress_freshness.sql`, verify linked history, exact pending SQL,
and production observer preflight before approving the migration rollout. Apply schema before
frontend when possible; Cloudflare and Supabase integrations run independently.

The frontend tolerates the freshness column being absent during deployment: startup and reconnect
retry only a missing `progress_updated_at` column without that field and retain unknown mode
freshness. This prevents an ordering race from aborting progress initialization; it does not prove
the migrations succeeded. Confirm both history entries and deployed column/function definitions
using the database migration procedure above. Without the migrations, write suppression and
independent server mode clocks are not fully enabled. Do not backfill historical clocks from
account or visibility timestamps.

Before release sign-off, use two authenticated browser sessions to check progress edits and clears,
a tab hidden longer than 60 seconds, edits while disconnected, reconnect, team changes during
reconnect, and reload. Verify no saved progress is lost or resurrected, retained teammates refresh,
and resumed saves succeed. Frontend rollback remains compatible with these additive migrations;
preserve applied migrations.

### Normalized PvP/PvE progress backfill (#1028)

`20261002090000_side_effect_free_mode_progress_backfill.sql` ships the helper only; running it is
separately approved operational maintenance under the rules above. The helper writes only rows whose
legacy payload has a numeric level while the normalized row is missing or has none. It never locks
or rewrites materialized rows; repairing a placeholder takes its row lock. It keeps source timestamps,
records unknown freshness, and records no
account activity, so retention deadlines and pending inactivity deletions are unchanged.

1. Measure remaining work per range with the completion gate (read-only):

   ```sql
   SELECT game_mode, count(*) FROM private.unmaterialized_mode_progress(
     '00000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000')
   GROUP BY game_mode;
   ```

2. Run one range per SQL Editor operation so each commits on its own. Start with a two-hex-digit
   range (`00…`–`01…`) to measure duration, then widen only while it stays well under the timeout.
   The last range passes `NULL` as the upper bound.

   ```sql
   BEGIN;
   SET LOCAL statement_timeout = '60s';
   SELECT private.backfill_game_mode_progress_range(
     '00000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000');
   COMMIT;
   ```

   The transaction-local timeout cannot leak into later maintenance. The helper sets
   `lock_timeout = '2s'`; a range that meets a live write fails and rolls back whole. If an error
   leaves the session in an aborted transaction, run `ROLLBACK;` before retrying. Re-run the range
   later; completed rows are no-ops.

3. Record each completed range in the change log and stop on rising latency, CPU, lock waits, or
   I/O pressure.
4. Remove fallback reads only after the gate returns zero rows for both modes across every range.

### Manual activity history rollout

Apply `20260910050000_add_manual_activity_history_to_progress` and
`20260910055448_harden_manual_activity_history_sync` before deploying the client that writes
`manualActivityHistory` and `manualActivityEpoch`. Cloudflare and Supabase deployment jobs are
independent: merging them together does not guarantee database-first ordering. Verify both migration
versions and the affected sanitizer, history-merge helper, row triggers, and sync RPC definitions
before releasing the client. The forward correction preserves existing migration history and does
not rewrite stored rows.

Old clients remain compatible after both migrations: omission preserves existing history, and
full progress resets still discard the prior feed. A frontend rollback must leave the database
migrations in place. Verify an old-client sync retains new history and a stale device cannot undo a
history clear; regression coverage is in `manual_activity_history.test.sql`.

### Out-of-band Package A apply and checkout alignment (`20260912085531`)

On 2026-09-12 an authorized operator applied
`20260912085531_contain_team_event_authority.sql` to production (`knptqelvsodccnoehmbj`) with
`supabase db push --project-ref … --skip-vault` from the unmerged release revision `08b0cf1e`.
Remote history moved from 122 to 123 versions while `main` still had 122 files, so every later
push to `main` failed the `Supabase Preview` check with
`Remote migration versions not found in local migrations directory.` The first affected commit
was `87a254d7` (2026-09-14); `15cb054a` (2026-09-10) was the last success. No local migration
file was edited, renamed, or deleted in that window — the divergence was entirely remote-only.

The correct remediation is to **update the checkout, not remote history**: land the deployed
migration file on `main` byte-for-byte. Its SHA-256 is
`a1d23f6a5a29e89ded68895f520240a2e193edb666d6db499e2573441529afff`; verify that against the
deployment receipt before committing. The CLI suggests
`supabase migration repair --status reverted <version>` in this situation. **Do not run it.** The
SQL really is applied, so marking it reverted would falsify history and let a later `db push`
re-run a migration whose `ADD COLUMN`/`CREATE` statements would then fail.

Reproduce the diagnosis without touching production: reset a local database to the same history,
then compare `supabase db push --local --dry-run` with the file absent (reproduces the exact error
and names the version) and present (`Local database is up to date.`).

**Restore the whole deployed unit, not just the migration.** The same deployment also shipped Edge
Functions `team-leave` (v609) and `team-kick` (v605) from `08b0cf1e`. The Supabase GitHub integration
deploys migrations **and** every function under `supabase/functions/` on merge, and it is the same
integration that reports the failing check — so while the check fails, function deployment is blocked
too, and making the check pass unblocks a function deploy from `main`. Splitting the recovery is
unsafe in both directions: migration-first lets the integration replace the deployed handlers with the
older ones on `main`, and functions-first leaves `main` with handlers that read a column no repository
migration creates, so any database built from the checkout returns 500. Land the migration and the
deployed function sources in the same change.

The database change alone does not cover the handler behavior: the deployed handlers filter cooldown
reads on `server_verified = true`, and the preserved pre-containment rows are `server_verified = false`
with possibly forged timestamps, so the older handlers would trust that history again. See the
`team_events` invariants in `docs/systems/teams.md`.

### Atomic-leave checkout recovery (`20260912085904`)

The earlier Package A recovery is not sufficient for the current hosted state. On 2026-09-16,
`main` at `d1601dc99dfca900362acc81f8ced03196a8b62d` contained 123 migrations, while the
linked production project `knptqelvsodccnoehmbj` contained 124. The sole remote-only version was
`20260912085904_atomic_team_leave`, with eight stored statements. Its deployed `team-leave`
Edge Function was version 610, not Package A's version 609. The failing `Supabase Preview`
check and a linked push dry-run both reported missing local migration versions.

Supabase CLI 2.117.0 authenticated using its existing authorized session; `projects list`,
explicit `link --project-ref knptqelvsodccnoehmbj`, and `migration list --linked` all succeeded.
A missing observer `PROD_DB_URL` does not mean the CLI cannot inspect the project. Keep the
observer's restricted credential boundary intact; this recovery uses separately authorized CLI
access, not broader credentials passed to `scripts/ops/prod-db`.

Recovery procedure and evidence:

1. Fetch remote migration statements with `supabase migration fetch --linked` into a separate
   linked scratch directory, never over immutable files in the working checkout.
2. Compare the missing migration with the original release revision
   `08e34653dc9867dcf716c4845cde0cffcf8b88a6`. The fetched file differs only in blank lines
   between statements. Restore the original Git bytes; SHA-256:
   `a73e4b1dccbe70f0f66d208cfdcd248b675a29077571c9ec9b687e2d5003725e`.
3. Download deployed `team-leave` with `supabase functions download team-leave --use-api` into
   the scratch directory. Its handler, `leave-team-rpc.ts`, and `team-leave-result.ts` match
   that same revision byte-for-byte. Restore this deployed unit together, with its public RPC
   type and regression tests. A migration-only recovery would unblock the integration and
   overwrite the live atomic handler with the older nontransactional implementation.
4. Inspect both `leave_team(uuid,uuid)` and `transfer_team_ownership(uuid,uuid,uuid)` through
   read-only linked catalog queries. The deployed function definitions, security-definer flags,
   empty search paths, five-second lock timeouts, and execution privileges match a clean local
   replay exactly. `anon` and `authenticated` cannot execute either; `service_role` can.
5. Recheck `migration list --linked` and `db push --linked --dry-run` from the restored checkout:
   all 124 versions match, with no pending SQL. Replay from scratch with `pnpm run supabase:check`
   in an isolated local project and validate the endpoint and concurrent team operations.

This is missing deployed history/source, not evidence of an incorrect history record. No remote
repair, push, schema change, or history-writing `db pull` is necessary. Do not mark the version
reverted: its non-idempotent `CREATE FUNCTION` has already executed. The catalog comparison is
scoped to the two affected RPCs, not a claim that every production schema object was audited.

After merging the complete recovery, verify the new `main` commit's `Supabase Preview` result
and repeat linked history/dry-run checks. Pull-request previews intentionally skip deployment,
so a green PR alone does not establish that the production integration has recovered. Do not
roll back to the pre-atomic leave handler or apply unrelated account-deletion migrations.

### Atomic team-kick rollout (`20260926090000`)

PR #938 (fix for #864) ships the atomic `kick_team` RPC in migration
`20260926090000_atomic_team_kick.sql` together with the rewritten `team-kick` handler sources in
one change, mirroring the atomic-leave unit rule: never separate the migration from the handler
sources it requires. The rollout is database-first: after the merge, the Supabase GitHub
integration applies the migration and deploys the edge functions (including `team-kick`) together
in the same integration run against the merge commit — there is no manual SQL step:

- **Do not apply the migration out of band** (no dashboard SQL editor, no `db push`) from PR #938's
  branch or any unmerged revision — see "Deploy migrations only from a revision that is already
  merged to `main`" above. Deploying the handler sources without the migration (or the migration
  without the required handler sources) breaks the RPC-version parity the atomic-leave recovery
  had to restore.
- The pre-merge state is already safe: the deployed `team-kick` (non-atomic, direct DELETE +
  event INSERT) never referenced `kick_team`, so the migration and the handler deploy land in the
  same integration run on the merge commit with no regression window.
- PR checks report `Supabase Preview` as `skipping` (per-PR preview databases are intentionally
  disabled), so validation is: green `Supabase DB` job on the PR, then after merge confirm on the
  merge commit that `Supabase Preview` succeeded, `supabase migration list --linked` shows
  `20260926090000` applied remotely (no blank REMOTE rows) and the `team-kick` function shows a
  new version in the Supabase dashboard. A blank REMOTE row is the pending case; the fallback is
  the manual `db push` block in "Deployment", not a hand-written apply of the migration.

### Durable leave and kick cooldown rollout (#1031)

Migration `20261002080000_durable_team_cooldowns.sql` adds private cooldown storage and
deletion-preservation triggers, and replaces `leave_team` and `kick_team` in place. It performs no
bulk backfill or existing-row rewrite. The RPC signatures, service-role grants, and Edge Function
result contracts stay compatible; no frontend, gateway, or Edge Function redeploy is required.
The cooldown and legacy-event trust rules belong to [the team system](systems/teams.md).

Before merge, collect the migration-history and preflight evidence above, inspect deployed RPC
definitions/grants, event provenance and cascade constraints, and the indexes used by legacy
lookups. Assess an `incomplete` preflight explicitly: function bodies and triggers are unsupported
by the classifier, and their runtime `INSERT`/`DELETE` statements are not migration-time rewrites.
Confirm the new private objects are absent and only this migration is pending for this PR. Keep
`20261002080000` ahead of the `20261002090000` progress-backfill migration in the release order.

After merge and explicit deployment authorization:

1. Repeat target identity, history, blocking/long-running-session checks, and the CLI dry-run from
   the merged revision. Apply only the expected migration set, in timestamp order.
2. Apply through the normal transactional migration runner. `lock_timeout = '5s'` bounds lock
   acquisition, including trigger installation on `teams`/`team_events`;
   `statement_timeout = '30s'` bounds each statement. If any statement fails, roll back the whole
   migration and verify it remains pending before retrying at a quieter time. Do not apply the file
   as separately committed SQL Editor statements or repair the migration ledger to force success.
3. Verify the ledger, both enabled preservation triggers, private-table RLS/client denial, and
   unchanged RPC signatures/service-role execution grants. Inspect blocking and error rates again.
4. With disposable test accounts, verify leave → disband → join another same-mode team → leave
   returns 429. Verify kick → disband/recreate → kick also returns 429; a missing target returns
   404 without spending the cooldown. Confirm another mode remains independent and a successful
   action is allowed after five minutes. Remove test teams through the owner disband function.

There is no down migration. A failed transactional apply leaves the previous schema and RPCs
intact. After a successful apply, recover with a separately reviewed, authorized forward migration
that corrects the affected helper, trigger, or RPC while retaining cooldown rows and compatible
grants. A frontend rollback cannot undo this database change. Do not drop the durable table,
disable preservation, restore event-only cooldowns, or rewrite applied migration history as routine
rollback: those actions can erase active windows or reopen the disband bypass. Re-run the database
regressions and deployment postchecks against any recovery migration before declaring recovery.

### Reconcile migration `20260630075121_reconcile_prod_schema_drift`

- Captures schema changes that were previously made directly in the dashboard (teams
  `members`/`max_members`/`updated_at`/nullable `join_code`; team_events PK `event_id`→`id`;
  team_memberships composite PK; user_system `api_tokens`/`created_at` + grants; supporters
  defaults; `hypopg`/`index_advisor` extensions).
- **Already applied to production by hand.** This migration is destructive if executed against
  prod (drops/recreates PKs and columns). It must be marked applied in prod history via
  `supabase migration repair --status applied 20260630075121`, NOT run via `db push`. It only
  executes on fresh/local builds so they reproduce prod.

### CLI note

- `supabase db diff` / `db pull` (shadow-DB based) fail in some CLI builds with
  `unknown flag: --mode`. `db dump`, `db query`, `db reset`, and `migration` work. The 2.101
  Go binary (`supabase-2.101` in `~/.local/bin`) can run `db diff` when the 2.108 wrapper cannot.

## Production database observer

The repository-owned `scripts/ops/prod-db` command is the canonical read-only production inspection
interface for agents and developers. It uses the Supabase CLI for the built-in inspection reports
and a restricted SQL library for schema and bounded data-shape reports. It always emits normalized
JSON and never applies migrations.

Use a TLS-protected direct database connection for `PROD_DB_URL` (`:5432`, or session-mode Supavisor when direct
IPv6 connectivity is unavailable). The transaction pooler is unsupported; the wrapper rejects a
`:6543` URL because that is the documented default transaction-pooler endpoint, even though Supavisor
can be configured differently. The URL must set `sslmode=verify-full` so both encryption and server
certificate identity are enforced.
The credential must belong to a dedicated observer role with no
data-write or DDL privileges; the environment must not contain `service_role`, `postgres`, migration,
or Management API credentials. The wrapper removes the URL password before invoking the Supabase
CLI, supplies it through a temporary mode-`0600` `PGPASSFILE`, removes the file after each command,
and redacts the password from command failures.

```bash
PROD_DB_TARGET=local scripts/ops/prod-db health
chmod 600 "${PROD_DB_ENV_FILE:-.env}"
scripts/ops/prod-db canary
scripts/ops/prod-db table-stats
scripts/ops/prod-db preflight --migration supabase/migrations/20260807_example.sql
```

Store `PROD_DB_URL=postgresql://pi_prod_observer:...@...:5432/postgres?sslmode=verify-full` in the
mode-`0600`, gitignored repository-root `.env` alongside the other local development secrets, so the
password does not enter shell history. `scripts/ops/prod-db` loads only `PROD_DB_*` keys from `.env`;
unrelated file keys are ignored. Already-exported environment variables take precedence and remain
inherited by the observer child process, apart from the credential variables stripped by the wrapper.
Keep the invoking environment free of privileged credentials. Export `PROD_DB_ENV_FILE` in the
invoking shell to select a different file (for example, `export PROD_DB_ENV_FILE=/path/to/observer.env`);
setting this selector inside `.env` is unsupported. The command fails if the selected file cannot be
read; an absent default `.env` is allowed. Values are literal:
no shell or variable expansion occurs. The wrapper rejects relative or missing certificate paths
before invoking the CLI. Use absolute certificate paths in `sslrootcert`, not `$HOME` or
`${HOME}`. An inline environment
assignment remains supported for non-interactive automation whose secret store masks command input.

Available reports include `health`, `schema`, `migration-history`, `db-stats`, `table-stats`,
`index-stats`, `traffic`, `outliers`, `calls`, `locks`, `blocking`, `long-running`, `vacuum`,
`bloat`, `role-stats`, bounded `sample`, `distribution`, and `count`. `sample` excludes columns
matching the sensitive-column policy and is capped at 20 rows; `distribution` is capped at 50
groups. The schema report exposes catalog ACL entries, PUBLIC grants, observer-effective privileges
through inherited roles, privileges effective for existing `anon`, `authenticated`, and `service_role`
roles, per-role schema `USAGE`, relation owners, and row-level-security flags. A privilege counts as
effective only when the role can also use the relation's schema. Column-level ACL entries and
the per-column privileges they make effective are listed separately. Health shows schema usage and read
access to the migration `version` and `statements` columns. `EXPLAIN ANALYZE`, arbitrary SQL,
writes, DDL, migration commands, and unbounded row access are not supported.

`migration-history` reads applied version identifiers from `supabase_migrations.schema_migrations`
and compares them with `supabase/migrations` in the current checkout. It reports `missing_locally`
(applied remotely, absent from the checkout) and `pending_remotely` (in the checkout, not yet
applied), which is the same distinction `supabase migration list --linked` makes, without needing
migration or admin credentials. It never returns the stored `statements` column, so migration SQL
and any literal it contains stay out of the report. Version identifiers alone do not prove the SQL
matches; use them to locate divergence, then compare file contents against the deployed Git
revision. If the observer lacks access the command fails and names the required grant.

The report carries `project_ref`, the Supabase project observed through `PROD_DB_URL` (`null` for a
local target). Confirm it names the intended project before treating the comparison as remote-history
evidence: a connection string pointing at another project reports a perfectly consistent comparison
for the wrong database. A primary connection whose host and observer username identify no project
fails rather than returning a nameless comparison. The command reports the identity it observed and
deliberately does not infer an expected project from application configuration, which is not
guaranteed to describe the same environment as the observer credential.

`canary` is the first production validation command. It runs only health and telemetry reports:
`db-stats`, `role-stats`, `table-stats`, `index-stats`, and `outliers`. It does not sample rows,
run distributions, or execute migration preflight. Before collecting telemetry it rejects
privileged or write-capable roles, persistent-object creation privileges, read access to stored
migration `statements`, disabled default
read-only transactions, and unbounded statement or lock timeouts. Every report includes an
`observation` object with capture time, observer application name, database statistics reset time,
statement statistics reset time, and I/O statistics reset time. These reset times are required to
interpret cumulative counters.

`preflight` parses the proposed migration to identify referenced relations and operation classes,
then combines that information with production table/index, traffic, vacuum, query, lock, and
blocking reports. The result is evidence-only and must be assessed before a migration is merged.
The implementing agent may collect and assess this evidence; human review is not mandatory.
Document migration semantics, deployed function dependencies/contracts and permissions, rolling
compatibility, lock acquisition and timeout/rollback strategy, together with the independent review
required by `AGENTS.md`. It does not execute the migration. If the parser sees dynamic SQL,
unsupported statements, quoted identifiers, malformed literals or comments, multiple statements, or
any unclassified syntax, it returns `assessment: incomplete`, `risk: unknown`, and `requires_manual_review: true`; it never
treats an unrecognized migration as safe. An incomplete report requires a documented assessment of
those unsupported operations using source review, disposable replay and production catalog/telemetry
evidence; it does not require the user to collect records or perform the assessment. Unresolved
material risks remain merge blockers. The only multi-statement exception is a migration made
entirely of table-level `GRANT`/`REVOKE` statements, optionally wrapped in one `BEGIN`/`COMMIT`
pair. Privilege names such as `UPDATE` and `DELETE` in those statements are not data changes, and
the explicit transaction is still reported as transaction control.

Provision the observer role out of band through the Supabase SQL editor or approved database
operation. Grant only `CONNECT`, required schema/catalog visibility, and `pg_monitor`; Supabase CLI
inspection reports such as `db-stats` call monitoring functions that `pg_read_all_stats` alone does
not permit. Grant `USAGE` on `extensions` and only explicit low-risk column-level `SELECT` when
bounded samples or distributions are required. For `migration-history`, grant read-only access to
the version column of the migration ledger:

```sql
GRANT USAGE ON SCHEMA supabase_migrations TO pi_prod_observer;
GRANT SELECT (version) ON TABLE supabase_migrations.schema_migrations TO pi_prod_observer;
```

The column-level grant is deliberate: `schema_migrations` also stores each migration's SQL in
`statements`, and the observer never needs it. Granting `SELECT` on the whole table would let anyone
holding the observer credential read stored migration SQL and any literal inside it. Set
conservative connection defaults for
`statement_timeout`, `lock_timeout`, `default_transaction_read_only`, and `application_name`;
database privileges, not `default_transaction_read_only`, are the hard safety boundary.

The production canary should be run manually after provisioning, using only the telemetry commands
above. Confirm the role, reset timestamps, timeouts, and negligible observer impact before enabling
Pi access. Do not make production role provisioning or the canary an automatic migration step.

## Incident Triage

1. Check Cloudflare Pages / Workers deployment logs for failed builds, missing variables, or failed Git sync.
2. Check Supabase:
   - Auth service health
   - Edge Function logs
   - `admin_audit_log` for cache purge events
3. Check API protection failures:
   - verify `API_ALLOWED_HOSTS`
   - verify `API_PUBLIC_ROUTES`
   - verify proxy headers (`CF-Connecting-IP`, `X-Forwarded-For`) are present
4. Check log sink:
   - `/api/logs/client` ingest volume
   - external sink delivery status (`NUXT_LOG_SINK_URL`)

## Recovery Actions

1. If Supabase is degraded, temporarily raise cache TTLs:
   - `NUXT_TEAM_MEMBERS_CACHE_TTL_MS`
   - `NUXT_SHARED_PROFILE_CACHE_TTL_MS`
2. If profile/team endpoints are under abuse, lower rate limits:
   - `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`
   - `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`
   - For `/api/tarkov-dev/profile`, add or tighten a Cloudflare rule; the app route also has a fixed per-IP limiter.
   - Cache API-backed shared rate limits are best-effort under concurrent bursts; use Cloudflare or Durable Objects for hard enforcement.
   - Full ownership map (Worker DO vs Edge mutation limits vs Pages vs Auth): [`rate-limiting.md`](./rate-limiting.md).
3. If API protection blocks valid traffic, update `API_ALLOWED_HOSTS` and redeploy.

### Combined task cache contract rollout (v2 to v3)

The progression and overlay changes ship together through PR #826, which supersedes PR #825.
Do not merge or dispatch the standalone #825 branch: its envelope-format-1 writer uses the same
v3 keys as the combined envelope-format-2 contract and would replace incompatible payloads.
Only the combined revision may publish v3 entries. There is no intermediate application release.

For the `tasks-core-json-v2-*` to `tasks-core-json-v3-*` transition, an authorized operator must dispatch
`.github/workflows/precompute-tarkov-data.yml` from the approved combined revision before merging
or promoting the app. Leave both workflow inputs, `lang` and `gameMode`, empty to include all
48 combinations across `regular`, `pve`, and `pvp-season`. Require `succeeded: 48` and `failed: 0`,
verify every `tasks-core-json-v3-*` entry uses envelope format 2, and attach the run and approved
revision to the release. Fetch the published overlay metadata again for each rollout; never reuse
a SHA from an older rehearsal. If the SHA changed, repeat the rehearsal and approve the new
identity before dispatch. Set `expectedOverlaySha` to that approved published SHA and verify
`overlay-precompute-manifest-json-v3` contains all 48 matching identities.

Before rollout, confirm neither original PR revision has a production deployment or an in-flight
precompute run. After the v3 population is verified, merge the combined PR only and
close #825 as superseded. The scheduled workflow then refreshes the combined v3 contract.
Before relying on the previous app for rollback, confirm its existing `tasks-core-json-v2-*`
entries remain within their seven-day TTL. Roll back to the previous v2 application, never the
standalone #825 application. The cold fetch/adapt/overlay fallback is not a safe bridge during
this cache-key rollout. After deployment, run `pnpm run verify:overlay` and retain the served
fleet verification before closing issue #729.
