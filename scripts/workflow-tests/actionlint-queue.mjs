import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeQueueWorkflow, normalizePublisherEnvironment } from '../ci/actionlint-queue.mjs';
const path = '.github/workflows/preview-retention.yml';
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
  const source = readFileSync(path, 'utf8').replace('runs-on: ubuntu-24.04', 'unknown-key: true');
  const normalized = normalizeQueueWorkflow(source, path);
  assert.match(normalized, /unknown-key: true/);
  assert.equal(normalized, source.replace('  queue: max', ''));
});
const admissionPath = '.github/workflows/review-admission.yml';
const admissionBlock =
  '    concurrency:\n      group: review-admission-publication\n      queue: max\n      cancel-in-progress: false\n';
const admissionSource = `name: Review Admission\njobs:\n  admission:\n    if: github.event.issue.pull_request\n${admissionBlock}    runs-on: ubuntu-latest\n`;
test('admission queue extension is supported only within the filtered admission job', () => {
  const normalized = normalizeQueueWorkflow(admissionSource, admissionPath);
  assert.equal(normalized, admissionSource.replace('      queue: max', ''));
  assert.equal(normalized.split('\n').length, admissionSource.split('\n').length);
  const actual = readFileSync(admissionPath, 'utf8');
  assert.equal(
    normalizeQueueWorkflow(actual, admissionPath),
    actual.replace('      queue: max', '')
  );
});
test('admission extension rejects workflow/global, foreign-job, duplicate or malformed blocks', () => {
  const global = admissionBlock
    .split('\n')
    .map((line) => line.slice(4))
    .join('\n');
  for (const source of [
    `name: Review Admission\n${global}jobs:\n  admission:\n    runs-on: ubuntu-latest\n`,
    admissionSource.replace('  admission:', '  other:'),
    admissionSource.replace('jobs:\n', 'notjobs:\n'),
    `${global}${admissionSource}`,
    `${admissionSource}  other:\n${admissionBlock}`,
    admissionSource.replace('queue: max', 'queue: single'),
    admissionSource.replace('      queue: max\n', ''),
    admissionSource.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    admissionSource.replace('group: review-admission-publication', 'group: unexpected'),
    admissionSource.replace('      queue: max\n', '      queue: max\n      unknown: true\n'),
  ])
    assert.throws(() => normalizeQueueWorkflow(source, admissionPath));
});
test('release promotion serialization is supported only in the success-gated enqueue job', () => {
  const filename = '.github/workflows/release-promotion-queue.yml';
  const source = readFileSync(filename, 'utf8');
  assert.equal(normalizeQueueWorkflow(source, filename), source.replace('      queue: max', ''));
  for (const changed of [
    source.replace('  enqueue:', '  other:'),
    source.replace('group: release-promotion-queue', 'group: unexpected'),
    source.replace('queue: max', 'queue: single'),
    source.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    `concurrency:\n  group: other\n${source}`,
  ])
    assert.throws(
      () => normalizeQueueWorkflow(changed, filename),
      /(?:Invalid|Ambiguous) serialized job concurrency/
    );
});
test('preview extension accepts only the exact queue-profile conditional group', () => {
  const filename = '.github/workflows/preview.yml';
  const current = readFileSync(filename, 'utf8');
  assert.equal(
    normalizeQueueWorkflow(current, filename),
    current.replace("  queue: ${{ inputs.queue && 'max' || 'single' }}", '')
  );
  for (const changed of [
    current.replace("inputs.queue && 'pages-preview-lifecycle'", "inputs.queue && 'other'"),
    current.replace(
      "inputs.queue && 'pages-preview-lifecycle'",
      "true && 'pages-preview-lifecycle'"
    ),
    current.replace("queue: ${{ inputs.queue && 'max' || 'single' }}", 'queue: single'),
    current.replace('cancel-in-progress: ${{ !inputs.queue }}', 'cancel-in-progress: false'),
  ])
    assert.throws(() => normalizeQueueWorkflow(changed, filename));
});
test('configuration-only publisher extension is exact, job-scoped and preserves line numbers', () => {
  for (const filename of ['.github/workflows/review-admission.yml']) {
    const source = readFileSync(filename, 'utf8');
    assert.equal(
      normalizePublisherEnvironment(source, filename),
      source.replace('      deployment: false', '')
    );
    const unsafe = [
      source.replace('deployment: false', 'deployment: true'),
      source.replace('deployment: false', 'deployment: ${{ inputs.enabled }}'),
      source.replace('      deployment: false\n', ''),
      source.replace('name: review-admission', 'name: other'),
      source.replace('    environment:', '    other:'),
      source.replace('      deployment: false', '      deployment: false\n      unknown: true'),
      `${source}    deployment: false\n`,
      `${source}  other:\n    runs-on: ubuntu-latest\n    environment:\n      name: review-admission\n      deployment: false\n`,
    ];
    for (const changed of unsafe)
      assert.throws(() => normalizePublisherEnvironment(changed, filename));
    const reordered = source.replace(
      '      name: review-admission\n      deployment: false',
      '      deployment: false\n      name: review-admission'
    );
    assert.equal(
      normalizePublisherEnvironment(reordered, filename),
      reordered.replace('      deployment: false', '')
    );
    const invalid = source.replace(/^ {4}runs-on: .+$/m, '    unknown-key: true');
    assert.match(normalizePublisherEnvironment(invalid, filename), /unknown-key: true/);
    assert.equal(normalizePublisherEnvironment(source, '.github/workflows/foreign.yml'), source);
  }
});
