# TarkovTracker

A comprehensive Escape from Tarkov progress tracker built with Nuxt 4, featuring team collaboration, dual game mode support (PvP/PvE), and real-time synchronization via Supabase.

## Features

- **Dual Game Mode Support**: Track progress separately for PvP and PvE modes
- **Team Collaboration**: Share progress with teammates in real-time
- **Task Tracking**: Monitor quest completions and objectives
- **Hideout Progress**: Track module upgrades and parts
- **Player Level Progress**: Monitor leveling across different factions
- **Real-time Sync**: Automatic synchronization via Supabase
- **Multi-language Support**: Available in English, German, Spanish, French, Russian, Ukrainian, and Chinese

## Tech Stack

- **Framework**: Nuxt 4 (SPA mode)
- **UI**: Nuxt UI component library
- **Styling**: Tailwind CSS v4
- **State Management**: Pinia with three-store architecture
- **Backend**: Supabase (authentication, database, real-time)
- **API**: Nuxt server-side proxy to tarkov.dev GraphQL API
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
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anonymous_key

# Optional: API gateway URLs (for team features)
# NUXT_PUBLIC_TEAM_GATEWAY_URL=
# NUXT_PUBLIC_TOKEN_GATEWAY_URL=

# Optional: App configuration
# NUXT_PUBLIC_APP_URL=http://localhost:3000
```

## Cloudflare Workers

The project uses two Cloudflare Workers, each with a Durable Object binding for rate limiting:

- `workers/api-gateway` — API request gateway
  - `API_GATEWAY_LIMITER` (Durable Object)
- `workers/team-gateway` — Team feature gateway
  - `TEAM_GATEWAY_LIMITER` (Durable Object)

## Server API Runtime Notes

- `app/server/api/team/members.ts` uses in-memory Maps for response caching and rate limiting.
- `app/server/api/profile/[userId]/[mode].get.ts` uses in-memory Maps `sharedProfileRateLimiter` and `sharedProfileCache`.
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

# Lint code
npm run lint

# Run tests
npm test

# Type check
npm run typecheck

# Check for dependency updates
npm run deps
```

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
- `app/server/api/` - Nuxt server routes for API proxying
- `workers/` - Cloudflare Workers (api-gateway, team-gateway)
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
