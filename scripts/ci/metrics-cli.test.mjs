// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  git('config', 'user.name', 'Metrics test');
  git('config', 'user.email', 'metrics@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', join(root, 'disabled-hooks'));
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
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
