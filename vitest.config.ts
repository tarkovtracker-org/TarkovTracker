import { defineVitestConfig } from '@nuxt/test-utils/config';
import { configDefaults } from 'vitest/config';
// Allow environment variable overrides for Supabase config in tests
// Falls back to local Supabase instance on port 54321
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
    environment: 'nuxt', // The Nuxt environment handles the DOM setup automatically
    globals: true,
    setupFiles: ['./test-setup.ts'],
    exclude: [...configDefaults.exclude, 'workers/**'],
    // Don't auto-clean up DOM elements as Nuxt environment handles this
    clearMocks: true,
    // Suppress some console warnings during tests
    logHeapUsage: false,
    isolate: false,
  },
});
