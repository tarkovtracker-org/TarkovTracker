import { defineConfig } from 'vitest/config';
import { sharedDefine } from './vitest.shared';

export default defineConfig({
  define: sharedDefine,
  test: {
    projects: ['vitest.nuxt.config.ts', 'vitest.happy-dom.config.ts'],
  },
});
