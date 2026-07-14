import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    include: ['workers/api-gateway/src/**/__tests__/**/*.test.ts'],
  },
});
