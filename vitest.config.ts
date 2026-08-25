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
      // Per-shard coverage is partial; Codecov merges the lcov uploads and
      // enforces thresholds via codecov.yml status checks on the full result.
      // No `include` glob on purpose: with one set, every shard zero-fills every
      // file it never imported, and those phantom entries poison Codecov's
      // merged and diff coverage for Vue SFC template lines.
      ...(isSharded
        ? {}
        : {
            thresholds: {
              branches: 15,
              functions: 20,
              lines: 20,
              statements: 20,
            },
          }),
    },
  },
});
