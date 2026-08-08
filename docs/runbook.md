# Production Runbook

## Required Environment Variables

Naming: `NUXT_*` = Nuxt private (server-only), `NUXT_PUBLIC_*` = Nuxt public (browser-exposed).

**Nuxt app (set in Cloudflare Pages):**

- `NUXT_PUBLIC_SUPABASE_URL` — Supabase project URL (`SUPABASE_URL` also works as fallback)
- `NUXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (`SUPABASE_ANON_KEY` also works)
- `NUXT_SUPABASE_SERVICE_KEY` — Supabase service role key
- `NUXT_PUBLIC_APP_URL` — Application URL (`APP_URL` / `CF_PAGES_URL` also work)
- `API_ALLOWED_HOSTS` — production host allowlist
- `API_TRUST_PROXY` — only when overriding proxy auto-detection (forwarded headers are trusted
  only when `API_TRUST_PROXY=true` or `NITRO_PRESET` is explicitly set to a `cloudflare*`
  preset)

### Stripe checkout (Nuxt server)

- `STRIPE_SECRET_KEY` for the Nuxt `/api/stripe/checkout` route to create Checkout Sessions.
- `STRIPE_PRICE_SCAV_MONTHLY`, `STRIPE_PRICE_SCAV_6MONTH`, `STRIPE_PRICE_SCAV_YEARLY`
- `STRIPE_PRICE_TIMMY_MONTHLY`, `STRIPE_PRICE_TIMMY_6MONTH`, `STRIPE_PRICE_TIMMY_YEARLY`
- `STRIPE_PRICE_CHAD_MONTHLY`, `STRIPE_PRICE_CHAD_6MONTH`, `STRIPE_PRICE_CHAD_YEARLY`

### Stripe webhook (Supabase Edge Function `stripe-webhook`)

Set these in Supabase Dashboard → Project Settings → Edge Functions:

- `STRIPE_WEBHOOK_SECRET` (Stripe Dashboard → Webhooks → Signing secret)
- `STRIPE_SECRET_KEY` (Stripe Dashboard → Developers → API keys); required so refund and
  dispute events can correlate the charge back to its subscription/customer before revoking
  supporter access. The function refuses to start without it.
- `STRIPE_PRICE_SCAV_MONTHLY`, `STRIPE_PRICE_SCAV_6MONTH`, `STRIPE_PRICE_SCAV_YEARLY`
- `STRIPE_PRICE_TIMMY_MONTHLY`, `STRIPE_PRICE_TIMMY_6MONTH`, `STRIPE_PRICE_TIMMY_YEARLY`
- `STRIPE_PRICE_CHAD_MONTHLY`, `STRIPE_PRICE_CHAD_6MONTH`, `STRIPE_PRICE_CHAD_YEARLY`; the
  webhook uses these IDs as the source of truth when a customer changes plans in Stripe's portal.
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (auto-injected in hosted Supabase)
- `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_SUPPORTER_ROLE_ID` for role sync
  (per-tier role IDs `DISCORD_SCAV_ROLE_ID` / `DISCORD_TIMMY_ROLE_ID` / `DISCORD_CHAD_ROLE_ID`
  are optional)
- `DISCORD_LINKED_ROLE_ID` for the role applied after a user links Discord from Settings.

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

- `NUXT_ACCOUNT_IP_HASH_SECRET` for the Nuxt `/api/account/activity` route. It stores an HMAC
  digest of each authenticated user's IP address, never the raw address. Use a unique, long random
  value and retain it while historical hashes need to remain comparable.

## Optional Environment Variables

- `NUXT_LOG_SINK_URL` — centralized server logs (Sentry/Datadog/HTTP collector)
- `NUXT_PUBLIC_CLIENT_LOG_SINK_URL` — browser error forwarding; disabled when unset. Set it at
  build time to `/api/logs/client` only when the edge/WAF rate limit for that path is enabled, or
  use an external collector URL.
- `NUXT_PUBLIC_LOG_LEVEL` — client log level (debug, info, warn, error)
- `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`
- `NUXT_TEAM_MEMBERS_CACHE_TTL_MS`
- `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`
- `NUXT_SHARED_PROFILE_CACHE_TTL_MS`

## Pre-Deploy Validation

1. `pnpm run format:check`
2. `pnpm run lint`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run supabase:check`
6. `pnpm run build`
7. `pnpm audit --prod`
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
   `private.active_season_ends_at()`. Verify all three functions before continuing. Existing clients
   fail closed on old-season writes during this gap instead of writing into the new season.
3. Deploy the application release that updates `ACTIVE_SEASON` in `app/utils/constants.ts`. Verify
   the app countdown and `/progress` Seasonal row selection before announcing the new season open.
4. Do not combine the database flip and application constants in one merge because their production
   deployment order is uncontrolled. Do not delete the previous season's rows.

## Deployment

Merging to `main` deploys everything automatically. Three integrations do the work — none of them
GitHub Actions — and each surfaces as a check on the merge commit:

| What                                 | Mechanism                    | Check on the merge commit     |
| ------------------------------------ | ---------------------------- | ----------------------------- |
| Frontend                             | Cloudflare Pages Git build   | `Cloudflare Pages`            |
| `api-gateway` Worker                 | Cloudflare Workers Git build | `Workers Builds: api-gateway` |
| DB migrations **and** Edge Functions | Supabase GitHub integration  | `Supabase Preview`            |

The Supabase check keeps the name `Supabase Preview` on `main`, where it targets the **production**
project rather than a preview branch. Per-PR preview deploys are intentionally disabled to avoid
per-preview billing, which is why the same check reports `skipping` on pull requests.

The steps below are therefore mostly verification. The manual commands are a fallback for when an
integration fails or is unavailable, not the normal path.

1. Merge to `main` and verify CI workflow `Validate`, `Supabase DB`, and `Workers` jobs are green.
2. Confirm the Pages project remains **fail open** so the static SPA shell still serves if the
   Functions daily quota is exhausted.
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

5. Confirm the `Cloudflare Pages`, `Workers Builds: api-gateway` and `Supabase Preview` checks all
   succeeded on the merge commit.
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
     `public.user_progress` (added by `20251205120619`), `public.supporters` (added by
     `20260714065213`), and `public.user_game_mode_progress` plus `public.team_memberships` (both
     added by `20260804043342`). Verify with
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

The repository-owned `scripts/prod-db` command is the canonical read-only production inspection
interface for agents and developers. It uses the Supabase CLI for the built-in inspection reports
and a restricted SQL library for schema and bounded data-shape reports. It always emits normalized
JSON and never applies migrations.

Use a direct database connection for `PROD_DB_URL` (`:5432`, or session-mode Supavisor when direct
IPv6 connectivity is unavailable). The transaction pooler is unsupported; the wrapper rejects a
`:6543` URL because that is the documented default transaction-pooler endpoint, even though Supavisor
can be configured differently. The credential must belong to a dedicated observer role with no
data-write or DDL privileges; the environment must not contain `service_role`, `postgres`, migration,
or Management API credentials.

```bash
PROD_DB_TARGET=local scripts/prod-db health
PROD_DB_URL='postgresql://pi_prod_observer:...@...:5432/postgres' scripts/prod-db canary
PROD_DB_URL='postgresql://pi_prod_observer:...@...:5432/postgres' scripts/prod-db table-stats
PROD_DB_URL='postgresql://pi_prod_observer:...@...:5432/postgres' scripts/prod-db preflight \
  --migration supabase/migrations/20260807_example.sql
```

Available reports include `health`, `schema`, `db-stats`, `table-stats`, `index-stats`, `traffic`,
`outliers`, `calls`, `locks`, `blocking`, `long-running`, `vacuum`, `bloat`, `role-stats`, bounded
`sample`, `distribution`, and `count`. `sample` excludes columns matching the sensitive-column
policy and is capped at 20 rows; `distribution` is capped at 50 groups. `EXPLAIN ANALYZE`, arbitrary
SQL, writes, DDL, migration commands, and unbounded row access are not supported.

`canary` is the first production validation command. It runs only health and telemetry reports:
`db-stats`, `role-stats`, `table-stats`, `index-stats`, and `outliers`. It does not sample rows,
run distributions, or execute migration preflight. Every report includes an `observation` object
with capture time, observer application name, database statistics reset time, statement statistics
reset time, and I/O statistics reset time. These reset times are required to interpret cumulative
counters.

`preflight` parses the proposed migration to identify referenced relations and operation classes,
then combines that information with production table/index, traffic, vacuum, query, lock, and
blocking reports. The result is evidence-only and must be reviewed by a human before a migration is
merged. It does not execute the migration. If the parser sees dynamic SQL, unsupported statements,
quoted identifiers, multiple statements, or any unclassified syntax, it returns
`assessment: incomplete`, `risk: unknown`, and `requires_manual_review: true`; it never treats an
unrecognized migration as safe.

Provision the observer role out of band through the Supabase SQL editor or approved database
operation. Grant only `CONNECT`, required schema/catalog visibility, and `pg_read_all_stats` as
needed. Set conservative connection defaults such as `statement_timeout`, `lock_timeout`, and
`application_name`; database privileges, not `default_transaction_read_only`, are the hard safety
boundary.

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
   - Full ownership map (Worker DO vs Edge mutation limits vs Pages vs Auth): [`RATE_LIMITING.md`](./RATE_LIMITING.md).
3. If API protection blocks valid traffic, update `API_ALLOWED_HOSTS` and redeploy.
