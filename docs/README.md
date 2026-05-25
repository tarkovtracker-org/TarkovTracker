# TarkovTracker Documentation

This is the consolidated source of truth for the TarkovTracker Nuxt 4 application.

## 1. Project Standards & Philosophy

- **Framework**: Nuxt ^4.4.2 (SPA mode, `app/` directory, Node >=24.12.0).
- **Frontend**: Vue 3 SFCs (`<script setup lang="ts">`), Pinia state, @nuxt/ui v4, Tailwind CSS v4.
- **Backend**: Supabase (Auth, DB, Realtime) + Cloudflare Workers (public API gateway).
- **Styling**: Strictly use Tailwind v4 theme layer (`@theme {}`). No hex colors or legacy UI patterns.
- **Design Contract**: [`DESIGN.md`](../DESIGN.md) documents the agent-facing visual system
  and can be validated with `npm run design:lint`.
- **Philosophy**: Pragmatic flat structure. Shallow nesting (e.g., [`app/shell/`](../app/shell/)). Avoid unnecessary abstractions.
- **Conventions**: 2-space indent, 100-char width. Group imports (builtin → external → internal). Use `@/` aliases.

## 2. Architecture & Directory Structure

- [`app/app.vue`](../app/app.vue): Global providers and minimal app-wide initialization.
- [`app/layouts/`](../app/layouts/): Composition of structural shell components.
- [`app/shell/`](../app/shell/): "Chrome" components (AppBar, NavDrawer, AppFooter).
- [`app/features/`](../app/features/): Domain-specific logic slices (admin, dashboard, drawer,
  hideout, maps, neededitems, profile, settings, storyline, streamer-tools, supporter, tasks, team).
- [`app/stores/`](../app/stores/): Pinia domain stores with localStorage persistence and Supabase sync.
- [`app/server/api/`](../app/server/api/): Nitro routes for app APIs plus proxying and caching
  `json.tarkov.dev` static data.
- [`app/server/middleware/`](../app/server/middleware/): Nitro API protection middleware.
- [`app/server/utils/`](../app/server/utils/): Server-side cache, request, and data helpers.
- [`workers/api-gateway/`](../workers/api-gateway/): Cloudflare Worker public API gateway.

## 3. Key Feature Architectures

- **Team System**: Supabase Edge Functions handle team/token mutations with per-user rate limits. Real-time updates via Supabase Broadcast (<200ms). Teammate profiles are fetched via a Nitro server route using service roles to bypass RLS.
- **XP & Level System**: Dynamic calculation from tasks. Stores `xpOffset` (difference between calculated and actual XP) to maintain accuracy across manual adjustments.
- **Tarkov.dev Linking**: The app persists one linked `tarkovUid`. Import destination mode is chosen at import time and is not stored as durable account metadata. Imports accept a full `tarkov.dev/players/{regular|pve}/{uid}` profile URL, fetch the public `players.tarkov.dev/profile/{uid}.json` payload through a no-store, rate-limited server route, then parse it with the same profile parser. Refetch uses the saved UID plus a user-selected profile mode because PvP, PvE, and future Arena profiles share the same account id but use different tarkov.dev routes. Unlink clears only the UID and leaves imported tracker data intact. The preview exposes parsed skill-id and level pairs behind a collapsed detail view.
- **i18n**: 7 enabled UI locales are defined in [`app/utils/locales.ts`](../app/utils/locales.ts)
  and loaded from [`app/locales/*.json`](../app/locales/). Extra locale JSON files may exist for
  Crowdin/API work but are not enabled until added to `SUPPORTED_LOCALES`. Missing keys fallback to
  raw strings. Community translation links can use
  [`translate.tarkovtracker.org`](https://translate.tarkovtracker.org), a CNAME-backed Crowdin
  subdomain.

## 4. Security & Operations

- **Security**: Origin-check middleware (`tarkovtracker.org`) + per-user mutation rate limiting in Supabase Edge Functions. Public profile routes use lightweight per-client rate limits, with Cloudflare as the outer abuse-control layer. HMAC signing for critical endpoints.
- **Commands**: `npm run dev` (dev), `npm run build` (prod), `npm run test` (unit tests),
  `npm run lint` (lint + design lint), `npm run typecheck` (Nuxt/Vue TS), `npm run supabase:check`
  (local migration reset + lint), `npm run test:api-gateway` (Worker tests).
- **Runbook**: [`docs/runbook.md`](./runbook.md) contains required env vars, deploy checks, and incident recovery.
- **Deployment**:
  - Frontend: Automated via Cloudflare Pages on push.
  - Functions: `supabase functions deploy [name]`.
  - Public API worker: `cd workers/api-gateway && npx wrangler deploy`.
- **Release Note**: Legacy manual backups created before the tarkov.dev profile cleanup may still contain old imported profile snapshots. New imports ignore them, but users who want fully scrubbed backup files should regenerate exports after upgrading.
- **Troubleshooting**: Check Supabase Dashboard for Edge Function logs and Cloudflare logs for the public API worker.

--- DO NOT TOUCH ANY OF THIS FILE CONENT BELOW HERE, IT IS MANUALLY MAINTAINED ---

# PERSONAL NOTES AND THOUGHTS, IDEAS, etc.

- Finish implementing Team System (Supabase Realtime) and Cloudflare Workers.
- Figure out the best way to handle the open source API from the original TarkovTracker project and if there is better alternatives to NodeJS / Express for that service.
- Finish fixing the Settings page UI/UX and ensure ALL settings are visible to unauthenticated users while restricting what they can and cant do.
- Improve the i18n system to allow for easier translations and community contributions.
- Explore adding a PWA mode for offline tracking and notifications.
- Consider adding a donation or sponsorship system to help fund server costs.
- Regularly review and update dependencies to ensure security and performance.
- Audit the codebase for performance bottlenecks and optimize as needed.
- Plan for future features like raid analytics, gear recommendations, and more based on user feedback.
- Keep documentation up to date with any architectural changes or new features.
- Fix the initial loading performance issues as currently while loading the app it freezes for a few seconds before becoming responsive showing a blank white screen while caching and fetching data for the first visit.
- Try to find ways to consolidate the core API data and filtering logic to prevent issues like a task being filtered out of the users view but the needed items still being dispalyed and counted.
- Look into implementing better error handling and user feedback for network issues or data sync problems.
- Find out if the data migration system is still needed or if it can be refactored / reworked to work properly without potentially corrupting user data on import from .io or .org versions.
- Explore adding more detailed logging and analytics to track user behavior and app performance.
- Finish organizing the codebase to make it easier for new contributors to understand and navigate and maintain long term.
- Remove excess comments and dead code to clean up the codebase.
- Reduce abstractions, unnecessary composables, and over-engineering to simplify the codebase.
- Refactor large files into smaller, more manageable modules.
- Standardize coding styles and conventions across the codebase.
- Improve test coverage to ensure reliability and catch regressions early.
- Set up continuous integration and deployment (CI/CD) pipelines for automated testing and deployment.
- Regularly review and update the documentation to reflect the current state of the project.
  --- DO NOT TOUCH ANY OF THIS FILE CONENT ABOVE HERE, IT IS MANUALLY MAINTAINED ---
