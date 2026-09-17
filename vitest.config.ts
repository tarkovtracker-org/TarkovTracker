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
    // Test files run in parallel. With `isolate: true` the pool never hands a runner to more
    // than one file: its reuse path is gated on `isolate === false` and otherwise stops the
    // runner, so no module state crosses file boundaries. Serialization came from `00c2c74e`
    // (2026-01-25), which pinned a single fork and `fileParallelism: false`. A separate change,
    // `692f4789` (2026-01-31), added `--dangerouslyIgnoreUnhandledErrors` for worker-teardown
    // errors, and `df7076f6` removed it (2026-02-17). Worker count stays bounded rather than
    // unbounded so teardown pressure and peak memory remain predictable.
    maxWorkers: process.env.CI ? 4 : 8,
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
      include: isSharded ? undefined : ['app/**/*.{ts,vue}', 'shared/**/*.ts'],
      exclude: [
        'app/**/*.d.ts',
        'app/**/__tests__/**',
        'shared/**/__tests__/**',
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
