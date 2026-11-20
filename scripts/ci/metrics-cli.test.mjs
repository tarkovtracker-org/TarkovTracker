// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitExecutable } from './validation-tools.mjs';
let root;
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key === 'GIT_EXECUTABLE' || !key.startsWith('GIT_'))
);
const git = (...args) =>
  execFileSync(gitExecutable(), ['-C', root, ...args], {
    env: environment,
    encoding: 'utf8',
  }).trim();
const write = (path, content) => writeFileSync(join(root, path), content);
const run = (...args) =>
  spawnSync(process.execPath, [join(root, 'scripts/ci/metrics.mjs'), ...args], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
  });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'metrics-cli-test-'));
  mkdirSync(join(root, 'scripts/ci'), { recursive: true });
  mkdirSync(join(root, 'app'));
  mkdirSync(join(root, '.nuxt'));
  mkdirSync(join(root, 'node_modules/fallow/bin'), { recursive: true });
  for (const name of ['metrics.mjs', 'metrics-lib.mjs', 'validation-tools.mjs']) {
    cpSync(fileURLToPath(new URL(name, import.meta.url)), join(root, 'scripts/ci', name));
  }
  write('.gitignore', 'node_modules/\n.nuxt/\n');
  write('.gitattributes', '* -text\n');
  write('.fallowrc.json', '{}\n');
  write('app/a.ts', 'one\n');
  write(
    'node_modules/fallow/package.json',
    JSON.stringify({ exports: { './bin/fallow': './bin/fallow/index.cjs' } })
  );
  mkdirSync(join(root, 'node_modules/fallow/bin/fallow'));
  write(
    'node_modules/fallow/bin/fallow/index.cjs',
    `
    process.stdout.write(JSON.stringify({ summary: { coverage_model: 'static_estimated' } }));
  `
  );
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  git('config', 'user.name', 'Metrics test');
  git('config', 'user.email', 'metrics@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', join(root, 'disabled-hooks'));
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('metrics CLI measured snapshots', () => {
  it('requires paired coverage reports for comparisons', () => {
    for (const args of [
      ['--base-coverage', 'base.json'],
      ['--base', 'HEAD', '--base-coverage', 'base.json'],
      ['--coverage', 'head.json', '--base-coverage', 'base.json'],
      ['--base', 'HEAD', '--coverage', 'head.json'],
    ]) {
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('requires');
      expect(result.stdout).toBe('');
    }
  });
  it('maps both Istanbul reports to the exact analyzed checkout', () => {
    write(
      'node_modules/fallow/bin/fallow/index.cjs',
      `
      const fs = require('node:fs');
      const path = require('node:path');
      const args = process.argv;
      const root = args[args.indexOf('--root') + 1];
      const report = JSON.parse(fs.readFileSync(args[args.indexOf('--coverage') + 1], 'utf8'));
      const expected = path.join(root, 'app/a.ts');
      if (Object.keys(report)[0] !== expected || report[expected].path !== expected) {
        throw new Error('coverage paths do not match checkout');
      }
      process.stdout.write(JSON.stringify({ summary: {
        coverage_model: report[expected].model ?? 'istanbul'
      } }));
      `
    );
    const path = join(root, 'app/a.ts');
    write('head.json', JSON.stringify({ [path]: { path } }));
    write('base.json', JSON.stringify({ [path]: { path } }));
    const args = ['--base', 'HEAD', '--coverage', 'head.json', '--base-coverage', 'base.json'];
    const result = run(...args);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CRAP model: istanbul');
    mkdirSync(join(root, 'coverage-input'));
    write('coverage-input/coverage-final.json', JSON.stringify({ [path]: { path } }));
    expect(run('--coverage', 'coverage-input').status).toBe(0);
    for (const report of ['head.json', 'base.json']) {
      write(report, JSON.stringify({ [path]: { path, model: 'static_estimated' } }));
      const fallback = run(...args);
      expect(fallback.status).toBe(1);
      expect(fallback.stderr).toContain('Expected Istanbul coverage');
      expect(fallback.stdout).toBe('');
      write(report, JSON.stringify({ [path]: { path } }));
    }
  });
  it('normalizes only synthetic implicit-else counts in both temporary reports', () => {
    write(
      'node_modules/fallow/bin/fallow/index.cjs',
      `
      const fs = require('node:fs');
      const assert = require('node:assert/strict');
      const args = process.argv;
      const root = args[args.indexOf('--root') + 1];
      const report = JSON.parse(fs.readFileSync(args[args.indexOf('--coverage') + 1], 'utf8'));
      const [entry] = Object.values(report);
      assert.deepEqual(entry.b, { 0: [1, 0], 1: [2, 0], 2: [3, 4] });
      assert.deepEqual(entry.s, { 0: 5 });
      assert.deepEqual(entry.f, { 0: 6 });
      assert.deepEqual(entry.branchMap[0].locations[1], { start: {}, end: {} });
      assert.equal(entry.path, require('node:path').join(root, 'app/a.ts'));
      process.stdout.write(JSON.stringify({ summary: { coverage_model: 'istanbul' } }));
      `
    );
    const path = join(root, 'app/a.ts');
    const synthetic = { type: 'if', locations: [{ start: { line: 1 } }, { start: {}, end: {} }] };
    const data = {
      path,
      s: { 0: 5 },
      f: { 0: 6 },
      b: { 0: [1, -1], 1: [2, -7], 2: [3, 4] },
      branchMap: { 0: synthetic, 1: synthetic, 2: synthetic },
    };
    const artifact = JSON.stringify({ [path]: data });
    write('head.json', artifact);
    write('base.json', artifact);
    const result = run('--base', 'HEAD', '--coverage', 'head.json', '--base-coverage', 'base.json');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CRAP model: istanbul');
    expect(readFileSync(join(root, 'head.json'), 'utf8')).toBe(artifact);
    expect(readFileSync(join(root, 'base.json'), 'utf8')).toBe(artifact);
  });
  it.each([
    ['s', { 0: -1 }],
    ['f', { 0: -1 }],
    ['b', { 0: [1, -1] }],
    ['bT', { 0: [-1] }],
  ])('rejects a negative %s counter outside the synthetic implicit else', (counter, hits) => {
    const path = join(root, 'app/a.ts');
    const explicit = { type: 'if', locations: [{}, { start: { line: 1 }, end: { line: 1 } }] };
    write(
      'head.json',
      JSON.stringify({ [path]: { path, [counter]: hits, branchMap: { 0: explicit } } })
    );
    const result = run('--coverage', 'head.json');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Negative Istanbul counter ${counter}[0]`);
    expect(result.stderr).toContain(path);
    expect(result.stdout).toBe('');
  });
  it.each([
    ['base', 'one'],
    ['head', 'two'],
  ])(
    'reports Fallow exit status and its structured diagnostic for a failed %s snapshot',
    (revision, source) => {
      const baseCommit = git('rev-parse', 'HEAD');
      write('app/a.ts', 'two\n');
      git('add', 'app/a.ts');
      git('commit', '--quiet', '-m', 'head');
      write(
        'node_modules/fallow/bin/fallow/index.cjs',
        `
      const fs = require('node:fs');
      if (fs.readFileSync('app/a.ts', 'utf8').trim() === ${JSON.stringify(source)}) {
        process.stdout.write(JSON.stringify({ error: true, message: 'invalid coverage input', exit_code: 2 }));
        process.exitCode = 2;
      } else {
        process.stdout.write(JSON.stringify({ summary: { coverage_model: 'static_estimated' } }));
      }
      `
      );
      const result = run('--base', baseCommit);
      expect(result.status).toBe(1);
      const commit = revision === 'base' ? baseCommit : git('rev-parse', 'HEAD');
      expect(result.stderr).toContain(`${revision} ${commit}`);
      expect(result.stderr).toContain('exit 2');
      expect(result.stderr).toContain('invalid coverage input');
      expect(result.stdout).toBe('');
    }
  );
  it('rejects coverage paths outside the source checkout', () => {
    const path = join(root, '..', 'other', 'app/a.ts');
    write('head.json', JSON.stringify({ [path]: { path } }));
    const result = run('--coverage', 'head.json');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('outside the source checkout');
  });
});
describe('metrics CLI working-tree snapshots', () => {
  it('identifies clean and dirty snapshots and labels a dirty comparison', () => {
    expect(JSON.parse(run().stdout).dirty).toBe(false);
    write('app/a.ts', 'one\ntwo\n');
    const changed = JSON.parse(run().stdout);
    expect(changed).toMatchObject({ dirty: true, loc: { runtime: { files: 1, lines: 2 } } });
    const comparison = run('--base', 'HEAD');
    expect(comparison.status).toBe(0);
    expect(comparison.stdout).toContain('Head includes uncommitted working-tree changes.');
    expect(comparison.stdout).toContain('| Runtime LOC | 1 | 2 | +1 |');
  });
  it('rejects comparisons with changed Fallow configuration', () => {
    write('.fallowrc.json', '{"health":{"ignore":["app/**"]}}\n');
    const result = run('--base', 'HEAD');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Fallow configurations differ');
    expect(result.stdout).toBe('');
  });
  it('counts a file appearing in both cached and untracked Git output only once', () => {
    git('rm', '--cached', '--quiet', 'app/a.ts');
    const result = run();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).loc.runtime).toEqual({ files: 1, lines: 1 });
  });
  it('handles a tracked file replaced by a directory and deleted files', () => {
    rmSync(join(root, 'app/a.ts'));
    mkdirSync(join(root, 'app/a.ts'));
    write('app/a.ts/child.ts', 'child\n');
    const result = run();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).loc.runtime).toEqual({ files: 1, lines: 1 });
    rmSync(join(root, 'app/a.ts'), { recursive: true });
    expect(JSON.parse(run().stdout).loc.runtime).toEqual({ files: 0, lines: 0 });
  });
  it('preserves leading whitespace in Git filenames', () => {
    git('rm', '--quiet', 'app/a.ts');
    write(' leading.test.mjs', 'test\n');
    expect(JSON.parse(run().stdout).loc.tests).toEqual({ files: 1, lines: 1 });
  });
});
