import { defineConfig } from 'vitest/config';
import { SHARED_DEFINE } from './vitest.shared';

export default defineConfig({
  define: SHARED_DEFINE,
  test: {
    projects: ['vitest.nuxt.config.ts', 'vitest.happy-dom.config.ts'],
  },
});
