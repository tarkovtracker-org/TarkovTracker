import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitExecutable } from '../ci/validation-tools.mjs';
import { formatterOnlyChange, verifiedFormatterChange } from '../ci/formatter-validation.mjs';
import {
  collectChanges,
  aggregateResults,
  classifyPaths,
  classifyQueuePaths,
  fullJobs,
} from '../ci/validation-plan.mjs';
import { queueRequiresPreview } from '../preview/merge-queue.mjs';
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const repo = { owner: 'example', repo: 'repo' };
function input(version, specifier = '^3.8.1') {
  return {
    manifest: JSON.stringify({
      dependencies: { vue: '3.5.0' },
      devDependencies: {
        prettier: specifier,
        'prettier-plugin-tailwindcss': '^0.8.0',
      },
    }),
    lock: `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      vue:
        specifier: 3.5.0
        version: 3.5.0
    devDependencies:
      prettier:
        specifier: ${specifier}
        version: ${version}
      prettier-plugin-tailwindcss:
        specifier: ^0.8.0
        version: 0.8.1(prettier@${version})

packages:

  vue@3.5.0:
    resolution: {integrity: sha512-unchanged}

  prettier-plugin-tailwindcss@0.8.1:
    resolution: {integrity: sha512-unchanged}
    peerDependencies:
      prettier: ^3.0

  prettier@${version}:
    resolution: {integrity: sha512-${Buffer.alloc(64, Number(version.split('.').at(-1))).toString('base64')}}
    engines: {node: '>=14'}
    hasBin: true

snapshots:

  vue@3.5.0: {}

  prettier-plugin-tailwindcss@0.8.1(prettier@${version}):
    dependencies:
      prettier: ${version}

  prettier@${version}: {}
`,
  };
}
function fixture() {
  const before = input('3.9.9');
  const after = input('3.9.10');
  const reads = [];
  const github = {
    rest: {
      repos: {
        getContent: async (params) => {
          reads.push(params);
          assert.deepEqual({ owner: params.owner, repo: params.repo }, repo);
          assert.ok([base, head].includes(params.ref));
          const data = params.ref === base ? before : after;
          const text = params.path === 'package.json' ? data.manifest : data.lock;
          return {
            data: {
              type: 'file',
              encoding: 'base64',
              size: Buffer.byteLength(text),
              content: Buffer.from(text).toString('base64'),
            },
          };
        },
      },
    },
  };
  return { before, after, reads, github };
}
test('only complete leaf Prettier changes select formatter CI and independently skip preview', async () => {
  const f = fixture();
  const paths = ['pnpm-lock.yaml'];
  const formatterOnly = await verifiedFormatterChange(f.github, repo, base, head, paths);
  assert.equal(formatterOnly, true);
  assert.deepEqual(
    f.reads.map(({ ref, path }) => [ref, path]),
    [
      [base, 'package.json'],
      [base, 'pnpm-lock.yaml'],
      [head, 'package.json'],
      [head, 'pnpm-lock.yaml'],
    ]
  );
  for (const classify of [classifyPaths, classifyQueuePaths]) {
    const plan = classify(paths, { formatterOnly });
    assert.equal(plan.full, false);
    assert.equal(plan.formatter, true);
    assert.equal(plan.previewRequired, false);
    assert.deepEqual(plan.jobs, ['lint-format', 'systems-drift', 'security']);
    const needs = {
      changes: { result: 'success' },
      ...Object.fromEntries(
        fullJobs.map((job) => [job, { result: plan.jobs.includes(job) ? 'success' : 'skipped' }])
      ),
    };
    assert.deepEqual(aggregateResults(plan, needs), []);
    needs.security.result = 'failure';
    assert.match(aggregateResults(plan, needs).join(), /security/);
    assert.equal(classify(paths, { formatterOnly, forceFull: true }).full, true);
    assert.equal(classify([...paths, 'app/task.vue'], { formatterOnly }).full, true);
    assert.equal(classify(paths).full, true);
  }
});
test('a specifier naming the old resolution still normalises only the resolved version', () => {
  assert.equal(formatterOnlyChange(input('3.9.9', '^3.9.9'), input('3.9.10', '^3.9.9')), true);
  assert.equal(formatterOnlyChange(input('3.9.9', '^3.9.9'), input('3.9.10', '^3.9.10')), false);
});
test('mixed changes, runtime/build dependencies, metadata surprises and uncertain evidence stay full', async () => {
  const before = input('3.9.9');
  const after = input('3.9.10');
  const mutations = [
    (x) => ({ ...x, lock: x.lock.replace('importers:\n', 'importers:\nimporters:\n') }),
    (x) => ({ ...x, lock: x.lock.replace('packages:\n', 'packages:\npackages:\n') }),
    (x) => ({ ...x, manifest: x.manifest.replace('3.5.0', '3.5.1') }),
    (x) => ({ ...x, manifest: x.manifest.replace('^3.8.1', '^3.9.0') }),
    (x) => ({ ...x, lock: x.lock.replace('version: 3.5.0', 'version: 3.5.1') }),
    (x) => ({ ...x, lock: x.lock.replace('sha512-unchanged', 'sha512-changed') }),
    (x) => ({ ...x, lock: x.lock.replace("engines: {node: '>=14'}", "engines: {node: '>=20'}") }),
    (x) => ({ ...x, lock: x.lock.replace('hasBin: true', 'hasBin: false') }),
    (x) => ({ ...x, lock: x.lock.replace('0.8.1(prettier', '0.8.2(prettier') }),
    (x) => ({
      ...x,
      lock: x.lock.replace(
        '  vue@3.5.0: {}',
        '  vue@3.5.0:\n    dependencies:\n      prettier: 3.9.10'
      ),
    }),
    (x) => ({
      ...x,
      lock: x.lock.replace('packages:\n', '  workspace:\n    dependencies: {}\n\npackages:\n'),
    }),
    (x) => ({ ...x, lock: x.lock.replace('  vue@3.5.0: {}', '  added@1.0.0: {}') }),
    (x) => ({ ...x, lock: x.lock.slice(0, -1) }),
    (x) => ({ ...x, lock: x.lock + 'x'.repeat(1000000) }),
    (x) => ({ ...x, lock: x.lock.replaceAll('\n', '\r\n') }),
  ];
  for (const mutate of mutations) assert.equal(formatterOnlyChange(before, mutate(after)), false);
  assert.equal(formatterOnlyChange(after, before), false);
  assert.equal(formatterOnlyChange(before, before), false);
  const runtime = (data) => ({
    ...data,
    manifest: data.manifest.replace('"vue":"3.5.0"', '"prettier":"^3.8.1"'),
  });
  assert.equal(formatterOnlyChange(runtime(before), runtime(after)), false);
  const f = fixture();
  for (const paths of [
    [],
    ['package.json', 'pnpm-lock.yaml'],
    ['pnpm-lock.yaml', 'old-lock.yaml'],
    ['pnpm-lock.yaml', 'docs/a.md'],
  ]) {
    assert.equal(await verifiedFormatterChange(f.github, repo, base, head, paths), false);
  }
  assert.equal(f.reads.length, 0);
  assert.equal(
    await verifiedFormatterChange(f.github, repo, 'main', head, ['pnpm-lock.yaml']),
    false
  );
  for (const data of [
    { type: 'symlink' },
    { type: 'file', encoding: 'base64', size: 999, content: 'e30=' },
    { type: 'file', encoding: 'none', size: 0 },
    { type: 'file', encoding: 'base64', size: 1000001 },
  ]) {
    f.github.rest.repos.getContent = async () => ({ data });
    assert.equal(
      await verifiedFormatterChange(f.github, repo, base, head, ['pnpm-lock.yaml']),
      false
    );
  }
  f.github.rest.repos.getContent = async () => {
    throw new Error('API unavailable');
  };
  assert.equal(
    await verifiedFormatterChange(f.github, repo, base, head, ['pnpm-lock.yaml']),
    false
  );
});
test('queue formatter exemption still requires complete current-base single-parent comparison', async () => {
  const f = fixture();
  const comparison = {
    status: 'ahead',
    ahead_by: 1,
    behind_by: 0,
    total_commits: 1,
    base_commit: { sha: base },
    merge_base_commit: { sha: base },
    commits: [{ sha: head, parents: [{ sha: base }] }],
    files: [{ filename: 'pnpm-lock.yaml', status: 'modified' }],
  };
  f.github.rest.repos.compareCommits = async () => ({ data: comparison });
  const run = () => queueRequiresPreview(f.github, { repo }, { headSha: head }, { baseSha: base });
  assert.equal(await run(), false);
  comparison.files.push({ filename: 'app/a.vue', status: 'modified' });
  assert.equal(await run(), true);
  comparison.files.pop();
  comparison.commits[0].parents.push({ sha: head });
  assert.equal(await run(), true);
  comparison.commits[0].parents.pop();
  comparison.files[0].status = 'renamed';
  comparison.files[0].previous_filename = 'runtime-lock.yaml';
  assert.equal(await run(), true);
  comparison.files = Array.from({ length: 300 }, () => ({
    filename: 'pnpm-lock.yaml',
    status: 'modified',
  }));
  assert.equal(await run(), true);
});
test('a divergent current-base lock update cannot create a CI/controller profile mismatch', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tt-formatter-base-'));
  const git = (...args) =>
    execFileSync(gitExecutable(), ['-c', 'commit.gpgsign=false', ...args], {
      cwd,
      encoding: 'utf8',
    }).trim();
  const write = (data) => {
    writeFileSync(join(cwd, 'package.json'), data.manifest);
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), data.lock);
    git('add', '.');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const ranged = (version) => {
    const data = input(version);
    return {
      manifest: data.manifest.replace('"vue":"3.5.0"', '"vue":"^3.5.0"'),
      lock: data.lock.replace('specifier: 3.5.0', 'specifier: ^3.5.0'),
    };
  };
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    const original = ranged('3.9.9');
    const originalSha = write(original);
    git('checkout', '-qb', 'candidate');
    const candidate = ranged('3.9.10');
    const headSha = write(candidate);
    git('checkout', '-q', 'main');
    const currentBase = {
      ...original,
      lock: original.lock
        .replace('version: 3.5.0', 'version: 3.5.1')
        .replaceAll('vue@3.5.0', 'vue@3.5.1'),
    };
    const baseSha = write(currentBase);
    assert.equal(git('merge-base', baseSha, headSha), originalSha);
    assert.equal(formatterOnlyChange(original, candidate), true);
    assert.equal(formatterOnlyChange(currentBase, candidate), false);
    const changes = collectChanges({ cwd, base: baseSha, head: headSha, local: false });
    assert.deepEqual(changes.paths, ['pnpm-lock.yaml']);
    assert.equal(changes.formatterOnly, false);
    const plan = classifyPaths(changes.paths, { formatterOnly: changes.formatterOnly });
    assert.equal(plan.full, true);
    assert.equal(plan.previewRequired, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
