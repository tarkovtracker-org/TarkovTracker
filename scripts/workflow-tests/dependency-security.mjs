import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { reviewFailures } from '../checks/dependency-artifacts.mjs';
import {
  dependencyFingerprint,
  fetchJson,
  githubPages,
  lockedIntegrity,
  reviewedComposition,
  sha256,
} from '../checks/dependency-evidence.mjs';
import { eventBase, socketHead } from '../checks/dependency-security.mjs';
import { evaluateSocket, socketWarnings } from '../checks/dependency-socket.mjs';
import { compareRuntime } from '../checks/review-release-source.mjs';
const NOW = Date.parse('2026-11-02T00:00:00Z');
const head = 'a'.repeat(40);
const dates = { reviewedAt: '2026-11-01T00:00:00Z', expires: '2026-11-03T00:00:00Z' };
const cleanSummary = '|PR #1 Alerts|✅|No new dependency alerts|';
const checks = () =>
  ['Socket Security: Project Report', 'Socket Security: Pull Request Alerts'].map(
    (name, index) => ({
      id: index + 1,
      name,
      head_sha: head,
      status: 'completed',
      conclusion: 'success',
      completed_at: '2026-11-01T23:00:00Z',
      app: { id: 156372, slug: 'socket-security' },
      output: {
        title: 'Success',
        summary: index
          ? cleanSummary
          : '[View full report](https://socket.dev/dashboard/org/org/sbom/123)',
        text: '',
      },
    })
  );
const warning = { type: 'Low adoption', package: '@isaacs/matcher@1.0.3' };
const detail =
  '<details open><summary><strong>Low adoption</strong>: npm <code>@isaacs/matcher</code></summary><a href="https://socket.dev/npm/package/@isaacs/matcher/overview/1.0.3">Package</a></details>';
const warned = () => {
  const runs = checks();
  runs[1].output = {
    title: 'Complete with warnings',
    summary: 'Found 1 project alert',
    text: detail,
  };
  return runs;
};
test('a real Socket app clean verdict passes, while missing evidence fails closed', () => {
  assert.deepEqual(evaluateSocket(checks(), head, [], NOW), []);
  for (const field of ['head_sha', 'completed_at', 'output', 'app']) {
    const runs = checks();
    delete runs[1][field];
    assert.throws(() => evaluateSocket(runs, head, [], NOW));
  }
  assert.throws(() => evaluateSocket([], head, [], NOW), /Missing/);
  const projectWarning = checks();
  projectWarning[0].output.title = 'Complete with warnings';
  assert.throws(() => evaluateSocket(projectWarning, head, [], NOW), /warning report/);
});
test('same-named spoofed, wrong-head, stale, incomplete and blocking checks cannot pass', () => {
  const mutations = [
    { app: { id: 1, slug: 'socket-security' } },
    { head_sha: 'b'.repeat(40) },
    { completed_at: '2026-10-01T00:00:00Z' },
    { completed_at: '2026-12-01T00:00:00Z' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
  ];
  for (const change of mutations) {
    const runs = checks();
    Object.assign(runs[1], change);
    assert.throws(() => evaluateSocket(runs, head, [], NOW));
  }
  const runs = checks();
  runs.push({ ...runs[1], id: 100, conclusion: 'failure' });
  assert.throws(() => evaluateSocket(runs, head, [], NOW), /blocking/);
});
test('green Socket warnings require exact-package, unexpired, substantive triage', () => {
  assert.deepEqual(socketWarnings(warned()[1]), [warning]);
  const triage = {
    ...warning,
    ...dates,
    reason:
      'Verified the actual published source and required dependency relationship; this is a new upstream matcher without installation hooks.',
  };
  assert.deepEqual(evaluateSocket(warned(), head, [triage], NOW), [warning]);
  for (const change of [
    { package: '@isaacs/matcher@1.0.2' },
    { expires: '2026-11-01' },
    { reason: '' },
  ]) {
    assert.throws(
      () => evaluateSocket(warned(), head, [{ ...triage, ...change }], NOW),
      /Unreviewed/
    );
  }
  assert.throws(() => evaluateSocket(warned(), head, [], NOW), /Unreviewed/);
});
test('malformed warning counts, unknown report shapes and non-informational alerts cannot hide in green statuses', () => {
  const runs = warned();
  runs[1].output.summary = 'Found 2 project alerts';
  assert.throws(() => evaluateSocket(runs, head, [], NOW), /count/);
  runs[1].output.text = '';
  assert.throws(() => evaluateSocket(runs, head, [], NOW));
  runs[1].output = { title: 'Success', summary: 'some unsupported response' };
  assert.throws(() => evaluateSocket(runs, head, [], NOW), /explicit clean/);
  runs[1].output = {
    title: 'warning',
    summary: 'Found 1 project alert',
    text: detail.replace('Low adoption', 'Network access'),
  };
  assert.throws(
    () =>
      evaluateSocket(
        runs,
        head,
        [{ ...warning, type: 'Network access', ...dates, reason: 'x'.repeat(90) }],
        NOW
      ),
    /remediation/
  );
});
test('dependency fingerprints include exact locked bytes and package manager, independent of JSON key order', () => {
  const manifest = { dependencies: { a: '1.0.0' }, packageManager: 'pnpm@11.14.0' };
  const original = dependencyFingerprint(manifest, 'lock');
  assert.equal(
    original,
    dependencyFingerprint(
      { packageManager: manifest.packageManager, dependencies: manifest.dependencies },
      'lock'
    )
  );
  assert.notEqual(original, dependencyFingerprint(manifest, 'other lock'));
  assert.notEqual(
    original,
    dependencyFingerprint({ ...manifest, packageManager: 'pnpm@12' }, 'lock')
  );
  assert.notEqual(
    original,
    dependencyFingerprint({ ...manifest, dependencies: { a: '2.0.0' } }, 'lock')
  );
});
test('early artifact identity comes from the package resolution table, never snapshots or arbitrary tarball URLs', () => {
  const lock =
    "packages:\n  '@scope/pkg@1.0.0':\n    resolution: {integrity: sha512-YQ==}\nsnapshots:\n  '@scope/pkg@1.0.0': {}\n";
  assert.equal(lockedIntegrity(lock, '@scope/pkg@1.0.0'), 'sha512-YQ==');
  assert.throws(() => lockedIntegrity(lock, '@scope/pkg@2.0.0'), /not locked/);
  assert.throws(
    () =>
      lockedIntegrity(
        lock.replace('sha512-YQ==}', 'sha512-YQ==, tarball: https://attacker.invalid/pkg}'),
        '@scope/pkg@1.0.0'
      ),
    /non-registry/
  );
  assert.throws(() => lockedIntegrity(lock + 'packages:\n', '@scope/pkg@1.0.0'), /Ambiguous/);
});
test('queue and merged-main scans use the API-verified member revision, including reviewed fork contributions', async () => {
  const repository = 'owner/repository';
  const event = { merge_group: { head_ref: `refs/heads/gh-readonly-queue/main/pr-17-${head}` } };
  const pull = {
    state: 'open',
    base: { ref: 'main', repo: { full_name: repository } },
    head: { sha: head, repo: { full_name: 'contributor/fork' } },
  };
  assert.equal(await socketHead(event, repository, null, async () => pull), head);
  await assert.rejects(
    () => socketHead(event, repository, null, async () => ({ ...pull, state: 'closed' })),
    /identity/
  );
  await assert.rejects(
    () => socketHead({ merge_group: { head_ref: 'attacker' } }, repository, null),
    /identity/
  );
  const merged = { ...pull, merged_at: '2026-11-01', merge_commit_sha: 'b'.repeat(40) };
  assert.equal(
    await socketHead({ after: merged.merge_commit_sha }, repository, null, async () => [merged]),
    head
  );
});
test('dispatches and schedules compare against current trusted main without a bootstrap Socket revision', async () => {
  const repository = 'owner/repository';
  const current = 'b'.repeat(40);
  const request = async (path) => {
    assert.equal(path, `repos/${repository}/commits/main`);
    return { sha: current };
  };
  assert.equal(
    await eventBase({ repository: { default_branch: 'main' } }, repository, request),
    current
  );
  assert.equal(await eventBase({}, repository, request), current);
  assert.equal(
    await eventBase({ pull_request: { base: { sha: head } } }, repository, request),
    head
  );
  await assert.rejects(() => eventBase({}, repository, async () => ({})), /trusted main/);
});
test('a queue combines independent reviewed updates without admitting new artifacts, patches, or direct declarations', () => {
  const stanza = (name, version) =>
    `  ${name}@${version}:\n    resolution: {integrity: sha512-${version}}\n`;
  const importer = (name, version) =>
    `      ${name}:\n        specifier: ${version}\n        version: ${version}\n`;
  const input = (a, b) => ({
    manifest: { dependencies: { a, b }, packageManager: 'pnpm@11' },
    lock: `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n${importer('a', a)}${importer('b', b)}packages:\n${stanza('a', a)}${stanza('b', b)}snapshots:\n`,
  });
  const base = input('2', '1');
  const reviewed = input('1', '2');
  const queue = input('2', '2');
  assert.equal(reviewedComposition(queue, base, reviewed), true);
  assert.equal(reviewedComposition(input('3', '2'), base, reviewed), false);
  assert.equal(
    reviewedComposition(
      { ...queue, lock: queue.lock.replace('sha512-2', 'sha512-tampered') },
      base,
      reviewed
    ),
    false
  );
  assert.equal(
    reviewedComposition(
      { ...queue, lock: `patchedDependencies:\n  a@2: new-patch\n${queue.lock}` },
      base,
      reviewed
    ),
    false
  );
  assert.equal(
    reviewedComposition(
      { ...queue, manifest: { ...queue.manifest, dependencies: { a: '3', b: '2' } } },
      base,
      reviewed
    ),
    false
  );
  assert.equal(
    reviewedComposition(
      {
        ...queue,
        lock: `${queue.lock}  a@2:\n    dependencies:\n      hidden: link:../../../hidden\n`,
      },
      base,
      reviewed
    ),
    false
  );
  const redirected = queue.lock.replace('version: 2', 'version: link:../../../hidden');
  assert.equal(reviewedComposition({ ...queue, lock: redirected }, base, reviewed), false);
  const bypasses = [
    redirected.replace('      a:', '# comment\n      a:'),
    redirected.replace('importers:', 'importers: # comment'),
    redirected.replace('importers:', 'importers: {} # comment'),
    redirected.replace('    dependencies:', '     dependencies:'),
    redirected.replace('  .:', '  .: {}'),
    redirected.replace('      a:', '    dependencies:\n      a:'),
    redirected.replace('      a:', '  .:\n    dependencies:\n      a:'),
    queue.lock.replace('packages:', 'packages: # comment'),
    queue.lock.replace('snapshots:', 'snapshots: {}'),
    queue.lock.replace("lockfileVersion: '9.0'\n", ''),
    queue.lock.replace('snapshots:\n', ''),
    `${queue.lock}unknown: {}\n`,
  ];
  for (const lock of bypasses)
    assert.throws(
      () => reviewedComposition({ ...queue, lock }, base, reviewed),
      /lockfile|importer/
    );
});
test('GitHub evidence pagination cannot miss a later blocking advisory', async () => {
  const requests = [];
  const result = await githubPages('advisories?type=reviewed', undefined, async (path) => {
    requests.push(path);
    return path.endsWith('page=1') ? Array(100).fill('first') : ['later blocking advisory'];
  });
  assert.equal(result.length, 101);
  assert.equal(result.at(-1), 'later blocking advisory');
  assert.equal(requests.length, 2);
  await assert.rejects(() => githubPages('test', 'items', async () => ({})), /Malformed/);
});
test('transient evidence requests retry within a bound, while authorization and malformed evidence still fail', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () =>
      ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ verified: true });
    assert.deepEqual(await fetchJson('https://registry.npmjs.org/test'), { verified: true });
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response('', { status: 403 });
    };
    await assert.rejects(() => fetchJson('https://registry.npmjs.org/test'), /403/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('not JSON');
    await assert.rejects(() => fetchJson('https://registry.npmjs.org/test'), SyntaxError);
  } finally {
    globalThis.fetch = original;
  }
});
test('artifact review receipts bind dates, registry integrity, source identity and comparison output', () => {
  const comparison = [
    {
      file: 'lib/index.js',
      publishedSha256: 'b'.repeat(64),
      source: 'lib/index.js',
      sourceBlob: head,
      method: 'identical',
    },
  ];
  const review = {
    ...dates,
    integrity: 'sha512-YQ==',
    evidence: 'x'.repeat(90),
    comparison,
    source: {
      repository: 'owner/package',
      commit: head,
      tag: 'v1.0.0',
      comparisonSha256: sha256(JSON.stringify(comparison)),
    },
  };
  const manifest = { gitHead: head, dist: { integrity: review.integrity } };
  assert.deepEqual(reviewFailures(review, manifest, NOW), []);
  for (const change of [
    { integrity: 'sha512-Yg==' },
    { expires: '2026-11-01' },
    { evidence: '' },
    { comparison: [] },
  ]) {
    assert.ok(reviewFailures({ ...review, ...change }, manifest, NOW).length);
  }
  assert.ok(reviewFailures(review, { ...manifest, gitHead: 'b'.repeat(40) }, NOW).length);
  assert.ok(
    reviewFailures(review, { ...manifest, scripts: { install: 'node install.js' } }, NOW).length
  );
});
test('the offline source comparison rejects changed published code and names excluded convenience bundles', () => {
  const root = mkdtempSync(join(tmpdir(), 'dependency-source-'));
  try {
    const published = join(root, 'published');
    const source = join(root, 'source');
    for (const path of [join(published, 'lib'), join(published, 'dist'), join(source, 'lib')])
      mkdirSync(path, { recursive: true });
    for (const path of [published, source])
      writeFileSync(join(path, 'lib/index.js'), 'module.exports = 1;');
    writeFileSync(join(published, 'dist/convenience.min.js'), 'minified convenience');
    const proof = compareRuntime(published, source);
    assert.equal(proof.comparison.length, 1);
    assert.equal(proof.comparison[0].method, 'identical');
    assert.deepEqual(proof.notCompared, ['dist/convenience.min.js']);
    writeFileSync(join(published, 'lib/index.js'), 'module.exports = 2;');
    assert.throws(() => compareRuntime(published, source), /Source comparison failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('the pre-install CLI runs no pnpm script or installation when the base dependency graph is unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'dependency-preflight-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const manifest = '{"dependencies":{"a":"1.0.0"}}';
    const lock = 'lockfileVersion: 9';
    writeFileSync(join(root, 'package.json'), manifest);
    writeFileSync(join(root, 'pnpm-lock.yaml'), lock);
    writeFileSync(join(root, 'event.json'), JSON.stringify({ before: head }));
    for (const name of ['pnpm', 'git']) {
      const file = join(bin, name);
      const body =
        name === 'pnpm'
          ? `if(process.argv[2]!=='config')process.exit(90);console.log(process.argv[4]==='minimumReleaseAge'?'10080':'[]');`
          : `process.stdout.write(process.argv[3].endsWith(':package.json')?${JSON.stringify(manifest)}:${JSON.stringify(lock)});`;
      writeFileSync(file, `#!${process.execPath}\n${body}\n`);
      chmodSync(file, 0o755);
    }
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/checks/dependency-security.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_EVENT_PATH: join(root, 'event.json'),
        },
      }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /dependency graph unchanged/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
