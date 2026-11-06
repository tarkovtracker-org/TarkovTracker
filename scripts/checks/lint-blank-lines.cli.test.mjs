// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const script = fileURLToPath(new URL('./lint-blank-lines.mjs', import.meta.url));
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'blank-lines-cli-')));
const source = 'const first = 1;\n\nconst second = 2;\n';
const expected = 'const first = 1;\nconst second = 2;\n';
const write = (name, content = source) => {
  const file = join(directory, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
};
const run = (args, env = {}) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
beforeAll(() => execFileSync('git', ['init', '--quiet', directory]));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe('blank-line CLI contract', () => {
  it('checks without writing, fixes, and then accepts the same file', () => {
    const file = write('check.mjs');
    const dirty = run([file]);
    expect(dirty.status).toBe(1);
    expect(dirty.stdout).toBe('blank lines check.mjs: 1\n');
    expect(dirty.stderr).toBe('Found 1 removable blank line(s) in 1 file(s).\n');
    expect(readFileSync(file, 'utf8')).toBe(source);
    const fixed = run(['--fix', file]);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).toBe('fixed check.mjs: 1\n');
    expect(fixed.stderr).toBe('');
    expect(readFileSync(file, 'utf8')).toBe(expected);
    const clean = run([file]);
    expect(clean.status).toBe(0);
    expect(clean.stdout).toBe('');
    expect(clean.stderr).toBe('');
  });
  it.each([
    'dist/example.mjs',
    'node_modules/example.mjs',
    '.nuxt/example.mjs',
    'coverage/example.mjs',
    '.coderabbit.yaml',
    'pnpm-lock.yaml',
    'app/locales/fr.json',
    'supabase/functions/_shared/database.types.ts',
    'example.md',
  ])('preserves excluded path %s', (name) => {
    const file = write(name);
    expect(run(['--fix', file]).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(source);
  });
  it.each(['notdist/example.mjs', 'app/locales/en.json', 'with spaces/example.ts'])(
    'processes supported path %s',
    (name) => {
      const file = write(name);
      expect(run(['--fix', file]).status).toBe(0);
      expect(readFileSync(file, 'utf8')).toBe(expected);
    }
  );
  it('ignores a deleted file', () => {
    expect(run(['--fix', join(directory, 'deleted.mjs')]).status).toBe(0);
  });
  it('honors the explicit parser fallback environment flag', () => {
    const input = 'const view = <pre>first\n\nsecond</pre>;\n\nnext();\n';
    const file = write('fallback.tsx', input);
    expect(run(['--fix', file], { LINT_BLANK_LINES_FORCE_FALLBACK: '1' }).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(input);
  });
  it('discovers tracked files and skips tracked symlinks', () => {
    const file = write('tracked.mjs');
    const target = write('target.mjs');
    const link = join(directory, 'linked.mjs');
    symlinkSync(target, link);
    execFileSync('git', ['add', 'tracked.mjs', 'linked.mjs'], { cwd: directory });
    expect(run(['--fix']).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(expected);
    expect(readFileSync(target, 'utf8')).toBe(source);
  });
});
