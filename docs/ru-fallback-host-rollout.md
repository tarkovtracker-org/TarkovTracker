# RU Fallback Host Rollout

## Goal

Restore access for users who cannot reach Cloudflare-hosted domains by standing up a non-Cloudflare fallback host for the same app.

## Scope

- Primary production host stays on Cloudflare (`tarkovtracker.org`).
- Fallback host runs the same Nuxt app on non-Cloudflare infrastructure.
- Fallback is intended for RU users during connectivity incidents.

## Fast Rollout Checklist

1. Create an ops branch for fallback deployment changes.
2. In `nuxt.config.ts`, change `nitro.preset` from `'cloudflare-pages'` to `'node-server'`.
3. Keep all existing server routes enabled (`app/server/api/**` must run on fallback).
4. Deploy to a non-Cloudflare host that supports long-running Node processes.
5. Set start command to `node .output/server/index.mjs`.
6. Set build command to `npm ci && npm run build`.
7. Configure fallback domain on a non-Cloudflare DNS/CDN path.
8. Announce fallback URL to affected users.

## Required Environment Variables

Set the same production secrets plus these host-specific values:

- `NUXT_PUBLIC_APP_URL=https://fallback.example.com`
- `API_ALLOWED_HOSTS=tarkovtracker.org,www.tarkovtracker.org,fallback.example.com`
- `API_TRUST_PROXY=true` only when the fallback platform is behind a trusted proxy

Also set existing required vars from production:

- `SUPABASE_URL` / `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SB_SERVICE_ROLE_KEY`)
- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`
- `GITHUB_TOKEN` (if changelog/contributors endpoints require it)

## Supabase Auth Updates

1. Add `https://fallback.example.com` to Auth site URL/redirect allowlist.
2. Keep existing production URLs in place.
3. Test login, logout, and OAuth callback flow on fallback before announcing broadly.

## Validation Checklist

1. Homepage loads on fallback without VPN from the affected region.
2. `GET /api/changelog` returns 200 on fallback.
3. `GET /api/tarkov/tasks-core` returns 200 on fallback.
4. Login works and profile data loads.
5. Tasks/hideout/storyline data renders (no empty-state regression).
6. Browser console has no host/CORS/auth errors.

## DNS and Traffic Strategy

1. Do not change `tarkovtracker.org` during emergency rollout.
2. Publish fallback as a separate host (example: `ru.tarkovtracker.<tld>`).
3. Link users to fallback only where needed.
4. Keep canonical production host unchanged.

## Rollback

1. Remove fallback user messaging.
2. Drain fallback traffic.
3. Revert `nuxt.config.ts` preset back to `'cloudflare-pages'` on primary branch if needed.
4. Keep fallback deployment config documented for reuse.

## Notes Specific to This Repo

- API host validation is enforced in `app/server/middleware/api-protection.ts`.
- Default production host allowlist is `tarkovtracker.org` and `www.tarkovtracker.org` when `API_ALLOWED_HOSTS` is empty.
- If fallback host is missing in `API_ALLOWED_HOSTS`, API requests can be blocked even if HTML loads.
