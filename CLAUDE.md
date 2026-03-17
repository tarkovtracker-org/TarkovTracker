# CLAUDE.md

## Commands

```bash
npm run dev       # Dev :3000
npm run build     # Prod SPA
npm run format    # Prettier+ESLint (run before done)
npx vitest        # Tests
```

## Architecture

Nuxt 4 SPA (`ssr:false`), Vue 3 `<script setup>`, Tailwind v4 only (no `<style>`/hex), Supabase backend

- **Features**: `app/features/` domain slices (admin, dashboard, drawer, hideout, maps, neededitems, settings, tasks, team)
- **State**: useMetadata + useProgress + usePreferences stores, coordinated via useTarkov
- **Theme System**: light/dark mode is driven by persisted `usePreferences.themeMode`, applied on `document.documentElement` via `data-theme`, with semantic tokens defined in `app/assets/css/tailwind.css`
- **Style**: 2-space, 100-char, single quotes, semicolons, `@/` aliases, PascalCase components

## Rules

- Be concise—"Fixed X via Y"
- No comments unless asked
- Own all issues—fix without being asked
- Find root cause—fix the underlying issue, not just symptoms
- Ask before complex/ambiguous tasks
- No SSR, no relative imports (`../`), no hex colors
- Import order: builtin → external → internal → parent → sibling → index → object → type
- Do not import Vue/Nuxt auto-imported utilities (`ref`, `computed`, `watch`, hooks, `useRoute`, `useFetch`, etc.); remove them when found
- Errors via `logger` from `@/utils/logger`
- Locale keys must be snake_case

## Testing

Vitest + Vue Test Utils, `*.test.ts` in `__tests__/`, mock Supabase/network

## Tarkov MCP Tools

- State ONLY what API returned—no "likely", "probably", "appears"
- Missing data ≠ doesn't exist: "API doesn't show [X]—check in-game"
