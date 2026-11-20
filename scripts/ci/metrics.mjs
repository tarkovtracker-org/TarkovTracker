#!/usr/bin/env node
// Codebase metrics snapshot, optionally compared with a base ref. See scripts/ci/README.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
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
const gitOutput = (args) =>
  execFileSync(gitExecutable(), args, {
    encoding: 'utf8',
    env: gitEnvironment,
    maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const git = (args) => gitOutput(args).trim();
function collectLoc(root) {
  const candidates = gitOutput([
    '-C',
    root,
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]).split('\0');
  const paths = [...new Set(candidates)].filter(
    (path) => classifyPath(path) && lstatSync(join(root, path), { throwIfNoEntry: false })?.isFile()
  );
  return summarizeLoc(
    paths.map((path) => ({ path, lines: countLines(readFileSync(join(root, path), 'utf8')) }))
  );
}
function structuredFallowError(stdout) {
  try {
    const { error, message } = JSON.parse(stdout);
    return [error === true, typeof message === 'string'].every(Boolean) ? message : undefined;
  } catch {
    // Some failures produce plain stderr instead of a JSON error envelope.
  }
}
function fallowFailure(result) {
  const status = result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
  const detail = structuredFallowError(result.stdout) || result.stderr.trim() || 'no diagnostic';
  return new Error(`fallow health failed (${status}): ${detail}`);
}
function runHealth(root, coverage) {
  const args = [
    'health',
    '--root',
    root,
    '--config',
    join(root, '.fallowrc.json'),
    '--format',
    'json',
    '--quiet',
    '--report-only',
    '--no-cache',
  ];
  if (coverage) args.push('--coverage', resolve(coverage));
  const result = spawnSync(process.execPath, [fallow, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnvironment,
    maxBuffer: 256 << 20,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw fallowFailure(result);
  return summarizeHealth(JSON.parse(result.stdout));
}
function collectHealth(root, coverage) {
  const health = runHealth(root, coverage);
  if (coverage && health.crap.model !== 'istanbul') {
    throw new Error(`Expected Istanbul coverage for ${root}, got ${health.crap.model}`);
  }
  return health;
}
// Reports from both CI revisions use the source checkout's absolute paths. Fallow
// must receive paths belonging to the actual checkout being analyzed.
function coveragePath(path, source, root) {
  const local = relative(source, resolve(source, path));
  if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) {
    throw new Error(`Coverage path is outside the source checkout: ${path}`);
  }
  return join(root, local);
}
function readCoverage(coverage) {
  const input = resolve(coverage);
  try {
    return readFileSync(input, 'utf8');
  } catch (error) {
    if (error.code !== 'EISDIR') throw error;
    return readFileSync(join(input, 'coverage-final.json'), 'utf8');
  }
}
function isSyntheticElse(branch) {
  return [
    branch?.type === 'if',
    isDeepStrictEqual(branch?.locations?.[1], { start: {}, end: {} }),
  ].every(Boolean);
}
function normalizeBranchHits(hits, branch) {
  if (!Array.isArray(hits) || hits.length !== 2) return hits;
  // ast-v8-to-istanbul#207 can derive a negative count for the unlocated implicit else.
  const negativeImplicitElse = [
    isSyntheticElse(branch),
    Number.isInteger(hits[1]),
    hits[1] < 0,
  ].every(Boolean);
  return negativeImplicitElse ? [hits[0], 0] : hits;
}
function assertNonNegativeHits(hits, path, counter) {
  for (const [id, value] of Object.entries(hits ?? {})) {
    if ([value].flat().some((count) => count < 0)) {
      throw new Error(`Negative Istanbul counter ${counter}[${id}] in ${path}`);
    }
  }
}
function normalizeCoverageCounters(data, path) {
  if (data.b) {
    data.b = Object.fromEntries(
      Object.entries(data.b).map(([id, hits]) => [
        id,
        normalizeBranchHits(hits, data.branchMap?.[id]),
      ])
    );
  }
  for (const counter of ['s', 'f', 'b', 'bT']) {
    assertNonNegativeHits(data[counter], path, counter);
  }
}
function measuredHealth(root, coverage, source) {
  if (!coverage) return collectHealth(root);
  const report = JSON.parse(readCoverage(coverage));
  const entries = Object.entries(report).map(([path, data]) => {
    const target = coveragePath(path, source, root);
    normalizeCoverageCounters(data, path);
    return [target, { ...data, path: coveragePath(data.path ?? path, source, root) }];
  });
  const directory = mkdtempSync(join(tmpdir(), 'tarkovtracker-coverage-'));
  try {
    const normalized = join(directory, 'coverage-final.json');
    writeFileSync(normalized, JSON.stringify(Object.fromEntries(entries)));
    return collectHealth(root, normalized);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function snapshotHealth(root, coverage, source, commit) {
  try {
    return measuredHealth(root, coverage, source);
  } catch (error) {
    const revision = root === source ? 'head' : 'base';
    throw new Error(`${revision} ${commit}: ${error.message}`, { cause: error });
  }
}
function snapshot(root, coverage, source = root) {
  const commit = git(['-C', root, 'rev-parse', 'HEAD']);
  return {
    commit,
    dirty: gitOutput(['-C', root, 'status', '--porcelain', '--untracked-files=all']).length > 0,
    analysis_config: createHash('sha256')
      .update(readFileSync(join(root, '.fallowrc.json')))
      .digest('hex'),
    loc: collectLoc(root),
    health: snapshotHealth(root, coverage, source, commit),
  };
}
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
  git(['-C', destination, 'config', 'core.hooksPath', hooks]);
  git(['-C', destination, 'checkout', '--quiet', '--detach', base]);
  cpSync(realpathSync(join(source, '.nuxt')), join(destination, '.nuxt'), { recursive: true });
  symlinkSync(
    realpathSync(join(source, 'node_modules')),
    join(destination, 'node_modules'),
    'junction'
  );
  return destination;
}
function snapshotBase(source, ref, coverage) {
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  const base = git(['merge-base', 'HEAD', commit]);
  const directory = mkdtempSync(join(tmpdir(), 'tarkovtracker-metrics-'));
  try {
    return snapshot(checkoutBase(source, base, directory), coverage, source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function readOptions() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      coverage: { type: 'string' },
      'base-coverage': { type: 'string' },
      summary: { type: 'string' },
    },
  });
  validateOptions(values);
  return values;
}
function emit(text, summary) {
  process.stdout.write(text);
  if (summary) appendFileSync(summary, text);
}
function validateBaseCoverage(options) {
  if (options['base-coverage'] && !(options.coverage && options.base)) {
    throw new Error('--base-coverage requires --coverage and --base');
  }
}
function validateOptions(options) {
  validateBaseCoverage(options);
  if (options.base && options.coverage && !options['base-coverage']) {
    throw new Error('--coverage with --base requires --base-coverage');
  }
}
function main() {
  const options = readOptions();
  const source = git(['rev-parse', '--show-toplevel']);
  const head = snapshot(source, options.coverage);
  if (!options.base) {
    emit(`${JSON.stringify(head, null, 2)}\n`, options.summary);
    return;
  }
  const base = snapshotBase(source, options.base, options['base-coverage']);
  assertComparable(base, head);
  const rows = compareSnapshots(base, head);
  const crapModel = head.health.crap.model;
  emit(
    renderComparison(rows, { base: base.commit, head: head.commit, dirty: head.dirty, crapModel }),
    options.summary
  );
}
try {
  main();
} catch (error) {
  console.error(`[metrics] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
