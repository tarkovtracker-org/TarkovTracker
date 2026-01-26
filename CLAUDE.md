# Commands

```bash
npm run dev          # Dev server at http://localhost:3000 with HMR
npm run build        # Production SPA build
npm run preview      # Serve built bundle
npm run format       # Prettier + ESLint fix (use this one)
npm run lint         # Lint with zero warnings
npx vitest           # Run tests
npx vitest --ui      # Test dashboard
npx vitest path/file.test.ts  # Run specific test
supabase functions deploy [name]  # Deploy edge function
cd workers/api-gateway && npx wrangler deploy
cd workers/team-gateway && npx wrangler deploy
```

# Architecture

- **Nuxt 4 SPA** (`app/`) with file-based routing
- **Features**: Domain slices (tasks, team, hideout, maps, neededitems, traders, settings, admin)
- **State**: Three-store pattern (useMetadata, useProgress, usePreferences)
- **Backend**: Supabase (auth, PostgreSQL, Realtime), Cloudflare Workers (api-gateway, team-gateway), Nitro routes
- **Sync**: Supabase Broadcast for team real-time updates
- **Game Modes**: Dual PvP/PvE tracking, XP system with xpOffset

## Code Style

- TypeScript + Vue 3 SFCs (`<script setup lang="ts">`)
- **Tailwind v4 only**—no `<style>` blocks, SCSS, or scoped CSS
- 2-space indent, 100-char width, single quotes, semicolons, trailing commas
- Imports: alphabetically sorted, no blank lines between groups
- Use `@/` aliases, not relative imports
- PascalCase components, camelCase functions/composables, kebab-case routes/files
- Tailwind v4 theme layer only—no hex colors
- Errors: use `logger` from `@/utils/logger`

# Testing

- Vitest + Vue Test Utils + @nuxt/test-utils
- Test files: `*.test.ts` in `__tests__/` folders
- Mock external calls (Supabase, network)

## Environment

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anonymous_key
```

Node.js >=24.12.0 required (see `.nvmrc`)

## Rules

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
