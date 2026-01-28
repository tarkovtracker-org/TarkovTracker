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

### Environment Variables

Create a `.env` file in the project root:

```env
# Client-side (for browser auth)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Server-side (for API routes - production only)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NUXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** Most features work without Supabase configuration. Auth and sync will be disabled.

## Project Structure

```text
app/
├── components/      # Global UI components
├── composables/     # Reusable composition functions
├── features/        # Feature modules (tasks, hideout, team, etc.)
├── stores/          # Pinia stores
├── pages/           # File-based routing
├── server/          # API routes
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
```

## Testing

### Running Tests

```bash
# Run all tests
npx vitest run

# Watch mode (default)
npx vitest

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

### Adding a New API Endpoint

1. Create route file in `app/server/api/`
2. Add types in `app/types/`

### Adding Translations

1. Add keys to all locale files in `app/locales/`
2. Use in components with `$t('key.path')`

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
