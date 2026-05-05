# Production Runbook

## Required Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`) for server profile/team routes
- `NUXT_PUBLIC_APP_URL`
- `API_ALLOWED_HOSTS` (production host allowlist)
- `API_TRUST_PROXY` only when overriding proxy auto-detection (forwarded headers are trusted
  only when `API_TRUST_PROXY=true` or `NITRO_PRESET` is explicitly set to a `cloudflare*`
  preset)

## Optional Environment Variables

- `LOG_SINK_URL` for centralized server logs (Sentry/Datadog/HTTP collector)
- `NUXT_PUBLIC_CLIENT_LOG_SINK_URL` for browser error forwarding (default `/api/logs/client`)
- `TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`
- `TEAM_MEMBERS_CACHE_TTL_MS`
- `SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`
- `SHARED_PROFILE_CACHE_TTL_MS`

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
   - external sink delivery status (`LOG_SINK_URL`)

## Recovery Actions

1. If Supabase is degraded, temporarily raise cache TTLs:
   - `TEAM_MEMBERS_CACHE_TTL_MS`
   - `SHARED_PROFILE_CACHE_TTL_MS`
2. If profile/team endpoints are under abuse, lower rate limits:
   - `TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`
   - `SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`
   - For `/api/tarkov-dev/profile`, add or tighten a Cloudflare rule; the app route also has a fixed per-IP limiter.
   - Cache API-backed shared rate limits are best-effort under concurrent bursts; use Cloudflare or Durable Objects for hard enforcement.
3. If API protection blocks valid traffic, update `API_ALLOWED_HOSTS` and redeploy.
