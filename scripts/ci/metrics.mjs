#!/usr/bin/env node
// Codebase metrics snapshot, optionally compared with a base ref. See scripts/ci/README.md.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  assertComparable,
  classifyPath,
  compareSnapshots,
  countLines,
  renderComparison,
  summarizeHealth,
  summarizeLoc,
} from './metrics-lib.mjs';
import { gitExecutable } from './validation-tools.mjs';
const fallow = fileURLToPath(import.meta.resolve('fallow/bin/fallow'));
const gitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);
const git = (args) =>
  execFileSync(gitExecutable(), args, {
    encoding: 'utf8',
    env: gitEnvironment,
    maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
function collectLoc(root) {
  const paths = git(['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((path) => path && classifyPath(path) && existsSync(join(root, path)));
  return summarizeLoc(
    paths.map((path) => ({ path, lines: countLines(readFileSync(join(root, path), 'utf8')) }))
  );
}
function collectHealth(root, coverage) {
  const args = ['health', '--root', root, '--format', 'json', '--quiet', '--report-only'];
  if (coverage) args.push('--coverage', resolve(coverage));
  const result = spawnSync(process.execPath, [fallow, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnvironment,
    maxBuffer: 256 << 20,
  });
  if (result.status !== 0) throw new Error(`fallow health failed: ${result.stderr.trim()}`);
  return summarizeHealth(JSON.parse(result.stdout));
}
const snapshot = (root, coverage) => ({
  commit: git(['-C', root, 'rev-parse', 'HEAD']),
  loc: collectLoc(root),
  health: collectHealth(root, coverage),
});
// Fallow resolves Nuxt auto-imports through the generated .nuxt context, which is not tracked,
// so the base checkout borrows the current one, as scripts/checks/fallow-audit.mjs does.
function checkoutBase(source, base, directory) {
  const destination = join(directory, 'repository');
  const hooks = join(directory, 'hooks');
  mkdirSync(hooks);
  git([
    '-c',
    `core.hooksPath=${hooks}`,
    'clone',
    '--shared',
    '--no-checkout',
    '--quiet',
    '--',
    source,
    destination,
  ]);
  git(['-C', destination, 'checkout', '--quiet', '--detach', base]);
  cpSync(realpathSync(join(source, '.nuxt')), join(destination, '.nuxt'), { recursive: true });
  symlinkSync(
    realpathSync(join(source, 'node_modules')),
    join(destination, 'node_modules'),
    'junction'
  );
  return destination;
}
function snapshotBase(source, ref) {
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  const base = git(['merge-base', 'HEAD', commit]);
  const directory = mkdtempSync(join(tmpdir(), 'tarkovtracker-metrics-'));
  try {
    return snapshot(checkoutBase(source, base, directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function readOptions() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      coverage: { type: 'string' },
      summary: { type: 'string' },
    },
  });
  return values;
}
function emit(text, summary) {
  process.stdout.write(text);
  if (summary) appendFileSync(summary, text);
}
function main() {
  const options = readOptions();
  const source = git(['rev-parse', '--show-toplevel']);
  const head = snapshot(source, options.coverage);
  if (!options.base) {
    emit(`${JSON.stringify(head, null, 2)}\n`, options.summary);
    return;
  }
  const base = snapshotBase(source, options.base);
  assertComparable(base, head);
  const rows = compareSnapshots(base, head);
  const crapModel = head.health.crap.model;
  emit(
    renderComparison(rows, { base: base.commit, head: head.commit, crapModel }),
    options.summary
  );
}
try {
  main();
} catch (error) {
  console.error(`[metrics] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
