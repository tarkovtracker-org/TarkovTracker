import { join, relative } from 'node:path';
import { defineVitestConfig } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';
import assignment from './scripts/ci/pilot-shards.json' with { type: 'json' };
import type { TestSpecification } from 'vitest/node';
const versionedApi = process.env.TARKOV_VERSIONED_API_DIRECTORY;
const logLevel = process.env.NUXT_PUBLIC_LOG_LEVEL || 'warn';
const isSharded = Boolean(process.env.VITEST_SHARD);
const isMergingReports = process.argv.some((arg) => arg.startsWith('--merge-reports'));
const ciReporters = isSharded
  ? ['default', 'junit', 'github-actions', 'blob']
  : ['default', 'junit'];
const pilotShards: Record<string, number> = assignment;
function selectPilotShard(files: TestSpecification[], root: string, index: number) {
  const assigned = files.map((file) => ({
    file,
    shard: pilotShards[relative(root, file.moduleId).replaceAll('\\', '/')],
  }));
  if (assigned.length !== Object.keys(pilotShards).length || assigned.some((entry) => !entry.shard))
    throw new Error('Hosted pilot assignment does not match the discovered Vitest files');
  return assigned.filter((entry) => entry.shard === index).map((entry) => entry.file);
}
class PilotSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]) {
    const { root, shard } = this.ctx.config;
    if (shard?.count !== 4) throw new Error('Hosted pilot requires the standard four shards');
    return selectPilotShard(files, root, shard.index);
  }
}
const usePilotSplit = process.env.TARKOVTRACKER_SHARD_PILOT === 'balanced';
export default defineVitestConfig({
  resolve: {
    alias: {
      ...(versionedApi ? { 'virtual:versioned-api': join(versionedApi, 'src') } : {}),
      // External parity loads the shim from the exact versioned API checkout.
      ...(versionedApi
        ? { 'cloudflare:workers': join(versionedApi, 'src/__tests__/cloudflare-workers.ts') }
        : {}),
    },
  },
  define: {
    'import.meta.env.NUXT_PUBLIC_LOG_LEVEL': JSON.stringify(logLevel),
  },
  test: {
    ...(usePilotSplit ? { sequence: { sequencer: PilotSequencer } } : {}),
    environment: 'nuxt',
    globals: true,
    setupFiles: ['./tests/test-setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      ...(versionedApi ? [] : ['workers/contract-tests/**']),
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
    // Locally, Vitest picks `agent` under coding agents (failures only) and `default` otherwise.
    reporters: process.env.CI ? ciReporters : undefined,
    outputFile: { junit: 'test-report.junit.xml' },
    passWithNoTests: false,
    coverage: {
      ...(isMergingReports
        ? { provider: 'custom', customProviderModule: './scripts/ci/vitest-merged-coverage.mjs' }
        : { provider: 'v8' }),
      reportsDirectory: './coverage',
      reporter: ['text', 'json', 'json-summary', 'lcov', 'cobertura'],
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
      // zero-filled duplicates. Unsharded and --merge-reports runs use the full
      // app denominator and enforce these thresholds.
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
