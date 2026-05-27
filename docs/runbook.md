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
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (auto-injected in hosted Supabase)
- `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_SUPPORTER_ROLE_ID` for role sync
  (per-tier role IDs `DISCORD_SCAV_ROLE_ID` / `DISCORD_TIMMY_ROLE_ID` / `DISCORD_CHAD_ROLE_ID`
  are optional)

## Optional Environment Variables

- `NUXT_LOG_SINK_URL` — centralized server logs (Sentry/Datadog/HTTP collector)
- `NUXT_PUBLIC_CLIENT_LOG_SINK_URL` — browser error forwarding (default `/api/logs/client`)
- `NUXT_PUBLIC_LOG_LEVEL` — client log level (debug, info, warn, error)
- `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`
- `NUXT_TEAM_MEMBERS_CACHE_TTL_MS`
- `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`
- `NUXT_SHARED_PROFILE_CACHE_TTL_MS`

## Pre-Deploy Validation

1. `npm run format`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run supabase:check`
6. `npm run build`
7. `npm audit --omit=dev`
8. For the tarkov.dev profile cleanup rollout, snapshot `public.user_progress` before applying the
   destructive cleanup migration.

## Deployment

1. Merge to `main` and verify CI workflow `Validate`, `Supabase DB`, and `Workers` jobs are green.
2. Confirm Cloudflare Pages and Cloudflare Workers Git deployments completed for `main`.
3. Confirm workers are serving the expected revision:
   - `workers/api-gateway`
4. Smoke test:
   - `https://tarkovtracker.org`
   - `https://api.tarkovtracker.org/health`
5. If the tarkov.dev profile cleanup migration shipped, note that old manual backups may still
   contain historic imported profile snapshots until users regenerate them.

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
3. If API protection blocks valid traffic, update `API_ALLOWED_HOSTS` and redeploy.
