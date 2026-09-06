import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  classifyPaths,
  parseNameStatus,
  collectChanges,
  aggregateResults,
  fullJobs,
} from '../validation-plan.mjs';
import { gitExecutable } from '../validation-tools.mjs';
const cli = resolve('scripts/validate-changes.mjs');
test('only explicit documentation and translation paths receive reduced validation', () => {
  for (const paths of [
    ['README.md'],
    ['docs/topic.markdown'],
    ['.github/CONTRIBUTING.md'],
    ['app/locales/en.json'],
    ['app/locales/fr.json'],
    ['README.md', 'app/locales/cs.json'],
  ]) {
    assert.equal(classifyPaths(paths).full, false, paths.join());
  }
  for (const path of [
    'DESIGN.md',
    'app/test.ts',
    'workers/a.ts',
    'supabase/migrations/a.sql',
    'scripts/precompute/run.ts',
    'package.json',
    'pnpm-lock.yaml',
    'vitest.config.ts',
    '.github/workflows/ci.yml',
    'public/llms.txt',
    'app/types/generated.d.ts',
    'unknown',
    '../docs/a.md',
    'docs/script.sh',
  ]) {
    assert.equal(classifyPaths([path]).full, true, path);
  }
  assert.equal(classifyPaths([]).full, true);
  assert.equal(classifyPaths(['README.md', 'app/a.ts']).full, true);
  assert.equal(classifyPaths(['README.md']).i18n, false);
  assert.equal(classifyPaths(['app/locales/de.json']).i18n, true);
  assert.equal(classifyPaths(['README.md'], { forceFull: true }).full, true);
});
test('name-status parser includes both rename paths and deletions without splitting filenames', () => {
  assert.deepEqual(parseNameStatus('R100\0app/a.ts\0docs/a.md\0D\0file with\nnewline.md\0'), [
    'app/a.ts',
    'docs/a.md',
    'file with\nnewline.md',
  ]);
  for (const bad of ['M\0', 'R100\0one\0', 'M\0truncated', 'invalid\0path\0'])
    assert.throws(() => parseNameStatus(bad));
});
test('aggregate fails closed on selected failures, cancellations, unexpected skips and missing data', () => {
  for (const paths of [['app/a.ts'], ['README.md']]) {
    const plan = classifyPaths(paths);
    const needs = {
      changes: { result: 'success' },
      ...Object.fromEntries(
        fullJobs.map((job) => [job, { result: plan.jobs.includes(job) ? 'success' : 'skipped' }])
      ),
    };
    assert.deepEqual(aggregateResults(plan, needs), []);
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      assert.ok(aggregateResults(plan, { ...needs, 'lint-format': { result } }).length);
    }
    assert.ok(aggregateResults(plan, { ...needs, changes: { result: 'failure' } }).length);
    assert.ok(aggregateResults(undefined, needs).length);
    assert.ok(aggregateResults({ ...plan, jobs: [] }, needs).length);
    if (!plan.full)
      assert.ok(aggregateResults(plan, { ...needs, test: { result: 'success' } }).length);
  }
});
test('local classifier includes committed, staged, unstaged and untracked paths; CI ignores dirt', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'validation-git-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync(gitExecutable(), args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  writeFileSync(join(cwd, 'README.md'), 'base');
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'docs/a.md'), 'committed');
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'docs');
  writeFileSync(join(cwd, 'staged.ts'), 'staged');
  git('add', 'staged.ts');
  writeFileSync(join(cwd, 'README.md'), 'unstaged');
  writeFileSync(join(cwd, 'untracked.ts'), 'untracked');
  assert.deepEqual(collectChanges({ cwd, base }).paths.sort(), [
    'README.md',
    'docs/a.md',
    'staged.ts',
    'untracked.ts',
  ]);
  assert.deepEqual(collectChanges({ cwd, base, local: false }).paths, ['docs/a.md']);
  assert.ok(collectChanges({ cwd, base: 'missing-ref' }).error);
  const explain = (...args) =>
    JSON.parse(
      execFileSync(process.execPath, [cli, '--explain', '--base', base, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: '' },
      })
    );
  assert.equal(explain().full, true);
  assert.equal(explain('--mode', 'ci').full, false);
  assert.equal(explain('--mode', 'ci', '--shadow').full, true);
  assert.equal(explain('--mode', 'ci', '--shadow').proposed.full, false);
  assert.equal(explain('--mode', 'ci', '--bad-option').full, true);
  assert.equal(explain('--mode', 'full').full, true);
});
