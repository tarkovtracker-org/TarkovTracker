import { defineVitestConfig } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';
const logLevel = process.env.NUXT_PUBLIC_LOG_LEVEL || 'warn';
const isSharded = Boolean(process.env.VITEST_SHARD);
const ciReporters = isSharded ? ['default', 'junit', 'github-actions'] : ['default', 'junit'];
export default defineVitestConfig({
  define: {
    'import.meta.env.NUXT_PUBLIC_LOG_LEVEL': JSON.stringify(logLevel),
  },
  test: {
    environment: 'nuxt',
    globals: true,
    setupFiles: ['./tests/test-setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      'workers/**',
      '**/*.deno.test.ts',
      '**/node_modules/**',
      '**/.codex/**',
      '**/.wt/**',
    ],
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    logHeapUsage: false,
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
    watch: false,
    reporters: process.env.CI ? ciReporters : ['default'],
    outputFile: 'test-report.junit.xml',
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'lcov', 'cobertura'],
      include: isSharded ? undefined : ['app/**/*.{ts,vue}'],
      exclude: [
        'app/**/*.d.ts',
        'app/**/__tests__/**',
        'docs/**',
        'public/**',
        'scripts/**',
        'supabase/**',
        'tests/**',
        'workers/**',
      ],
      // Shards report only imported files so Codecov can merge them without
      // zero-filled duplicates. Unsharded runs retain the full app denominator.
      ...(isSharded
        ? {}
        : {
            thresholds: {
              branches: 50,
              functions: 60,
              lines: 65,
              statements: 63,
              'app/stores/utils/gameMode.ts': { 100: true },
              'app/composables/useTaskState.ts': { 100: true },
              'app/utils/storeHelpers.ts': {
                lines: 85,
                statements: 85,
                functions: 100,
                branches: 85,
              },
              'app/composables/useTaskRepair.ts': {
                lines: 90,
                statements: 90,
                functions: 85,
                branches: 75,
              },
              'app/composables/useAppInitialization.ts': {
                lines: 95,
                statements: 85,
                functions: 100,
                branches: 80,
              },
              'app/server/api/changelog.get.ts': {
                lines: 90,
                statements: 85,
                functions: 95,
                branches: 70,
              },
              'app/utils/changelog.ts': {
                lines: 100,
                statements: 100,
                functions: 100,
                branches: 90,
              },
            },
          }),
    },
  },
});
