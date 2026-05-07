import { getVitestConfigFromNuxt } from '@nuxt/test-utils/config';
import { defu } from 'defu';
import { configDefaults, defineProject } from 'vitest/config';
import { SHARED_DEFINE } from './vitest.shared';
export default defineProject(async () => {
  const nuxtConfig = await getVitestConfigFromNuxt();
  return defu(
    {
      define: SHARED_DEFINE,
      server: {
        watch: {
          ignored: ['**/.nuxt/**', '**/.output/**', '**/dist/**'],
        },
      },
      test: {
        name: 'happy-dom',
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./tests/test-setup.ts'],
        include: ['app/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
        exclude: [
          ...configDefaults.exclude,
          'workers/**',
          '**/.codex/**',
          'app/pages/**/__tests__/**/*.test.ts',
          'app/server/**/__tests__/**/*.test.ts',
        ],
        clearMocks: true,
        logHeapUsage: false,
        isolate: false,
        maxWorkers: process.env.CI ? 2 : 8,
        pool: 'threads',
      },
    },
    nuxtConfig
  );
});
