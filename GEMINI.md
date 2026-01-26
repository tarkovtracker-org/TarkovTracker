# Gemini Context: TarkovTracker

## Project Overview

**TarkovTracker** is a comprehensive Escape from Tarkov progress tracker built with **Nuxt 4** in **SPA mode** (Client-side only). It features dual game mode support (PvP/PvE), team collaboration via **Supabase Realtime**, and comprehensive task/hideout tracking.

### Tech Stack

- **Framework:** Nuxt 4 (`ssr: false`)
- **Language:** TypeScript
- **UI:** Nuxt UI, Tailwind CSS v4 (no SCSS/scoped styles)
- **State Management:** Pinia (Three-store architecture) + `pinia-plugin-persistedstate`
- **Backend:** Supabase (Auth, Postgres, Realtime), Cloudflare Workers (API Gateway)
- **Testing:** Vitest, Vue Test Utils, Nuxt Test Utils
- **Linting/Formatting:** ESLint, Prettier

## Architecture

### Directory Structure

- `app/` - Main source code
  - `features/` - Domain slices (admin, dashboard, hideout, maps, neededitems, settings, tasks, team, traders)
  - `stores/` - Pinia stores (`useMetadata`, `useProgress`, `usePreferences`)
  - `composables/` - Shared logic (`useTarkovTime`, `useSkillCalculation`, etc.)
  - `components/` - Global shared UI components
  - `pages/` - File-based routing (kebab-case)
  - `server/api/` - Nitro server routes (proxies)
  - `locales/` - JSON5 locale files
- `workers/` - Cloudflare Workers (`api-gateway`, `team-gateway`)
- `supabase/` - Database migrations and Edge Functions
- `docs/` - Documentation

### Key Patterns

- **Three-Store Pattern:** State is divided into `useMetadata` (static game data), `useProgress` (user data), and `usePreferences` (settings).
- **Feature Modules:** Logic specific to a domain stays in `app/features/<domain>`.
- **Sync:** Team updates use Supabase Broadcast channels.
- **Client-Only:** Plugins are typically `*.client.ts`.

## Development Workflow

### Prerequisites

- Node.js >= 24.12.0
- `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Key Commands

| Command                  | Description                                                     |
| :----------------------- | :-------------------------------------------------------------- |
| `npm run dev`            | Start HMR dev server at `http://localhost:3000`                 |
| `npm run build`          | Build for production (SPA)                                      |
| `npm run preview`        | Serve production build locally                                  |
| `npm run format`         | **Run this before committing.** Runs Prettier and ESLint fixes. |
| `npm run lint`           | Check for lint errors (zero tolerance).                         |
| `npx vitest`             | Run unit tests                                                  |
| `npx vitest --ui`        | Open Vitest UI dashboard                                        |
| `npm run supabase:types` | Regenerate Supabase TypeScript definitions                      |

## Coding Standards (STRICT)

- **Style:** TypeScript + Vue 3 SFC (`<script setup lang="ts">`). **Tailwind v4 only**—no `<style>` blocks, SCSS, or scoped CSS.
- **Formatting:** 2 spaces indentation, 100-char line width, single quotes, semicolons.
- **Imports:**
  - **NO parent-relative imports** (`../`). Use `@/` alias (e.g., `@/utils/logger`).
  - **Sort alphabetically** (case-insensitive).
  - **NO blank lines** between import groups.
  - Group order: Builtin -> External -> Internal -> Parent -> Sibling -> Index -> Object -> Type.
- **Naming:**
  - Components: `PascalCase.vue`
  - Composables/Functions: `camelCase.ts` (`useFoo`)
  - Routes/Files: `kebab-case`
  - Constants: `UPPER_SNAKE_CASE`
- **Error Handling:** Use `@/utils/logger` instead of `console.log`.

## Testing Strategy

- **Unit Tests:** Located in `__tests__/` directories next to the code.
- **Naming:** `*.test.ts`.
- **Tools:** Vitest. Mock external dependencies (Supabase, Fetch) to keep tests deterministic.
- **Coverage:** `npx vitest --coverage`

## Agent Rules

- **No over-thinking in responses**. Sacrifice explanatory language for brevity—layman's terms only when necessary.
- **Be concise**. Direct responses only: "Fixed X by changing Y to Z." Minimize explanation unless asked. Use file references for context.
- **No comments** unless explicitly requested. Comments are token overhead.
- **Run `npm run format` once** before leaving code. It handles both formatting and linting. Only show errors, skip success output.
- **Own all issues**. Fix formatting, linting, and pre-existing bugs without being asked. Don't deflect with "these are from earlier changes."
- **Self-assess code**. Don't ask "what does this do?" Read and understand it. Only clarify ambiguous intent ("Is this supposed to do X or Y?").
- **Ask before acting on complex requests**. Clarify ambiguous or multi-interpretation tasks before proceeding—it's better to ask one question than redo work.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions to answer, if any.
