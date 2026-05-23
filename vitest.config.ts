import { defineVitestConfig } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';
// Allow environment variable overrides for Supabase config in tests
// Falls back to local Supabase instance on port 54321
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
const logLevel = process.env.VITE_LOG_LEVEL || 'warn';
export default defineVitestConfig({
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    'import.meta.env.VITE_LOG_LEVEL': JSON.stringify(logLevel),
  },
  test: {
    environment: 'nuxt',
    globals: true,
    setupFiles: ['./tests/test-setup.ts'],
    exclude: [...configDefaults.exclude, 'workers/**', '**/node_modules/**', '**/.codex/**'],
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
    reporters: ['default'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'lcov', 'cobertura'],
      include: ['app/**/*.{ts,vue}'],
      exclude: ['app/**/*.d.ts', 'app/**/__tests__/**'],
      thresholds: {
        branches: 15,
        functions: 20,
        lines: 20,
        statements: 20,
      },
    },
  },
});
