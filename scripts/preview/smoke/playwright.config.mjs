import { defineConfig } from '@playwright/test';
// Browser smoke tests for an Actions-owned Cloudflare Pages preview. They run without Cloudflare
// credentials against the unique deployment URL supplied by the controller. Filenames use
// `.smoke.mjs` so Vitest's default `*.{test,spec}.*` discovery never picks them up.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.smoke\.mjs$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: process.env.SMOKE_REPORT_DIR || 'smoke-report' }],
    ['json', { outputFile: `${process.env.SMOKE_REPORT_DIR || 'smoke-report'}/results.json` }],
  ],
  use: {
    baseURL: process.env.PREVIEW_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
