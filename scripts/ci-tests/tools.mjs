import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gitExecutable, pnpmEntry } from '../validation-tools.mjs';
test('validation rejects relative tool paths instead of searching PATH', () => {
  assert.throws(() => gitExecutable({ GIT_EXECUTABLE: './git' }), /absolute path/);
  assert.throws(() => pnpmEntry({ npm_execpath: 'pnpm' }), /pnpm run validate:changes/);
  assert.throws(() => pnpmEntry({}), /pnpm run validate:changes/);
});
test('validation reuses the absolute package manager entry supplied by pnpm run', () => {
  assert.equal(pnpmEntry({ npm_execpath: '/trusted/pnpm.mjs' }), '/trusted/pnpm.mjs');
  assert.equal(gitExecutable({ GIT_EXECUTABLE: '/trusted/git' }), '/trusted/git');
});
