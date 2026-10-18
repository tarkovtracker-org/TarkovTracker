import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: false,
    include: ['scripts/checks/lint-blank-lines*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['scripts/checks/blank-lines/*.mjs'],
      reportsDirectory: 'coverage/blank-lines',
      reporter: ['text', 'json'],
      thresholds: { perFile: true, lines: 90, statements: 90, functions: 95, branches: 85 },
    },
  },
});
