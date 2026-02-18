# TarkovTracker Documentation

This is the consolidated source of truth for the TarkovTracker Nuxt 4 application.

## 1. Project Standards & Philosophy

- **Framework**: Nuxt ^4.2.1 (SPA mode, `app/` directory, Node 22).
- **Frontend**: Vue 3 SFCs (`<script setup lang="ts">`), Pinia state, @nuxt/ui v4, Tailwind CSS v4.
- **Backend**: Supabase (Auth, DB, Realtime) + Cloudflare Workers (Gateway).
- **Styling**: Strictly use Tailwind v4 theme layer (`@theme {}`). No hex colors or legacy UI patterns.
- **Philosophy**: Pragmatic flat structure. Shallow nesting (e.g., [`app/shell/`](../app/shell/)). Avoid unnecessary abstractions.
- **Conventions**: 2-space indent, 100-char width. Group imports (builtin → external → internal). Use `@/` aliases.

## 2. Architecture & Directory Structure

- [`app/app.vue`](../app/app.vue): Global providers and minimal app-wide initialization.
- [`app/layouts/`](../app/layouts/): Composition of structural shell components.
- [`app/shell/`](../app/shell/): "Chrome" components (AppBar, NavDrawer, AppFooter).
- [`app/features/`](../app/features/): Domain-specific logic slices (tasks, team, hideout, maps).
- [`app/stores/`](../app/stores/): Pinia domain stores with localStorage persistence and Supabase sync.
- [`app/server/api/`](../app/server/api/): Nitro routes proxying and caching `tarkov.dev` GraphQL data.

## 3. Key Feature Architectures

- **Team System**: Gateway-tier architecture (Cloudflare Worker + Supabase Edge Functions). Real-time updates via Supabase Broadcast (<200ms). Teammate profiles fetched via server route using service roles to bypass RLS.
- **XP & Level System**: Dynamic calculation from tasks. Stores `xpOffset` (difference between calculated and actual XP) to maintain accuracy across manual adjustments.
- **i18n**: 6 languages managed in [`app/locales/*.json5`](../app/locales/). Missing keys fallback to raw strings.

## 4. Security & Operations

- **Security**: Origin-check middleware (`tarkovtracker.org`) + Gateway rate limiting (IP+User). HMAC signing for critical endpoints.
- **Commands**: `npm run dev` (dev), `npm run build` (prod), `npx vitest` (test), `npm run lint` (lint).
- **Runbook**: [`docs/runbook.md`](./runbook.md) contains required env vars, deploy checks, and incident recovery.
- **Deployment**:
  - Frontend: Automated via Cloudflare Pages on push.
  - Functions: `supabase functions deploy [name]`.
  - Gateway: `cd workers/team-gateway && npx wrangler deploy`.
- **Troubleshooting**: Check Supabase Dashboard for Edge Function logs. Gateway implements retries with exponential backoff for cold starts (1-3s).

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
