# TarkovTracker Roadmap

Living roadmap for maintainers and agents. Either may update it; keep entries verifiable against the current codebase and drop items once done.

## Now / next

- Harden Team System (Supabase Realtime) and the Cloudflare Workers API gateway (`app/stores/useTeamStore.ts`, `workers/api-gateway/`, `app/server/api/team/`).
- Reduce first-visit loading jank around caching/fetching (`app/app.vue`, `app/stores/useTarkov.ts`, `app/composables/`).
- Consolidate task / needed-item filtering so hidden tasks can't leak counted items (`app/stores/taskAvailability.ts`, needed-items views).
- Improve offline/error feedback for network and sync failures (toast + retry paths, no silent stalls).
- Evaluate whether any legacy progress-import path (`.io` / `.org`) is still needed; remove or fix it.

## Ideas / later

- PWA mode for offline tracking and notifications (no PWA module in `nuxt.config.ts` today).
- Raid analytics and gear recommendations based on user feedback.
- Richer usage/performance insight beyond the existing activity log (`app/stores/useActivityLogStore.ts`, `app/server/api/logs/client.post.ts`).

## Done (removed from active list)

- Public API hosting decision: Cloudflare Workers gateway exists (`workers/api-gateway/`).
- Supporter / sponsorship via Stripe exists (`app/pages/supporter.vue`, `app/server/api/stripe/`).
- CI/CD pipelines exist (`.github/workflows/ci.yml`, `pr-checks.yml`).
- i18n with Crowdin automation exists (`.github/workflows/crowdin.yml`, `pnpm run i18n:check`).
- Code style enforced via ESLint/Prettier (`pnpm run lint`, `pnpm run format:check`).
