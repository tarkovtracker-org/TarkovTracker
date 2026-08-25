import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
const gatewayRoot = fileURLToPath(new URL('.', import.meta.url));
const workerShim = fileURLToPath(new URL('./src/__tests__/cloudflare-workers.ts', import.meta.url));
export default defineConfig({
  root: gatewayRoot,
  resolve: {
    alias: {
      'cloudflare:workers': workerShim,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
