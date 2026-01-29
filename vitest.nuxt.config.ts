import { defineVitestProject } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
const logLevel = process.env.VITE_LOG_LEVEL || 'warn';

export default defineVitestProject({
  test: {
    name: 'nuxt',
    environment: 'nuxt',
    globals: true,
    setupFiles: ['./tests/test-setup.ts'],
    include: [
      'app/pages/**/__tests__/**/*.test.ts',
      'app/server/**/__tests__/**/*.test.ts',
    ],
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
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    'import.meta.env.VITE_LOG_LEVEL': JSON.stringify(logLevel),
  },
});
