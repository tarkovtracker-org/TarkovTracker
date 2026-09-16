import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
const gate = resolve('scripts/crowdin-pr.sh');
const read = (path) => readFileSync(path, 'utf8');
function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(t, changes = { 'app/locales/fr.json': '{"hello":"Salut"}' }) {
  const root = mkdtempSync(join(tmpdir(), 'crowdin-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Workflow Test');
  git(repo, 'config', 'user.email', 'workflow@example.invalid');
  const put = (path, content) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  put('app/locales/en.json', '{"hello":"Hello"}');
  put('app/locales/fr.json', '{"hello":"Bonjour"}');
  put('package.json', '{"private":true}');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-b', 'locales');
  for (const [path, content] of Object.entries(changes)) put(path, content);
  git(repo, 'add', '.');
  git(repo, 'commit', '--allow-empty', '-m', 'translations');
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', 'main');
  git(repo, 'remote', 'add', 'origin', repo);
  const pr = {
    state: 'OPEN',
    isDraft: false,
    isCrossRepository: false,
    headRefName: 'locales',
    baseRefName: 'main',
    headRefOid: head,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
  };
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const p = process.env;
const args = process.argv.slice(2);
fs.appendFileSync(p.CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'api') { console.log(p.CURRENT_BASE); process.exit(0); }
if (args[1] === 'view') {
  const states = JSON.parse(p.PR_STATES);
  const index = Number(fs.readFileSync(p.COUNTER, 'utf8'));
  fs.writeFileSync(p.COUNTER, String(index + 1));
  console.log(JSON.stringify(states[Math.min(index, states.length - 1)]));
  process.exit(0);
}
if (args[1] === 'merge') {
  const supplied = args[args.indexOf('--match-head-commit') + 1];
  if (supplied !== p.ACTUAL_HEAD) { console.error('Head changed at merge'); process.exit(1); }
  process.exit(0);
}
process.exit(2);
`,
    { mode: 0o755 }
  );
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(root, 'counter'), '0');
  writeFileSync(join(root, 'calls'), '');
  writeFileSync(join(root, 'output'), '');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    PR_NUMBER: '857',
    GITHUB_REPOSITORY: 'example/repo',
    GITHUB_OUTPUT: join(root, 'output'),
    GH_TOKEN: 'test-only',
    HEAD_SHA: head,
    BASE_SHA: base,
    CURRENT_BASE: base,
    ACTUAL_HEAD: head,
    PR_STATES: JSON.stringify([pr]),
    CALLS: join(root, 'calls'),
    COUNTER: join(root, 'counter'),
  };
  return {
    repo,
    head,
    base,
    pr,
    run: (phase, overrides = {}) =>
      spawnSync('bash', [gate, phase], {
        cwd: repo,
        env: { ...env, ...overrides },
        encoding: 'utf8',
        timeout: 10000,
      }),
    calls: () => read(env.CALLS).trim().split('\n').filter(Boolean).map(JSON.parse),
    output: () => read(env.GITHUB_OUTPUT),
  };
}
function passed(result) {
  assert.equal(result.status, 0, result.stderr);
}
function rejected(result, message) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, message);
}
test('valid translation checkout and merge use the same immutable SHA', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.head);
  assert.equal(f.output(), `head_sha=${f.head}\nbase_sha=${f.base}\n`);
  passed(f.run('merge'));
  const merge = f.calls().find((args) => args[1] === 'merge');
  assert.equal(merge[merge.indexOf('--match-head-commit') + 1], f.head);
  assert.ok(merge.includes('--squash'));
  assert.ok(!merge.includes('--admin'));
  assert.ok(merge.includes('--body'), 'Do not inherit skip-actions markers from PR commits');
});
test('allowlist checks immutable git trees before checking out or running project code', (t) => {
  for (const path of ['app/locales/en.json', 'package.json', 'app/locales/nested/fr.json']) {
    const f = fixture(t, { [path]: '{}' });
    rejected(f.run('prepare'), /non-translation path/);
    assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.base);
    assert.equal(f.output(), '');
  }
});
test('rejects symlink, executable and deleted locale files', (t) => {
  for (const kind of ['symlink', 'executable', 'deleted']) {
    const f = fixture(t);
    git(f.repo, 'checkout', 'locales');
    const path = join(f.repo, 'app/locales/fr.json');
    if (kind === 'executable') chmodSync(path, 0o755);
    else rmSync(path);
    if (kind === 'symlink') symlinkSync('../../package.json', path);
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', kind);
    const headRefOid = git(f.repo, 'rev-parse', 'HEAD');
    git(f.repo, 'checkout', 'main');
    rejected(
      f.run('prepare', {
        PR_STATES: JSON.stringify([{ ...f.pr, headRefOid }]),
      }),
      /Expected a regular translation file/
    );
    assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.base);
  }
});
test('renaming English into a locale cannot hide the disallowed source path', (t) => {
  const f = fixture(t);
  git(f.repo, 'checkout', 'locales');
  git(f.repo, 'mv', 'app/locales/en.json', 'app/locales/de.json');
  git(f.repo, 'commit', '-m', 'rename');
  const headRefOid = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'checkout', 'main');
  rejected(
    f.run('prepare', {
      PR_STATES: JSON.stringify([{ ...f.pr, headRefOid }]),
    }),
    /non-translation path/
  );
});
test('rejects an empty translation diff', (t) => {
  const f = fixture(t, {});
  rejected(f.run('prepare'), /No translation changes/);
});
test('rejects forks, other branches, draft and closed PRs before checkout', (t) => {
  const f = fixture(t);
  for (const change of [
    { isCrossRepository: true },
    { headRefName: 'other' },
    { baseRefName: 'develop' },
    { isDraft: true },
    { state: 'CLOSED' },
    { state: 'MERGED' },
  ]) {
    rejected(
      f.run('prepare', { PR_STATES: JSON.stringify([{ ...f.pr, ...change }]) }),
      /Expected an open/
    );
    assert.equal(git(f.repo, 'rev-parse', 'HEAD'), f.base);
  }
});
test('head changes before merge and during polling never invoke the merge command', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  const changed = { ...f.pr, headRefOid: 'a'.repeat(40) };
  const unknown = { ...f.pr, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' };
  rejected(f.run('merge', { PR_STATES: JSON.stringify([f.pr, unknown, changed]) }), /head changed/);
  rejected(f.run('merge', { PR_STATES: JSON.stringify([changed]) }), /head changed/);
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
test('server-side head guard rejects a race after the last metadata read', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  rejected(f.run('merge', { ACTUAL_HEAD: 'b'.repeat(40) }), /Head changed at merge/);
});
test('merge rejects every non-CLEAN state and conflicting or malformed mergeability', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  for (const mergeStateStatus of [
    'DIRTY',
    'BLOCKED',
    'BEHIND',
    'UNSTABLE',
    'DRAFT',
    'HAS_HOOKS',
    null,
  ]) {
    rejected(
      f.run('merge', { PR_STATES: JSON.stringify([{ ...f.pr, mergeStateStatus }]) }),
      /ineligible/
    );
  }
  for (const mergeable of ['CONFLICTING', null]) {
    rejected(f.run('merge', { PR_STATES: JSON.stringify([{ ...f.pr, mergeable }]) }), /ineligible/);
  }
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
test('unknown mergeability retries until clean, and unresolved state times out', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  const unknown = { ...f.pr, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' };
  passed(f.run('merge', { PR_STATES: JSON.stringify([unknown, unknown, f.pr]) }));
  rejected(f.run('merge', { PR_STATES: JSON.stringify([unknown]) }), /Timed out/);
  assert.equal(f.calls().filter((args) => args[1] === 'merge').length, 1);
});
test('missing merge credential, changed main, changed checkout or PR identity fail closed', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  rejected(f.run('merge', { GH_TOKEN: '' }), /ACCESS_TOKEN_GITHUB is required/);
  rejected(f.run('merge', { CURRENT_BASE: 'c'.repeat(40) }), /Main changed/);
  rejected(
    f.run('merge', { PR_STATES: JSON.stringify([{ ...f.pr, isDraft: true }]) }),
    /Expected an open/
  );
  git(f.repo, 'checkout', 'main');
  rejected(f.run('merge'), /Checkout differs/);
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
test('workflow separates trusted gate, immutable setup, token-free checks and PAT merge', () => {
  const workflow = read('.github/workflows/crowdin.yml');
  const mergeStep = workflow.slice(workflow.indexOf('      - name: Merge validated translations'));
  const beforeMerge = workflow.slice(0, workflow.indexOf(mergeStep));
  assert.doesNotMatch(beforeMerge, /ACCESS_TOKEN_GITHUB/);
  assert.match(mergeStep, /GH_TOKEN: \$\{\{ secrets.ACCESS_TOKEN_GITHUB \}\}/);
  assert.match(mergeStep, /HEAD_SHA: \$\{\{ steps.candidate.outputs.head_sha \}\}/);
  assert.match(mergeStep, /BASE_SHA: \$\{\{ steps.candidate.outputs.base_sha \}\}/);
  assert.match(mergeStep, /run: bash "\$RUNNER_TEMP\/crowdin-pr.sh" merge/);
  assert.ok(
    workflow.indexOf('Preserve trusted merge gate') <
      workflow.indexOf('Synchronize Crowdin translations')
  );
  assert.ok(
    workflow.indexOf('immutable translation checkout') <
      workflow.indexOf('uses: ./.github/actions/setup-project')
  );
  const validation = workflow.slice(
    workflow.indexOf('      - name: Validate translations'),
    workflow.indexOf(mergeStep)
  );
  assert.doesNotMatch(validation, /GH_TOKEN|secrets\./);
  for (const check of ['format:check', 'i18n:check', 'systems:check'])
    assert.ok(validation.includes(`pnpm run ${check}`));
  assert.match(read('.github/workflows/ci.yml'), /push:\n    branches: \[main,/);
  assert.match(read('.github/workflows/release.yml'), /workflow_run.event == 'push'/);
});
