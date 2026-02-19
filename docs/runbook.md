# Production Runbook

## Required Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`) for server profile/team routes
- `NUXT_PUBLIC_APP_URL`
- `API_ALLOWED_HOSTS` (production host allowlist)
- `API_TRUST_PROXY=true` when running behind Cloudflare

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
5. `npm run build`
6. `npm audit --omit=dev`

## Deployment

1. Merge to `main` and verify CI workflow `Validate` and `Workers` jobs are green.
2. Confirm Deploy workflow published Cloudflare Pages artifact successfully.
3. Confirm workers deployed:
   - `workers/api-gateway`
   - `workers/team-gateway`
4. Smoke test:
   - `https://tarkovtracker.org`
   - `https://api.tarkovtracker.org/health`

## Incident Triage

1. Check Cloudflare Pages deployment logs for failed build or missing secrets.
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
3. If API protection blocks valid traffic, update `API_ALLOWED_HOSTS` and redeploy.
