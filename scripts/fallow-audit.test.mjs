import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const rootUrl = new URL('..', import.meta.url);
const root = rootUrl.protocol === 'file:' ? fileURLToPath(rootUrl) : process.cwd();
const script = join(root, 'scripts/fallow-audit.mjs');
const fallow = join(root, 'node_modules/fallow/bin/fallow');
const directory = mkdtempSync(join(tmpdir(), 'fallow-audit-test-'));
const repository = join(directory, 'repository with spaces');
const scratch = join(directory, 'scratch');
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
const complex = (name) =>
  `export function ${name}(value) {\nlet result = 0;\n${Array.from(
    { length: 25 },
    (_, index) => `if (value > ${index}) result += ${index + 1};`
  ).join('\n')}\nreturn result;\n}\n`;
const clone = `const output = [];
for (const value of values) {
  const scaled = value * 2;
  const shifted = scaled + 3;
  const normalized = Math.abs(shifted);
  const rounded = Math.round(normalized);
  const clamped = Math.min(rounded, 100);
  const formatted = Number(clamped.toFixed(2));
  output.push(formatted);
}
return output;
`;
const files = {
  '.gitignore': '.nuxt\nnode_modules\n.fallow\n',
  '.fallowrc.json': JSON.stringify({
    entry: ['index.ts'],
    autoImports: true,
    rules: { 'circular-dependency': 'warn' },
    duplicates: { minTokens: 80, minLines: 8, skipLocal: true },
  }),
  'package.json': JSON.stringify({
    name: 'fallow-audit-fixture',
    private: true,
    type: 'module',
    devDependencies: { nuxt: '*' },
  }),
  'nuxt.config.ts':
    "const appDir = fileURLToPath(new URL('./app', import.meta.url));\nexport default defineNuxtConfig({ srcDir: 'app', alias: { '@': appDir }, imports: { dirs: ['.'] } });\n",
  'tsconfig.json': JSON.stringify({
    extends: './.nuxt/tsconfig.json',
    compilerOptions: { types: ['node', 'vitest'] },
    exclude: ['supabase/functions/**/*', 'workers/**/*'],
  }),
  'index.ts': `import { heavy, simple, value } from '@/logic';
import { left } from './left/a';
import { right } from './right/b';
import { cycleA } from './cycle/a';
import { freshA } from './fresh/a';
console.log(heavy(2), simple(1), value(), left([1]), right([2]), cycleA(0), freshA(0));
`,
  'app/logic.ts': `${complex('heavy')}
export function simple(value) { return value + 1; }
export interface LocalOnly { value: number }
export function value() { const local: LocalOnly = { value: 1 }; return local.value; }
`,
  'left/a.ts': `export function left(values) {\n${clone}}\n`,
  'right/b.ts': `export function right(values) {\n${clone}}\n`,
  'cycle/a.ts': `import { cycleB } from './b';
export function cycleA(n) { return n > 0 ? cycleB(n - 1) : 0; }
`,
  'cycle/b.ts': `import { cycleA } from './a';
export function cycleB(n) { return n > 0 ? cycleA(n - 1) : 0; }
`,
  'fresh/a.ts': "import { freshB } from './b';\nexport function freshA(n) { return freshB(n); }\n",
  'fresh/b.ts': 'export function freshB(n) { return n; }\n',
};
const write = (path, content) => {
  const target = join(repository, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
};
const run = (args = [], environment = {}) =>
  spawnSync(process.execPath, [script, '--base', 'HEAD', '--format', 'json', ...args], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch, ...environment },
    maxBuffer: 8 * 1024 * 1024,
  });
const report = (result, status) => {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(status);
  expect(readdirSync(scratch)).toEqual([]);
  return JSON.parse(result.stdout);
};
beforeAll(() => {
  mkdirSync(scratch, { recursive: true });
  for (const [path, content] of Object.entries(files)) write(path, content);
  git('init', '--quiet');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.hooksPath', scratch);
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture baseline');
  write(
    '.nuxt/tsconfig.json',
    JSON.stringify({
      compilerOptions: { paths: { '@/*': ['../app/*'], '#imports': ['./imports'] } },
    })
  );
  write('.nuxt/imports.d.ts', "export { value, LocalOnly } from '../app/logic';\n");
  symlinkSync(join(root, 'node_modules'), join(repository, 'node_modules'), 'junction');
});
beforeEach(() => {
  for (const [path, content] of Object.entries(files)) write(path, content);
  rmSync(join(repository, 'app/new.ts'), { force: true });
  rmSync(join(repository, 'app/renamed.ts'), { force: true });
  git('read-tree', 'HEAD');
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe('Fallow audit context', () => {
  it('fixes the native Nuxt alias reproduction without hiding inherited findings', () => {
    write('app/logic.ts', `\n${files['app/logic.ts']}`);
    write('.gitignore', `\n${files['.gitignore']}`);
    const native = spawnSync(
      process.execPath,
      [
        fallow,
        'audit',
        '--base',
        'HEAD',
        '--gate',
        'new-only',
        '--format',
        'json',
        '--quiet',
        '--no-cache',
      ],
      { cwd: repository, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    expect(native.status, native.stderr + native.stdout).toBe(1);
    expect(JSON.parse(native.stdout).dead_code.unused_types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ export_name: 'LocalOnly', introduced: true }),
      ])
    );
    const status = git('status', '--porcelain');
    const index = readFileSync(join(repository, '.git/index'));
    const result = report(run(), 0);
    expect(result.attribution.dead_code_introduced).toBe(0);
    expect(result.attribution.dead_code_inherited).toBeGreaterThan(0);
    expect(result.attribution.complexity_introduced).toBe(0);
    expect(result.attribution.complexity_inherited).toBeGreaterThan(0);
    expect(readFileSync(join(repository, '.git/index'))).toEqual(index);
    expect(git('status', '--porcelain')).toBe(status);
    expect(readFileSync(join(repository, 'app/logic.ts'), 'utf8')).toBe(
      `\n${files['app/logic.ts']}`
    );
  });
  it('inherits unchanged findings across a broad touched-file diff', () => {
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith('.ts')) write(path, `\n${content}`);
    }
    const result = report(run(), 0);
    expect(result.attribution.dead_code_introduced).toBe(0);
    expect(result.attribution.complexity_introduced).toBe(0);
    expect(result.attribution.duplication_introduced).toBe(0);
    expect(result.attribution.duplication_inherited).toBeGreaterThan(0);
  });
  it('passes an unrelated edit in a complex file', () => {
    write('app/logic.ts', files['app/logic.ts'].replace('return value + 1;', 'return value + 2;'));
    expect(report(run(), 0).attribution.complexity_introduced).toBe(0);
  });
  it.each([
    ['unused export', 'export const unusedValue = 42;'],
    ['unused type', 'export type UnusedType = { id: string };'],
  ])('fails a new %s', (_, addition) => {
    write('app/logic.ts', `${files['app/logic.ts']}\n${addition}\n`);
    expect(report(run(), 1).attribution.dead_code_introduced).toBe(1);
  });
  it('fails a newly complex function even when the finding count stays equal', () => {
    write(
      'app/logic.ts',
      files['app/logic.ts']
        .replace(complex('heavy'), 'export function heavy(value) { return value; }\n')
        .replace('export function simple(value) { return value + 1; }', complex('simple'))
    );
    expect(report(run(), 1).attribution.complexity_introduced).toBeGreaterThan(0);
  });
  it('fails a new complexity finding alongside inherited complexity', () => {
    write(
      'app/logic.ts',
      files['app/logic.ts'].replace(
        'export function simple(value) { return value + 1; }',
        complex('simple')
      )
    );
    const result = report(run(), 1);
    expect(result.attribution.complexity_introduced).toBeGreaterThan(0);
    expect(result.attribution.complexity_inherited).toBeGreaterThan(0);
  });
  it('inherits findings after a pure file rename', () => {
    renameSync(join(repository, 'app/logic.ts'), join(repository, 'app/renamed.ts'));
    write('index.ts', files['index.ts'].replace('@/logic', '@/renamed'));
    const result = report(run(), 0);
    expect(result.attribution.dead_code_introduced).toBe(0);
    expect(result.attribution.complexity_introduced).toBe(0);
  });
  it('keeps a genuinely new warning-only cycle nonblocking', () => {
    write(
      'fresh/b.ts',
      "import { freshA } from './a';\nexport function freshB(n) { return n > 0 ? freshA(n - 1) : n; }\n"
    );
    const result = report(run(), 0);
    expect(result.verdict).toBe('warn');
    expect(result.attribution.dead_code_introduced).toBeGreaterThan(0);
  });
  it('includes staged, unstaged, and untracked changes without modifying the source index', () => {
    write('app/logic.ts', `${files['app/logic.ts']}\nexport const stagedValue = 1;\n`);
    git('add', 'app/logic.ts');
    write(
      'app/logic.ts',
      `${files['app/logic.ts']}\nexport const stagedValue = 1;\nexport const unstagedValue = 2;\n`
    );
    write('app/new.ts', 'export const untrackedValue = 3;\n');
    const status = git('status', '--porcelain');
    const index = readFileSync(join(repository, '.git/index'));
    const result = report(run(), 1);
    expect(result.dead_code.unused_exports.map((finding) => finding.export_name)).toEqual(
      expect.arrayContaining(['stagedValue', 'unstagedValue'])
    );
    expect(result.dead_code.unused_files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'app/new.ts', introduced: true })])
    );
    expect(readFileSync(join(repository, '.git/index'))).toEqual(index);
    expect(git('status', '--porcelain')).toBe(status);
  });
  it('rejects invalid refs instead of passing an empty audit', () => {
    const result = run(['--base', 'missing-ref']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('[fallow audit]');
    expect(readdirSync(scratch)).toEqual([]);
  });
  it('ignores inherited Git location and index overrides', () => {
    write('app/logic.ts', `\n${files['app/logic.ts']}`);
    report(
      run([], {
        GIT_DIR: join(directory, 'missing'),
        GIT_WORK_TREE: directory,
        GIT_INDEX_FILE: join(repository, '.git/index'),
      }),
      0
    );
    expect(git('diff', '--cached')).toBe('');
  });
  it('materializes generated context even when the source directory is a symlink', () => {
    const generated = join(repository, '.nuxt');
    const target = join(directory, 'generated');
    renameSync(generated, target);
    symlinkSync(target, generated, 'junction');
    try {
      write('app/logic.ts', `\n${files['app/logic.ts']}`);
      report(run(), 0);
    } finally {
      rmSync(generated);
      renameSync(target, generated);
    }
  });
  it('fails explicitly when generated Nuxt context is missing', () => {
    const config = join(repository, '.nuxt/tsconfig.json');
    const original = readFileSync(config);
    rmSync(config);
    try {
      const result = run();
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Missing generated Nuxt tsconfig');
      expect(readdirSync(scratch)).toEqual([]);
    } finally {
      writeFileSync(config, original);
    }
  });
  it('cleans up after an analyzer configuration failure', () => {
    write('.fallowrc.json', '{ invalid json');
    const result = run();
    expect(result.status).toBe(2);
    expect(readdirSync(scratch)).toEqual([]);
  });
});
