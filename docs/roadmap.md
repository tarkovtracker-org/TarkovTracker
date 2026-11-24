# TarkovTracker Roadmap

Living roadmap for maintainers and agents. Either may update it; keep entries verifiable against the current codebase and drop items once done.

## Now / next

- Harden [team Realtime](systems/teams.md) and the [separately owned API gateway](api-ownership.md).
- Reduce first-visit loading jank around caching/fetching ([game data](systems/game-data.md), [frontend runtime](systems/frontend.md)).
- Consolidate task / needed-item filtering so hidden tasks can't leak counted items (`app/stores/taskAvailability.ts`, needed-items views).
- Improve offline/error feedback for network and sync failures (toast + retry paths, no silent stalls).
- Evaluate whether any legacy progress-import path (`.io` / `.org`) is still needed; remove or fix it.

## Data and progress

- Build one overlay-corrected, mode-aware canonical model and immutable KV release for UI projections and progress rules. Validate schemas, references and read-back before activating a pointer. Retain the previous release for rollback, keep active/previous artifacts from expiring, and preserve scheduled failure reporting and manual controls. Supabase remains the mutable progress authority.
- Finish compiling branch edges from completion-triggered `failConditions`. Keep the remaining `alternatives` compatibility cleanup separate. Use the same engine across the browser, shared-profile/streamer paths, and Worker.
- In the [API repository](api-ownership.md), consume compact rules by mode from the same release, with previous-release fallback and memory as a secondary cache. Remove runtime upstream reads only after canary/parity checks with release IDs, CPU and latency evidence.
- Re-audit API auth/tier, progress and team round trips and atomic task/objective commands against the current browser sync RPCs. Keep usage asynchronous, derive invalid/branch state at read time, and preserve offline clocks, reset epochs and concurrent writer semantics.
- Benchmark CI formatter and PR metadata setup separately before changing install behavior. Keep CodeQL and full main validation.

## Ideas / later

- PWA mode for offline tracking and notifications (no PWA module in `nuxt.config.ts` today).
- Raid analytics and gear recommendations based on user feedback.
- Richer usage/performance insight beyond the existing activity log (`app/stores/useActivityLogStore.ts`, `app/server/api/logs/client.post.ts`).

## Done (removed from active list)

- Supporter / sponsorship via Stripe exists (`app/pages/supporter.vue`, `app/server/api/stripe/`).
- CI/CD pipelines exist (`.github/workflows/ci.yml`, `pr-checks.yml`).
- i18n with Crowdin automation exists (`.github/workflows/crowdin.yml`, `pnpm run i18n:check`).
- Code style enforced via ESLint/Prettier (`pnpm run lint`, `pnpm run format:check`).
