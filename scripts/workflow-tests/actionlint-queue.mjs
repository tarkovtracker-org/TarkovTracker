import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeQueueWorkflow } from '../ci/actionlint-queue.mjs';
const path = '.github/workflows/preview.yml';
const block =
  'concurrency:\n  group: pages-preview-lifecycle\n  queue: max\n  cancel-in-progress: false\n';
test('only the validated queue extension is blanked and line numbers remain unchanged', () => {
  const source = `name: Preview\n${block}jobs:\n  smoke:\n    runs-on: ubuntu-latest\n`;
  const normalized = normalizeQueueWorkflow(source, path);
  assert.equal(normalized, source.replace('  queue: max', ''));
  assert.equal(normalized.split('\n').length, source.split('\n').length);
  assert.equal(normalizeQueueWorkflow(source, '.github/workflows/other.yml'), source);
});
test('missing lock fields, replacement cancellation and unsupported queue values fail closed', () => {
  for (const source of [
    block.replace('pages-preview-lifecycle', 'preview-per-run'),
    block.replace('queue: max', 'queue: single'),
    block.replace('queue: max', 'queue: anything'),
    block.replace('  queue: max\n', ''),
    block.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    block.replace('  cancel-in-progress: false\n', ''),
    block.replace('group: pages-preview-lifecycle', 'group: ${{ inputs.group }}'),
    `${block}  unknown: true\n`,
  ])
    assert.throws(() => normalizeQueueWorkflow(source, path), /Invalid preview lifecycle/);
});
test('tool errors cannot pass the lint wrapper', () => {
  const result = spawnSync(process.execPath, [
    'scripts/ci/actionlint-queue.mjs',
    '/missing/actionlint',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString(), /ENOENT/);
});
test('normalization preserves other syntax errors for the native validator', () => {
  const source = readFileSync(path, 'utf8').replace('runs-on: ubuntu-latest', 'unknown-key: true');
  const normalized = normalizeQueueWorkflow(source, path);
  assert.match(normalized, /unknown-key: true/);
  assert.equal(normalized, source.replace('  queue: max', ''));
});
