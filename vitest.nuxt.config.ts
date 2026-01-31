import { defineVitestProject } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';
import { SHARED_DEFINE } from './vitest.shared';
export default defineVitestProject({
  test: {
    name: 'nuxt',
    environment: 'nuxt',
    globals: true,
    setupFiles: ['./tests/test-setup.ts'],
    include: ['app/pages/**/__tests__/**/*.test.ts', 'app/server/**/__tests__/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'workers/**'],
    clearMocks: true,
    logHeapUsage: false,
    isolate: false,
    maxWorkers: process.env.CI ? 2 : 8,
    minWorkers: process.env.CI ? 1 : 2,
    teardownTimeout: 10000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: false,
      },
    },
    watchExclude: ['**/.nuxt/**', '**/.output/**', '**/dist/**'],
  },
  define: SHARED_DEFINE,
});
