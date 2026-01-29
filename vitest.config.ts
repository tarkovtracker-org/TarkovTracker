import { defineVitestConfig } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
const logLevel = process.env.VITE_LOG_LEVEL || 'warn';
export default defineVitestConfig({
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    'import.meta.env.VITE_LOG_LEVEL': JSON.stringify(logLevel),
  },
  test: {
    environment: 'happy-dom',
    environmentMatchGlobs: [
      ['app/pages/**/__tests__/**/*.test.ts', 'nuxt'],
      ['app/server/**/__tests__/**/*.test.ts', 'nuxt'],
    ],
    globals: true,
    setupFiles: ['./test-setup.ts'],
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
});
