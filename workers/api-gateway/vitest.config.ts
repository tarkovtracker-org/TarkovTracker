import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': resolve(
        process.cwd(),
        'workers/api-gateway/src/__tests__/cloudflare-workers.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    include: ['workers/api-gateway/src/**/__tests__/**/*.test.ts'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
