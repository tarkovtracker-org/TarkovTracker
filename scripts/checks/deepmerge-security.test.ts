// @vitest-environment node
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('passes the actual Nitro resolver security and compatibility cases in native Node', () => {
  // Nuxt adds browser/worker conditions even to Vitest's Node pool. Nitro's build-time
  // CommonJS dependency must instead be tested under the native Node export conditions.
  const file = fileURLToPath(new URL('./deepmerge-security.cases.ts', import.meta.url));
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  const output = `${run.stdout}\n${run.stderr}`;
  expect(run.error, output).toBeUndefined();
  expect(run.signal, output).toBeNull();
  expect(run.status, output).toBe(0);
  expect(run.stdout).toContain('# tests 8');
  expect(run.stdout).toContain('# pass 8');
  expect(run.stdout).toContain('# fail 0');
});
