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

The supporter page allows one Checkout request at a time across all tiers and the one-time form.
For up to 24 hours, retrying a failed request with the same selection in the same page uses the
same attempt ID. The route scopes that ID to the signed-in user before passing it to Stripe as
an idempotency key. Clients served before this change can still omit the ID.

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
`NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL`, `NUXT_PUBLIC_LOG_LEVEL`, `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`,
`NUXT_TEAM_MEMBERS_CACHE_TTL_MS`, `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`, and
`NUXT_SHARED_PROFILE_CACHE_TTL_MS`. Operational note: set the browser log sink at build time to
`/api/logs/client` only when the edge/WAF rate limit for that path is enabled, or use an external
collector URL. `NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL` separately enables only aggregate progress
metrics; when targeting `/api/logs/client`, it has the same edge-protection prerequisite. Keep general
browser log forwarding disabled when enabling these metrics alone. Verify delivery to the approved
retention/query destination after rebuilding the application.

The production `/api/logs/progress` collector, production-only service binding,
protection prerequisites, retention and staged verification are documented in
[Aggregate progress diagnostics](progress-diagnostics.md). Production enables only
the aggregate progress sink; general, root/local and preview logging stay disabled.
The [approved rollout evidence](https://github.com/tarkovtracker-org/TarkovTracker/issues/960#issuecomment-6908809905)
records the synthetic delivery/privacy checks and pre-activation PostgreSQL baseline.

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

### Correcting an end time within the active season

When correcting the end of the current season, update the application timestamp and replace only
`private.active_season_ends_at()` in a forward migration. The app reads its bundled timestamp for the
countdown and log import. The database selects writable Seasonal rows by season number, so either
artifact can deploy first. After both deploy, verify the displayed cutoff, the database end timestamp,
and the active season number. If the same season is still active and the correction must be reverted,
restore the prior app timestamp and use a separately reviewed forward migration to restore the prior
database timestamp. Repeat those checks after both reversions deploy.

## Deployment

### Internal game-data browser verification

Application support is disabled by default and does not itself enforce CDN access.
Use the [browser-clearance rollout and rollback procedure](./tarkov-clearance-rollout.md)
for staging, alias closure, Access-protected automation, exact production approval and
readback evidence. **Disable the edge challenge rule before removing frontend recovery.**
Production deployment, Cloudflare mutations and merge require separate approval.

Tracker merges deploy Pages and Supabase through their integrations. The API Worker builds
independently from API-repository merges matching its watch paths; none of these deploys are
GitHub Actions deployments. Checks appear on the corresponding source repository's commit:

| What                                  | Mechanism                    | Check on the source commit    |
| ------------------------------------- | ---------------------------- | ----------------------------- |
| Frontend                              | Cloudflare Pages Git build   | `Cloudflare Pages`            |
| `api-gateway` Worker (API repository) | Cloudflare Workers Git build | `Workers Builds: api-gateway` |
| DB migrations **and** Edge Functions  | Supabase GitHub integration  | `Supabase Preview`            |

The existing `api-gateway` Worker deploys only from `tarkovtracker-org/TarkovTracker-API/main`,
root `/`, with empty build command and deploy command `pnpm run deploy`. That command prepares
the generated workspace contracts before Wrangler bundles the Worker. The old Tracker source
trigger is disconnected. Build caching remains enabled and preview builds remain disabled.

Its watched API-repository inputs are `src/**`, `progress-contracts/**`,
`scripts/prepare-contracts.mjs`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`tsconfig.json`, `worker-configuration.d.ts`, `wrangler.toml`, `.nvmrc` and `.npmrc`, with no
exclusions. Tracker-only merges do not deploy the API Worker. For API deployment, secrets and
rollback, use [API operations](https://github.com/tarkovtracker-org/TarkovTracker-API/blob/main/docs/operations.md).
Consumer source/tag pins, compiled contracts and all-mode integration tests remain here:
[API ownership](api-ownership.md). `/health` reports a fixed version; verify build SHA to active
Worker version through Workers Builds and the deployment record.

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

   **Deployment ordering:** the [Supabase GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration#what-runs-on-each-push)
   applies config, migrations, seed, then Edge Functions. The old deployed function remains
   active while migrations run, so migrations must be compatible with that old handler until
   the new function version is active. Workers deploy independently and can reach a new DB
   object before its migration; land required objects in an earlier release when that dependency
   matters. Adding backward-compatible DB objects ahead of callers can be safe; constraints
   and behavior changes may require staged compatible callers first.

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
   already provisioned on the production `api-gateway` Worker. Run these commands only from
   the TarkovTracker-API checkout; Tracker's root Wrangler config is for Pages:

   ```bash
   pnpm exec wrangler secret list --config wrangler.toml
   # If absent, provision it only with explicit secret-change authorization:
   pnpm exec wrangler secret put IP_HASH_SECRET --config wrangler.toml
   ```

   The api-gateway Worker auto-deploys from the API repository's `main` on merge. If `IP_HASH_SECRET` is absent at
   deploy time, `abuse_gate_429` and `abuse_gate_unavailable` log lines emit `ip_hash: null`,
   defeating the IP-level abuse observability the change introduced. Provision the secret **before**
   merging so the first post-merge request already has a non-null HMAC identifier.
   Do not commit the value.

5. Confirm the `Cloudflare Pages` and `Supabase Preview` checks succeeded on the merge commit. If
   an API-repository merge matches the Worker watch paths (or matching is bypassed by Cloudflare),
   also confirm its `Workers Builds: api-gateway` check and exact active version there. Unwatched
   docs-only changes normally create no Worker build/check. Tracker merges do not deploy the API.
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
   - `api-gateway` from the API repository
8. Smoke test:
   - `https://tarkovtracker.org`
   - `https://api.tarkovtracker.org/health`
9. If the tarkov.dev profile cleanup migration shipped, note that old manual backups may still
   contain historic imported profile snapshots until users regenerate them.

### Billing deletion cutover

Before merging the billing-safe deletion migration/handler, deploy the prerequisite
`account-delete` maintenance gate as a separate release. It returns HTTP 503 with
`Retry-After: 60` before authentication, limiter writes, job claims, team changes, or Auth
deletion, and requires no new database objects. Account deletion is temporarily unavailable.

Record the prerequisite merge SHA and the production `account-delete` active version/source
revision from Supabase (not a preview or merely a green CI check). Using a disposable test
account's valid session, POST to the production function and verify HTTP 503, the retry header,
and the maintenance error. Confirm that its teams, Auth user, deletion jobs, and limiter state
remain unchanged. Do not log the session token. Wait for requests already running the old
function version to drain before proceeding. Record the active version and matching deployed
source, absence of old-version invocations in logs, and bounded-runtime evidence; a deploy
success alone does not prove old invocations finished.

Only then merge the billing-safe release. Supabase applies migrations before deploying Edge
Functions: the already-active gate prevents the old team-first handler from running against
the new Auth deletion guard during that interval. Verify the expected migration and new active
function version, then smoke-test the billing-safe refusal and eligible deletion paths with disposable fixtures.
If rollout fails, keep/redeploy the maintenance gate; never roll back to the old team-first
handler after the billing guard migration. Remove the gate only in the billing-safe handler
release.

The HTTP gate does not pause the database cron jobs. Unlike the old HTTP handler's separate
committed calls, `private.retry_account_deletion` and `private.delete_inactive_account` run
team preparation and Auth deletion within one transaction. Their callers' per-account
`BEGIN ... EXCEPTION` blocks roll back those changes when the Auth billing guard raises
`23514`; failure accounting then runs after that rollback. See migrations
`20261006120000_retry_failed_account_deletions.sql` and
`20260930003202_automate_inactive_account_cleanup.sql`. These cron paths do not have the HTTP
handler's partial team-change gap.

Before the billing migration, inspect pending/in-progress deletion jobs and the latest/running
`account-deletion-retry` and `inactive-account-cleanup` cron runs. Record the read-only evidence
and investigate failures or unexpected activity. This prerequisite does not require manually
disabling cron: any additional operational intervention needs evidence and separate authority.

The Settings Discord card reads the unique username from the matching Discord auth identity, not
the display name or cached `discord_username` (which may contain a numeric ID or display name).
If the username is unavailable, the card shows "Discord account linked" and keeps role sync and
unlink available.
The same provider-and-ID lookup selects the identity to unlink; if it is missing, the link stays
active and no roles are revoked.

Discord identity linking returns to `/settings?discord_linked=1#account`. Supabase readiness
exchanges its PKCE `code` before the card loads the link or synchronizes roles, then removes
`code` and `sb_flow_id` while preserving the link marker and account tab. Other Settings or team
invite `code` parameters are not OAuth callbacks.
If session readiness fails, the card keeps the complete callback URL for a reload/retry and
does not load the link or synchronize roles with a stale session.
Callback readiness rejects after its time budget while the code exchange is still pending.
An exchange failure remains visible to subsequent readiness callers until a page reload; a
slow exchange that later succeeds can satisfy a later readiness call without exchanging twice.
The normal `/auth/callback` page retains its five-second session-settle allowance after a
pending readiness timeout, awaiting confirmed callback readiness before reporting success.
A restored session alone does not complete the callback or count as a successful login.
Navigating to an authenticated or admin route while the callback is pending cancels that
navigation without clearing the existing session or discarding the callback URL. Access to
the protected route remains blocked until readiness succeeds.

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

Treat every migration on `main` as applied until verified otherwise. Applied/shared files are
immutable. Iterate on an unmerged migration only if no shared environment applied it.
Use a forward migration for schema, security or permission fixes. Keep compatibility phases,
heavy data work and separately authorized backfills distinct. Keep documentation and unrelated
formatting out of migration history.

1. Fetch main and run `git diff --name-status origin/main...HEAD -- supabase/migrations`. Stop on
   unexpected modifications, deletes or renames. Replay on an isolated local database with
   `pnpm run supabase:check`. Inspect affected functions, policies, triggers, grants and indexes.
2. Record Git SHA, CLI version, UTC capture time and verified project ref. Compare the remote ref
   against the gitignored `supabase/.temp/project-ref`; `project_id` in `supabase/config.toml` is
   local. Check the pending version set and reviewed SQL.

   ```sh
   git rev-parse HEAD
   pnpm exec supabase --version
   pnpm exec supabase projects list
   pnpm exec supabase migration list --linked
   pnpm exec supabase db push --linked --dry-run --skip-vault
   ```

3. Use the [read-only observer](#production-database-observer) for history, preflight, locks and
   schema. When linked access is unavailable, match authenticated MCP project identity to the
   observer's `project_ref`; use the dedicated observer URL with `--db-url` for equivalent list
   and dry-run commands. Use bounded catalog-only MCP SELECTs for definitions, dependencies,
   ACLs and triggers missing from observer reports. Record the transport and any evidence gap.
   Keep TLS validation on, passwords in `PGPASSFILE`, and privileged credentials outside the
   observer. Avoid application rows, mutation routines, production debug logs and Vault updates.
4. A local-only version is pending. A remote-only version is missing from the checkout.
   Reconcile surprises before deployment. The history list compares timestamps, and a dry-run
   checks planning. Compare historical files with the deployed revision and verify SQL execution
   locally and affected remote objects separately.
5. Deploy the reviewed merged revision through the Supabase GitHub integration. PR preview
   databases are disabled. Check `Supabase Preview` on main, then repeat identity, expected
   history, dry-run, and affected catalog checks. A manual push requires explicit authorization.
   A version applied out of band must land as the exact deployed file with hashes and deployment
   evidence. Never mark it reverted to make the list match.

`migration repair` changes recorded history and `db pull` can update it. Remote repair, reset and
squash require separate authorization and recovery evidence. The legacy
`20260630075121_reconcile_prod_schema_drift` SQL reproduces manually applied production changes
on fresh databases. Stop if it appears pending against that production project and verify the
ledger before any authorized history reconciliation. Never replay it against the live schema.

### Execution and deployment safety

Read [Supabase agent rules](../supabase/AGENTS.md) before authoring a migration. Use bounded
transactions, explicit lock and statement deadlines, least privilege, and schema-first rollout
when frontend/backend deploy independently. Inspect blockers, long transactions, write rate,
table size, replication and dependencies before the write. Match migration steps to compatibility
requirements and use a forward repair if a deployed change needs correction. Inspect the ledger,
affected grants, RLS, triggers, jobs and feature behavior afterward. Supabase-managed extensions
can differ between local and production; compare affected catalogs instead of raw dump ordering.

For app progress freshness, use [progress sync](systems/progress-sync.md) for missing-column
fallback and independent clocks. Check two signed-in tabs, clears, 60-second hidden/reconnect,
offline edits, teammate refresh and reload before sign-off. Never backfill mode freshness from
account or visibility timestamps.

### Platform-owned public relation defaults

New application tables and views require explicit grants, RLS where relevant, and preserved
service-role privileges. For platform-created objects, the `postgres` migration role lacks
authority over `supabase_admin` defaults. Privileged extension creation can run as
`supabase_admin`; review the target schema and creating role. Prefer unexposed schemas where
supported. Recheck after extension changes, platform upgrades, restores, or new platform-owned
relations. Stop the related rollout on unexpected client access, verify effective/inherited/PUBLIC
and column grants, RLS and view settings, and escalate reserved-role fixes to Supabase Support.
Never grant reserved-role membership or add a privileged hook as a shortcut. Recheck service-role
DML and feature behavior after authorized remediation.

Preserve the distinction between `postgres` table/view defaults, provider-owned defaults and
sequence ACLs. The table/view hardening did not change sequence defaults. Default ACLs apply
only to new objects, and schema defaults add to global grants. Confirm the target and use
catalog-only SELECTs for the checks below.

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

### Function EXECUTE defaults

`20261022090000_revoke_postgres_client_function_defaults.sql` makes new `postgres`-created
functions closed by default. PostgreSQL grants function EXECUTE to `PUBLIC` globally, and a
schema-scoped revoke cannot cancel a global default, so the migration revokes `PUBLIC` globally
for `postgres` (every schema, including `private` and `pg_temp`) and revokes Supabase's
`anon`/`authenticated` grants in `public`. `service_role` keeps its `public` default. Existing
function ACLs are unchanged; `supabase_admin` defaults are platform-owned and unchanged.

Every role that calls a new function must be granted EXECUTE explicitly in its migration:
client roles, `service_role` outside `public`, and the roles whose RLS policies call it.
Readback after rollout: the global `postgres` entry must omit `PUBLIC`, and its `public` entry
must omit `anon` and `authenticated`. Supabase's `storage` entry keeps client grants; the repo
creates no `storage` functions.

```sql
SELECT CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE n.nspname END AS scope,
       d.defaclacl
FROM pg_catalog.pg_default_acl d
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
WHERE d.defaclobjtype = 'f' AND d.defaclrole = 'postgres'::regrole
ORDER BY scope;
```

### Legacy PvP/PvE storage retirement

The normalized readers are authoritative. Frozen legacy JSON must never reseed progress.
The drop migration `20261018203633_drop_legacy_progress_columns.sql` targets only
`public.user_progress.pvp_data` and `pve_data` plus retired dependencies. It preserves account
metadata, normalized rows, Seasonal history, archives, preferences and team data. Older clients
that still ask for the retired columns or RPCs must update. Keep compatibility account timestamps
and Realtime for normalized readers within the supported boundary.

Before any production drop, require explicit authorization, exact pending SQL/history, independent
review, CI, a fresh consistent PostgreSQL 17 custom-format table-only backup and an isolated restore
receipt. Restore only pre-data and data without network, app/Auth access or scheduled extensions.
Exclude post-data triggers, grants, FKs and publication. Compare counts and full-row aggregate
fingerprints. Preserve the private archive and sanitized receipts outside Git. A [pinned synthetic
rehearsal](../scripts/checks/legacy-progress-cleanup-rehearsal.py) is separate evidence and accepts
only its original local archive and socket. Never substitute production bytes.

Apply through the normal integration from merged main after all gates pass. The migration uses
one transaction, a one-second lock timeout, a twenty-second statement timeout and `DROP COLUMN
RESTRICT`. Lock acquisition can time out, and unexpected dependent database objects abort the
transaction. Before deployment, verify that supported deployed readers no longer select the
retired columns. After deployment, verify the ledger, affected catalogs, normalized reads/saves,
team progress, prestige and backup/import. Physical reclamation
requires separate low-traffic maintenance authorization, headroom and a lock/outage plan.

### Durable leave and kick cooldown rollout (#1031)

Verify the migration ledger, preservation triggers, private-table RLS/client denial and unchanged
RPC signatures and service-role grants. Confirm leave/disband/rejoin and kick/disband/recreate
still return 429 during the same-mode window, a missing target returns 404 without spending it,
and the other mode is independent. A failed transaction leaves the old schema intact. Recover
with a reviewed forward migration that preserves existing cooldown rows and permissions.
See [team cooldown invariants](systems/teams.md).

## Owner-only team expiry rollout

See [team invariants](systems/teams.md) for the hourly job, eligibility, 100-team atomic batches and
168-hour warnings. Treat both gates as off until observed. Use isolated QA to test owner warning
dates across devices/modes, join cancellation, a new clock after the last member leaves, and
disband fallback with other-mode teams and personal progress intact.

1. Verify the warning UI is live first. With separate grant approval, give the observer only
   `USAGE` on `private` and `SELECT` on `private.owner_only_team_cleanup_status`.
   Run `scripts/ops/prod-db canary` and `scripts/ops/prod-db owner-only-teams`; check both gates,
   aggregate receipts, runtime and errors. The telemetry canary alone cannot verify this view.
2. With explicit approval, call `private.begin_owner_only_team_warnings()` while deletion remains
   disabled. Confirm activation, job state and initialization receipts. Each existing solo team
   gets its own full warning clock when initialized.
3. After a full 168 hours of verified warning availability, repeat acceptance and inspect
   `cron.job_run_details` and batch receipts. Enabling `deletion_enabled` requires separate
   approval. Both the team deadline and the global warning floor must pass. Investigate
   inconsistent teams and repeated failed batches. The 100-row mutation cap does not cap scans.
4. Disable deletion to stop future disbands, or unschedule the job to pause all batches. The
   settings lock lets an in-flight batch finish atomically. A failed batch has no receipt.
   Preserve clocks. After interrupted warning availability, restore the UI and get approval
   to restart only the global clock. Wait another 168 hours before re-enabling deletion.

A flag cannot restore expired team rows/events. Use approved recovery if needed. Preserve the
account-deletion whole-transaction retry behavior for `55P03`.

## Production database observer

Use `scripts/ops/prod-db` for sanitized, read-only diagnostics. The
[observer spec](systems/prod-db-observer.md) owns credential isolation, TLS, target checks,
permissions, timeouts and the output contract. Keep the role free of writes, DDL, privileged role
inheritance and reachable large-object creation. A read-only transaction default is not the
permission boundary. Provision only separately authorized grants. The migration-history check
needs `USAGE` on `supabase_migrations` and column-level `SELECT (version)` on its ledger only.

```sh
PROD_DB_TARGET=local scripts/ops/prod-db health
scripts/ops/prod-db canary
scripts/ops/prod-db table-stats
scripts/ops/prod-db migration-history
scripts/ops/prod-db preflight --migration <reviewed-migration-path>
```

Use a verified direct/session connection with `sslmode=verify-full`, a mode-`0600` gitignored
env file, and explicit `PROD_DB_ENV_FILE` in the shell when overriding it. Keep credentials out
of command history and logs. Verify the canary after provisioning before enabling automation.
Do not automate production role provisioning or the production canary in migrations.

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

### Browser progress authority rollback

After this release, IndexedDB `tarkovtracker-active-progress-v1` owns browser progress. The
`v2_progress` localStorage copy is imported once and then only observed, so it is stale after the
first edit. See [browser progress authority](systems/progress-storage.md#browser-progress-authority).

- Fix forward. Prefer a repair release that still reads IndexedDB; revert later changes, not this
  reader.
- Do not redeploy a pre-#1092 frontend as routine rollback. It reads the stale localStorage copy:
  guest edits made since the release disappear, and signed-in tabs can sync stale local state.
- If an old-code rollback is unavoidable, first announce that users should open Settings →
  Backup & Restore and use "Export locally saved device data and recovery copies". After the
  IndexedDB release returns, edits made by old code appear only as older-tab recovery copies in
  that card; users restore them from there.
- Verify a release by editing in two tabs, reloading both and confirming the edit persists with
  no recovery warning.

### Combined task cache contract rollout (v2 to v3)

Historical release #826 combined progression and overlay provenance in envelope
format 2, superseding the incompatible standalone #825 writer. That rollout used
48 `tasks-core-json-v3-*` language/mode entries and
`overlay-precompute-manifest-json-v3`. These are historical keys. Current neutral
readers use the complete release below. Reusing an old writer for a current
snapshot namespace can replace a newer contract, so rollback always requires the
matching reviewed producer and snapshots still inside their retention window.

### Language-neutral catalog rollout (#1065)

The production release contains 46 neutral objects across 30 mode catalogs, 3 counts views, and 13 language bundles,
plus three independently validated whole English import snapshots. Follow the
[producer-before-consumer order](./systems/overlay-and-precompute.md#release-order).

1. Release the overlay's `overlay-neutral.json` sidecar alongside `overlay.json`.
   Verify both digests and that the sidecar's `$source` names the legacy artifact.
2. Merge the reviewed Tracker producer while the deployed consumer keeps its old
   contract. The initial migration runner writes both legacy and neutral catalogs.
3. Read the intended published overlay's `$meta.sha256`, then dispatch
   `precompute-tarkov-data.yml` on `main` with that `expectedOverlaySha` and both
   `lang` and `gameMode` empty. The production-precompute environment owns the KV
   edit and private overlay read credentials. A changed published SHA requires a
   new approved full run before promotion.
4. Require successful storage/readback for every immutable object, the exact 43
   scopes in `catalogRelease`, its matching `overlaySha`, and successful results
   for all three English imports. Retain the workflow run and diagnostic artifact.
   A filtered run, preview namespace, or older localized manifest cannot satisfy
   this gate.
5. Promote the consumer after the complete production manifest is available.
   Supply the private overlay read token through the `OVERLAY_TOKEN` process
   environment or a secret store. `pnpm run verify:overlay` must report all 46 scopes current and three current
   imports. It checks raw response digest/length, release timestamp, precompute
   source, cache policy, and overlay identity, retrying one concurrent release
   change. A `STALE` fallback does not certify the active release.
6. Wait at least 90 seconds after the successful producer readback, then confirm
   the same release is still active. If it changed, verify the new release and
   restart the wait. Purge browser metadata with **Purge Game Data**, then
   measure the uncached language switch and return to a fresh cached language.
   Require one `strings` request and zero game-data requests respectively. Check
   mode-specific objective translations with stable task/objective IDs. Retain
   production evidence before closing the issue.
7. Retire the legacy localized writer after promotion and verification. Preserve
   the whole English import producer. Rollback must use a compatible reviewed
   application and complete snapshots whose seven-day retention has not expired.

### EFT import snapshot rollout (#1161)

The retained import contract serves only
`tasks-import-json-v1-en-{regular,pve,pvp-season}`. Each envelope uses format 2,
contains a complete English task catalog with its own mode, and includes overlay
identity and `storedAt`. The endpoint validates progress-critical task/objective
shape, scope, and bounded age before serving it. Missing, corrupt, wrong-mode, or
expired snapshots return 503.

For an incompatible import contract, land its reviewed producer before promoting
the consumer. Verify all three target envelopes in the selected namespace, their
expected overlay SHA, fresh storage time, and whole catalog shape. A current
neutral manifest alone cannot establish import readiness. An English-only
maintenance refresh can update imports, but leaves the neutral manifest unchanged.
Use the unfiltered run for the combined language-neutral release so the 46 neutral
scopes and all imports carry the intended source-overlay identity.

After deployment, all three `tasks-import?gameMode=` requests must return 200 and
`pnpm run verify:overlay` must certify their whole-catalog scope, provenance, and
response headers. Supply `OVERLAY_TOKEN` through the environment or secret store.
The previous #1161 rollout's `json-v3` objective fallback described an older
application. Current rollback decisions require the actual compatible reader and
retained snapshot contract rather than those retired request-path assumptions.

### Retired automatic-level cleanup

The automatic-level removal migration is schema only. New clients and database writes discard
`xpOffset` while keeping each mode's saved level. Cached automatic clients cannot overwrite an
existing level until refresh, except through an intentional newer reset epoch. Refresh clients
before validating manual level editing. See [manual player levels](systems/progress-storage.md#manual-player-levels).

Production JSON offsets were removed by bounded maintenance on 2026-10-12, and a read-only
sweep of the full user range found no remaining `xpOffset` in `user_progress`,
`user_game_mode_progress`, `user_profile_mode_progress`, or `user_prestige_runs`. The one-off
cleanup script has been retired ([#1168](https://github.com/tarkovtracker-org/TarkovTracker/issues/1168));
recover it from git history only after re-reviewing its lock order against Realtime and auth.
Frontend rollback to an automatic-level client is unsupported because offsets are no longer
authoritative.
