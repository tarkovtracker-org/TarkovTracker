---
name: new-feature
description: Scaffold a new feature slice in app/features/ with components, composables, types, and i18n keys
disable-model-invocation: true
---

# New Feature Slice

Scaffold a new domain feature in the `app/features/` directory.

## Arguments

- `$ARGUMENTS` — feature name in kebab-case (e.g., "traders", "flea-market")

## Directory Structure

Create the following under `app/features/<name>/`:

```
app/features/<name>/
├── <PascalName>.vue          # Primary component (at minimum)
├── composables/              # Feature-specific composables (if needed)
│   └── use<PascalName>.ts
├── __tests__/                # Test files
│   └── <PascalName>.test.ts
└── types.ts                  # Feature-specific types (if needed)
```

## Conventions

- **Components**: PascalCase `.vue` files with `<script setup lang="ts">` and `<template>`
- **Styling**: Tailwind v4 utility classes only — no `<style>` blocks or hex colors
- **Imports**: Use `@/` aliases, never relative `../` imports. Do NOT import auto-imported Vue/Nuxt utilities (`ref`, `computed`, `watch`, `useRoute`, etc.)
- **State**: Use existing stores via `useTarkov()` composable for game data access
- **i18n**: All user-visible strings must use `$t('key')` with snake_case locale keys
- **Tests**: Vitest + Vue Test Utils in `__tests__/` directory

## i18n Setup

Add a new section in each locale file (`app/locales/*.json5`). At minimum, add keys to `en.json5`:

```json5
<feature_name>: {
  title: '<Feature Title>',
},
```

Use snake_case for all key names. Add the same keys to all locale files (`de`, `es`, `fr`, `ru`, `uk`, `zh`) with the English value as placeholder.

## Routing

If the feature needs a page, create `app/pages/<name>.vue` that imports the feature components.

## Output

After scaffolding, report:
- Files created
- i18n keys added
- Any manual integration steps (e.g., adding nav items in AppBar, adding to drawer)
