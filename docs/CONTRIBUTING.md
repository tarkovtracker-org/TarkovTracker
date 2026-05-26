# Contributing to TarkovTracker

Thank you for your interest in contributing to TarkovTracker! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js:** >= 24.12.0
- **npm:** >= 11.6.2
- **Git:** Latest version

### Getting Started

```bash
# Clone the repository
git clone https://github.com/tarkovtracker-org/TarkovTracker.git
cd TarkovTracker

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## AI Agent Context Files

- `AGENTS.md` is the repository source of truth for agent instructions.
- `.claude/CLAUDE.md` is a thin shim that imports `AGENTS.md` for Claude Code (moved from root to reduce clutter).
- `GEMINI.md` is intentionally not tracked. If you use Gemini CLI, configure it to load `AGENTS.md` directly in `.gemini/settings.json`:

```json
{
  "context": {
    "fileName": ["AGENTS.md"]
  }
}
```

- Do not configure Gemini CLI to load both `AGENTS.md` and `GEMINI.md` if one imports the other, or you may duplicate instructions in memory.

### Environment Variables

Create a `.env` file in the project root:

```env
# Supabase (for browser auth and server auth validation)
NUXT_PUBLIC_SUPABASE_URL=your_supabase_url
NUXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
# SUPABASE_URL and SUPABASE_ANON_KEY also work as cross-platform fallbacks

# Server-side (for API routes - production only)
NUXT_SUPABASE_SERVICE_KEY=your_service_role_key
NUXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** Most features work without Supabase configuration. Auth and sync will be disabled.

## Project Structure

```text
app/
├── assets/          # Shared CSS/assets
├── components/      # Global UI components
├── composables/     # Reusable composition functions
├── data/            # Static map/story data
├── features/        # Feature modules (tasks, hideout, team, supporter, etc.)
├── layouts/         # Page layouts
├── locales/         # Locale JSON files
├── pages/           # File-based routing
├── plugins/         # Nuxt client plugins
├── server/          # API routes
├── shell/           # App chrome
├── stores/          # Pinia stores
├── types/           # TypeScript definitions
└── utils/           # Utility functions
```

## Code Style

### General Rules

- **Indent:** 2 spaces
- **Line width:** 100 characters
- **Strings:** Single quotes
- **Semicolons:** Always required
- **Imports:** Use `@/` alias (no relative `../` imports)
- **Components:** PascalCase filenames
- **Colors:** Tailwind tokens only (no hex colors)
- **Comments:** Only where necessary

### Vue Components

```vue
<script setup lang="ts">
  // 1. Imports (builtin → external → internal)
  import { computed, ref } from 'vue';
  import { storeToRefs } from 'pinia';
  import { useProgressStore } from '@/stores/useProgress';

  // 2. Props and emits
  const props = defineProps<{
    taskId: string;
    showDetails?: boolean;
  }>();

  const emit = defineEmits<{
    complete: [taskId: string];
  }>();

  // 3. Store access
  const progressStore = useProgressStore();
  const { tasksCompletions } = storeToRefs(progressStore);

  // 4. Local state
  const isExpanded = ref(false);

  // 5. Computed properties
  const isComplete = computed(() => tasksCompletions.value[props.taskId]?.['self'] ?? false);

  // 6. Methods
  const handleComplete = () => {
    emit('complete', props.taskId);
  };
</script>

<template>
  <!-- Template content -->
</template>
```

### Formatting

Run formatting before committing:

```bash
npm run format
npm run supabase:check
```

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Validate local Supabase migrations
npm run supabase:check

# API Gateway tests
npm run test:api-gateway
```

### Writing Tests

Tests are located in `__tests__/` directories alongside the code:

```text
app/features/tasks/
├── TaskCard.vue
├── __tests__/
│   └── TaskCard.test.ts
```

## Git Workflow

### Branch Naming

```
feat/add-task-filtering
fix/hideout-level-display
refactor/task-store-cleanup
docs/update-readme
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tasks): add filtering by map
fix(hideout): correct level calculation for stash
refactor(stores): simplify progress computation
docs: update contributing guide
chore: update dependencies
```

Use only the commit scopes allowed by `commitlint.config.js`:

```text
app, workers, api, ui, tasks, hideout, maps, team, settings, admin, i18n, deps, config, ci, test, docs, release
```

If none of those scopes fit cleanly, omit the scope instead of inventing a new one.

Recommended mappings:

- `ui` for theme, styling, layout, shell, and visual polish changes
- `docs` for repository and process documentation such as contributor guidance or `AGENTS.md`

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run tests and formatting
4. Push and create a PR
5. Fill out the PR template
6. Wait for review

## Common Tasks

### Adding a New Feature

1. Create feature directory in `app/features/`
2. Add route in `app/pages/`
3. Add navigation link in `app/shell/NavDrawer.vue`

### Adding a New Store

1. Create store file in `app/stores/`
2. If persisted, configure persistence options

### Tarkov.dev Import and Linking Rules

- Persist only the linked `tarkovUid`.
- Do not add a persisted `tarkovUidMode`, linked-mode field, or imported-mode field.
- Import target mode is chosen in the import UI and is temporary action state only.
- Tarkov.dev imports should accept the full player profile URL, extract the numeric UID, fetch the
  public JSON through `/api/tarkov-dev/profile`, and reuse the canonical profile parser.
- Tell users to open their tarkov.dev profile page before importing because the public profile JSON
  refreshes when that page is visited.
- When generating tarkov.dev links, use the currently viewed or selected mode to choose the URL
  slug instead of storing import metadata.
- Old backup files may still contain legacy import-mode metadata; new code should ignore it rather
  than restore it into state.

### Adding a New API Endpoint

1. Create route file in `app/server/api/`
2. Add types in `app/types/`

### Adding Translations

1. Add source keys to `app/locales/en.json` (the source locale).
2. Run `npm run i18n:check`. Missing keys in non-English locales are non-fatal — vue-i18n falls back to `en` at runtime via `fallbackLocale: 'en'`.
3. Use in components with `$t('key.path', 'Fallback string')` — pass a fallback for resilience.
4. Crowdin propagates and translates new keys to the other locale files (`cs`, `de`, `es`, `fr`, `it`, `ko`, `pl`, `pt`, `ru`, `uk`, `zh`) on its sync cycle. Do not edit those files manually.

## Debugging

### Vue DevTools

Install the [Vue DevTools](https://devtools.vuejs.org/) browser extension for:

- Component inspection
- Pinia store debugging
- Event tracking

### Logging

Use the logger utility:

```typescript
import { logger } from '@/utils/logger';

logger.debug('Debug message', { context: 'value' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);
```

## Need Help?

- Check existing [issues](https://github.com/tarkovtracker-org/TarkovTracker/issues)
- Join the Discord community
- Ask in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the project's GNU General Public License v3.0.
