# GitHub Copilot Instructions for TarkovTracker

## Project Overview

Nuxt 4 SPA (`ssr: false`) for tracking Escape from Tarkov game progress. Client-side only with Nitro server routes for API proxying.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, TypeScript (strict), Pinia, Supabase, Cloudflare Pages/Workers, Tailwind CSS v4, Vitest.

## Directory Structure

```
app/
├── pages/          # File-based routing (kebab-case)
├── features/       # Domain slices
├── components/     # Shared UI
├── shell/          # App chrome (AppBar, NavDrawer, AppFooter)
├── stores/         # Pinia stores
├── composables/    # Reusable composition functions
├── server/api/     # Nitro server routes
├── locales/        # i18n JSON files
├── plugins/        # Nuxt plugins
├── utils/          # Utilities
└── types/          # TypeScript types
```

## Code Style

### Vue SFCs

```vue
<script setup lang="ts">
  // Indented script content (vueIndentScriptAndStyle: true)
</script>

<template>
  <!-- Tailwind classes only, no <style> blocks -->
</template>
```

### Imports

- **Never** use parent-relative imports (`../`) — use `@/` aliases
- No blank lines between import groups
- Alphabetically sorted (case-insensitive)
- Group order: builtin → external → internal → parent → sibling → index → object → type

### Formatting

2-space indent, 100-char lines, single quotes, semicolons, trailing commas (es5).

### Naming

- Components: `PascalCase` (`TaskCard.vue`)
- Composables: `useCamelCase` (`useTaskFiltering.ts`)
- Stores: `useXStore` (`useProgress.ts`)
- Routes: `kebab-case` (`needed-items.vue`)
- Constants: `UPPER_SNAKE_CASE` for globals

## Key Patterns

### Three-Store Architecture

```typescript
const metadata = useMetadata()    // Static game data from tarkov.dev API
const progress = useProgress()    // User progress (completions, objectives)
const preferences = usePreferences() // User settings with localStorage persistence
```

### TypeScript

- Explicit types for exports; avoid `any` (use `unknown` + narrowing)
- `as const` for literal inference; union types for constrained values

### Styling

- **Tailwind v4 only** — no `<style>` blocks, SCSS, or scoped CSS
- Theme layer for colors — no hex values in templates
- Use `@nuxt/ui` components consistently

### Error Handling

```typescript
import { logger } from '@/utils/logger';
try {
  await someAsyncOperation();
} catch (error) {
  logger.error('Feature:Action failed', { context, error });
}
```

### Localization

- Only edit `app/locales/en.json` — non-English files are Crowdin-owned
- Keys must be `snake_case`; provide fallback strings in `t('key', 'Fallback')` calls
- Never hard-code user-facing strings

## Commands

```bash
npm run dev         # Dev server at localhost:3000
npm run build       # Production build
npm run lint        # ESLint (zero warnings enforced)
npm run format      # Prettier + ESLint fix
npx vitest          # Unit tests
```

## Pitfalls

1. No SSR-only features (app is SPA-only)
2. No parent-relative imports — blocked by lint
3. No hex colors — use Tailwind theme
4. Mock network/Supabase calls in tests
5. Prefer early returns over deep nesting
