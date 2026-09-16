import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// Native Node test execution has no Nuxt @/ alias resolution.
import { gitExecutable } from '../../validation-tools.mjs';
const gate = resolve('scripts/crowdin-pr.sh');
const releaseGate = resolve('scripts/release-commit.sh');
const read = (path) => readFileSync(path, 'utf8');
/** Run the trusted Git executable and surface fixture setup failures. */
export function git(cwd, ...args) {
  const result = spawnSync(gitExecutable(), args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
/** Create an isolated Git history and mocked GitHub CLI for gate integration tests. */
export function fixture(t, changes) {
  changes ??= { 'app/locales/fr.json': '{"hello":"Salut"}' };
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
    String.raw`#!${process.execPath}
const fs = require('node:fs');
const p = process.env;
const args = process.argv.slice(2);
fs.appendFileSync(p.CALLS, JSON.stringify(args) + '\n');
if (args[0] === 'api') {
  if (args.includes('--method') && args.includes('PUT') && args.includes('repos/' + p.GITHUB_REPOSITORY + '/pulls/' + p.PR_NUMBER + '/update-branch')) {
    if (!args.includes('expected_head_sha=' + p.ACTUAL_HEAD)) {
      console.error('Head changed at branch update'); process.exit(1);
    }
    console.log('{"message":"Updating pull request branch"}'); process.exit(0);
  }
  const endpoint = args[args.indexOf('api') + 1] === '--paginate' ? args[2] : args[1];
  if (endpoint === 'repos/' + p.GITHUB_REPOSITORY + '/rules/branches/main?per_page=100') { console.log(p.RULES); process.exit(0); }
  if (endpoint.includes('/rulesets/')) { console.error('Ruleset details require administrator access'); process.exit(1); }
  if (endpoint.startsWith('repos/' + p.GITHUB_REPOSITORY + '/commits/') && /\/commits\/[a-f0-9]{40}\/check-runs\?check_name=CI%20Result&filter=latest&per_page=100$/.test(endpoint)) {
    const sha = endpoint.split('/commits/')[1].split('/')[0];
    console.log(JSON.stringify({ check_runs: p.CHECK_PRESENT === 'false' ? [] : [{
      id: 1, name: 'CI Result', app: { id: Number(p.CHECK_APP || 15368) },
      head_sha: p.CHECK_HEAD || sha, status: p.CHECK_STATUS || 'completed', conclusion: p.CHECK_CONCLUSION || 'success'
    }] }));
    process.exit(0);
  }
  if (endpoint === 'repos/' + p.GITHUB_REPOSITORY + '/git/ref/heads/main') {
    console.log(p.CURRENT_BASE); process.exit(0);
  }
  console.error('Unexpected gh api endpoint: ' + endpoint); process.exit(2);
}
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
  if (p.ACTUAL_BASE && p.ACTUAL_BASE !== p.BASE_SHA) { console.error('Base advanced at merge'); process.exit(1); }
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
  const remote = join(root, 'remote.git');
  git(root, 'clone', '--bare', repo, remote);
  writeFileSync(
    join(bin, 'git'),
    String.raw`#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const p = process.env;
const args = process.argv.slice(2);
const remoteIndex = args.findIndex((arg) => arg.startsWith('https://github.com/'));
if (args.includes('push') && remoteIndex !== -1) {
  fs.appendFileSync(p.PUSHES, JSON.stringify({ args, credential: p.GH_TOKEN === 'test-ci' ? 'ci' : 'main' }) + '\n');
  if (args.at(-1).endsWith(':refs/heads/main') && p.RACE_MAIN_SHA) {
    const raced = spawnSync(p.REAL_GIT, ['--git-dir', p.REMOTE, 'update-ref', 'refs/heads/main', p.RACE_MAIN_SHA]);
    if (raced.status !== 0) process.exit(raced.status);
  }
  args[remoteIndex] = p.REMOTE;
}
const result = spawnSync(p.REAL_GIT, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
    { mode: 0o755 }
  );
  writeFileSync(join(root, 'pushes'), '');
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    PR_NUMBER: '857',
    GITHUB_REPOSITORY: 'example/repo',
    GITHUB_OUTPUT: join(root, 'output'),
    GH_TOKEN: 'test-only',
    GITHUB_TOKEN: 'test-main',
    RELEASE_CI_TOKEN: 'test-ci',
    RELEASE_VERSION: '1.2.3',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    REMOTE: remote,
    REAL_GIT: gitExecutable(),
    PUSHES: join(root, 'pushes'),
    RULES: JSON.stringify([
      {
        type: 'required_status_checks',
        ruleset_source_type: 'Repository',
        ruleset_source: 'example/repo',
        ruleset_id: 42,
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: 'CI Result', integration_id: 15368 }],
        },
      },
    ]),
    HEAD_SHA: head,
    BASE_SHA: base,
    CURRENT_BASE: base,
    ACTUAL_HEAD: head,
    PR_STATES: JSON.stringify([pr]),
    CALLS: join(root, 'calls'),
    COUNTER: join(root, 'counter'),
  };
  return {
    env,
    repo,
    remote,
    head,
    base,
    pr,
    run: (phase, overrides) =>
      spawnSync('/bin/bash', [gate, phase], {
        cwd: repo,
        env: { ...env, ...overrides },
        encoding: 'utf8',
        timeout: 20000,
      }),
    release: (overrides) =>
      spawnSync('/bin/bash', [releaseGate], {
        cwd: repo,
        env: { ...env, ...overrides },
        encoding: 'utf8',
        timeout: 20000,
      }),
    pushes: () => read(env.PUSHES).trim().split('\n').filter(Boolean).map(JSON.parse),
    calls: () => read(env.CALLS).trim().split('\n').filter(Boolean).map(JSON.parse),
    output: () => read(env.GITHUB_OUTPUT),
  };
}
