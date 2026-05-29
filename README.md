# TarkovTracker

[![Crowdin](https://badges.crowdin.net/tarkovtrackerorg/localized.svg)](https://crowdin.com/project/tarkovtrackerorg)

A comprehensive Escape from Tarkov progress tracker built with Nuxt 4, featuring team collaboration, dual game mode support (PvP/PvE), and real-time synchronization via Supabase.

## Features

- **Dual Game Mode Support**: Track progress separately for PvP and PvE modes
- **Team Collaboration**: Share progress with teammates in real-time
- **Task Tracking**: Monitor quest completions and objectives
- **Hideout Progress**: Track module upgrades and parts
- **Player Level Progress**: Monitor leveling across different factions
- **Real-time Sync**: Automatic synchronization via Supabase
- **Multi-language Support**: Available in English, German, Spanish, French, Russian, Ukrainian, and Chinese. API data can be fetched in additional tarkov.dev-supported languages. Community translations are available through [translate.tarkovtracker.org](https://translate.tarkovtracker.org).

## Tech Stack

- **Framework**: Nuxt 4 (SPA mode)
- **UI**: Nuxt UI component library
- **Styling**: Tailwind CSS v4
- **State Management**: Pinia with three-store architecture
- **Backend**: Supabase (authentication, database, real-time)
- **API**: Nuxt server-side proxy to json.tarkov.dev static data
- **Deployment**: Cloudflare Pages

## Setup

Install dependencies:

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Required for login/sync features
NUXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NUXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anonymous_key

# Optional: App configuration
# NUXT_PUBLIC_APP_URL=http://localhost:3000
# NUXT_TARKOV_JSON_BASE_URL=https://json.tarkov.dev
# NUXT_PUBLIC_ALLOW_DIRECT_TOKEN_CREATE_FALLBACK=false
# NUXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
# NUXT_PUBLIC_CLARITY_PROJECT_ID=xxxxxxxxxx
```

`NUXT_PUBLIC_APP_URL` only sets the public app/canonical URL. `NUXT_PUBLIC_GA_MEASUREMENT_ID`
and `NUXT_PUBLIC_CLARITY_PROJECT_ID` only enable the Google Analytics and Microsoft Clarity
integration codepaths; they do not start tracking by themselves. Tracking stays disabled until the
user explicitly opts in through the analytics consent banner or footer "Analytics Preferences"
control. That opt-in state is managed in `app/composables/useAnalyticsConsent.ts`, and
`app/plugins/04.analytics-consent-mode.client.ts` keeps analytics consent mode denied until the
user accepts.

`NUXT_PUBLIC_ALLOW_DIRECT_TOKEN_CREATE_FALLBACK` is disabled by default and should stay off in
production. It exists only for controlled local/self-hosted or staggered rollout cases where the
`token-create` Edge Function is temporarily unavailable and you intentionally accept bypassing
function-level rate limiting for token creation.

## Cloudflare Workers

The project uses one Cloudflare Worker for the public API surface:

- `workers/api-gateway` — API request gateway
  - `API_GATEWAY_LIMITER` (Durable Object)

## Server API Runtime Notes

- `app/server/api/team/members.ts` uses in-memory Maps for response caching and rate limiting.
- `app/server/api/profile/[userId]/[mode].get.ts` uses in-memory Maps `sharedProfileRateLimiter` and `sharedProfileCache`.
- Team and token mutations are rate-limited inside Supabase Edge Functions on a per-user basis.
- In-memory Maps are local to each running instance and are not shared across serverless/horizontal deployments.
- For production-wide consistency across both endpoints, use a distributed backend (for example Redis or Cloudflare KV)
  for rate limiting and caching.

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Code Quality

```bash
# Format code (Prettier + ESLint)
npm run format

# Validate Supabase migrations locally
npm run supabase:check

# Lint code
npm run lint

# Run tests
npm test

# Type check
npm run typecheck

# Check for dependency updates
npm run deps
```

## Tarkov.dev Profile Cleanup

The app now persists only the linked `tarkovUid` for tarkov.dev profiles. Legacy manual backups
created before this cleanup may still contain imported profile snapshots. New imports ignore those
legacy blobs, but regenerate backups after upgrading if you want future exports to be fully scrubbed.

## Production

Build for production:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

## Project Structure

- `app/` - Main application source directory
- `app/features/` - Feature-specific components organized by domain
- `app/components/` - Global/shared UI components
- `app/stores/` - Pinia stores for state management
- `app/composables/` - Reusable composition functions
- `app/pages/` - File-based routing
- `app/server/api/` - Nuxt server routes for API proxying and app APIs
- `app/shell/` - Shared app chrome components
- `app/utils/` - Client/shared utilities
- `workers/` - Cloudflare Workers (api-gateway)
- `docs/` - Project documentation and migration guides

## Documentation

For detailed development guidelines, architecture references, and migration progress, see the files in the [`docs/`](docs/) directory.

This repository includes both **contribution workflow guidance** and **technical documentation**. 

[**How to Contribute (Issues, Branches, PR Process):**](.github/CONTRIBUTING.md) Open or pick an issue, get assigned, create a focused branch, Use the PR template, and link the issue.

> [!IMPORTANT]
> Each pull request must address **one change only** — a single fix, update, documentation improvement, or new feature.  
> Pull requests that bundle unrelated changes may be asked to split or be closed.

[**Label System:**](.github/LABELS.md) Issue Types define the kind of work being done, while labels communicate scope, priority, ownership, and status throughout the lifecycle of the issue.

[**GitHub Project Board:**](.github/PROJECT_BOARD.md) Issues progress through the board from backlog to completion, with transitions driven by issue and pull request activity.

#### Where to start (new contributors)

> [!NOTE]
> If you’re new to the project, look for issues labeled **`good-first-issue`**. These are intentionally scoped to be approachable and are the best way to get familiar with the codebase, contribution process, and review expectations.

## License

This project remains licensed under the GNU General Public License v3.0. See [LICENSE.md](LICENSE.md) for the full license text.
