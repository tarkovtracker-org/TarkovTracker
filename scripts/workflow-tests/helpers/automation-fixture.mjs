import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// Native Node test execution has no Nuxt @/ alias resolution.
import { gitExecutable } from '../../ci/validation-tools.mjs';
// Missing-status cases poll the stubbed gh hundreds of times; loaded CI runners need the headroom.
const GATE_SPAWN_TIMEOUT_MS = 60_000;
const gate = resolve('scripts/ci/crowdin-pr.sh');
const releaseGate = resolve('scripts/release/release-commit.sh');
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
  writeFileSync(
    join(bin, 'node'),
    String.raw`#!${process.execPath}
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0].endsWith('/review-admission-cli.mjs')) {
  fs.appendFileSync(process.env.EVENTS, JSON.stringify({ type: 'admission', sha: args[2], number: args[3], runId: args[4] }) + '\n');
  if (process.env.ADMISSION_FAIL === 'true') { console.error('Review Admission denied'); process.exit(1); }
  if (process.env.ADMISSION_PENDING === 'true') { console.error('Review Admission pending'); process.exit(2); }
  fs.appendFileSync(process.env.EVENTS, JSON.stringify({ type: 'admission-success', invocation: process.env.INVOCATION_ID }) + '\n');
  process.exit(0);
}
try { execFileSync(process.env.REAL_NODE, args, { stdio: 'inherit' }); }
catch (error) { process.exit(error.status || 1); }
`,
    { mode: 0o755 }
  );
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
const { execFileSync } = require('node:child_process');
const p = process.env;
const args = process.argv.slice(2);
fs.appendFileSync(p.CALLS, JSON.stringify(args) + '\n');
if (args[0] === 'run' && args[1] === 'list') {
  const ref = args[args.indexOf('--branch') + 1];
  const events = fs.readFileSync(p.EVENTS, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const dispatched = events.filter((event) => event.type === 'dispatch' && event.ref === ref).length;
  console.log(String(p.DISPATCH_MISSING === 'true' ? 0 : dispatched));
  process.exit(0);
}
if (args[0] === 'workflow' && args[1] === 'run' && args[2] === 'ci.yml') {
  const sha = execFileSync(p.REAL_GIT, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'dispatch', ref: args[args.indexOf('--ref') + 1], sha }) + '\n');
  process.exit(p.DISPATCH_FAIL === 'true' ? 1 : 0);
}
if (args[0] === 'workflow' && args[1] === 'run' && args[2] === 'review-admission.yml') {
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'admission-dispatch', ref: args[args.indexOf('--ref') + 1] }) + '\n');
  process.exit(p.ADMISSION_DISPATCH_FAIL === 'true' ? 1 : 0);
}
if (args[0] === 'api' && args.includes('repos/' + p.GITHUB_REPOSITORY + '/actions/workflows/review-admission.yml/dispatches')) {
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'admission-dispatch', ref: args[args.indexOf('-f') + 1], details: args.includes('return_run_details=true') }) + '\n');
  if (p.ADMISSION_DISPATCH_FAIL === 'true') process.exit(1);
  console.log(p.ADMISSION_RUN_ID || '777');
  process.exit(0);
}
if (args[0] === 'run' && args[1] === 'watch') {
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'ci-watch', runId: args[2] }) + '\n');
  process.exit(p.CI_WATCH_FAIL === 'true' ? 1 : 0);
}
if (args[0] === 'workflow' && args[1] === 'run' && args[2] === 'preview.yml') {
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'preview-dispatch', runId: args[args.indexOf('-f') + 1], ref: args[args.indexOf('--ref') + 1] }) + '\n');
  if (p.PREVIEW_DISPATCH_FAIL === 'true') {
    console.error('Preview dispatch rejected'); process.exit(1);
  }
  process.exit(0);
}
if (args[0] === 'api') {
  const waitEndpoint = args[1];
  if (waitEndpoint === 'graphql') {
    const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    const queued = { id: 'MQE_fixture', pullRequest: { number: Number(p.PR_NUMBER), headRefOid: p.ACTUAL_HEAD } };
    if (payload.query.startsWith('query')) {
      console.log(JSON.stringify({data:{repository:{pullRequest:{headRefOid:p.ACTUAL_HEAD,mergeQueueEntry:null}}}}));
      process.exit(0);
    }
    const expected = {pullRequestId:'PR_fixture_' + p.PR_NUMBER,expectedHeadOid:p.ACTUAL_HEAD};
    if (!payload.query.includes('enqueuePullRequest') || JSON.stringify(payload.variables.input) !== JSON.stringify(expected)) {
      console.error('Unexpected or unguarded queue mutation'); process.exit(1);
    }
    if (p.MERGE_FAIL === 'true') { console.error('Server-side branch rules rejected enqueue'); process.exit(1); }
    fs.appendFileSync(p.EVENTS, JSON.stringify({type:'enqueue',input:payload.variables.input,invocation:p.INVOCATION_ID}) + '\n');
    fs.appendFileSync(p.EVENTS, JSON.stringify({type:'merge',state:p.MERGE_OUTCOME || 'OPEN',invocation:p.INVOCATION_ID}) + '\n');
    console.log(JSON.stringify({data:{enqueuePullRequest:{mergeQueueEntry:queued}}}));
    process.exit(0);
  }
  if (args[1] === '--paginate' && args[2] === '--slurp' && args[3] === 'repos/' + p.GITHUB_REPOSITORY + '/commits/' + p.HEAD_SHA + '/check-runs?per_page=100') {
    // --slurp prints every page as one JSON array; the step merges and filters with jq itself.
    const runs = JSON.parse(p.WAIT_CHECK_RUNS || '[]');
    const pages = runs.length > 1 ? [{ check_runs: runs.slice(0, 1) }, { check_runs: runs.slice(1) }] : [{ check_runs: runs }];
    console.log(JSON.stringify(pages));
    process.exit(0);
  }
  if (waitEndpoint === 'repos/' + p.GITHUB_REPOSITORY + '/commits/' + p.HEAD_SHA + '/status') {
    const input = JSON.stringify({ statuses: JSON.parse(p.WAIT_STATUSES || '[]') });
    console.log(execFileSync('jq', [args[args.indexOf('--jq') + 1]], { input, encoding: 'utf8' }));
    process.exit(0);
  }
  if (waitEndpoint === 'repos/' + p.GITHUB_REPOSITORY + '/pulls/' + p.PR_NUMBER) {
    console.log(JSON.stringify({ number:Number(p.PR_NUMBER), node_id:'PR_fixture_' + p.PR_NUMBER, state:'open', draft:false, base:{ref:'main',repo:{full_name:p.GITHUB_REPOSITORY}}, head:{sha:p.ACTUAL_HEAD,repo:{full_name:p.GITHUB_REPOSITORY}} }));
    process.exit(0);
  }
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
    fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'ci-result', sha, status: p.CHECK_STATUS || 'completed', conclusion: p.CHECK_CONCLUSION || 'success' }) + '\n');
    console.log(JSON.stringify({ check_runs: p.CHECK_PRESENT === 'false' ? [] : [{
      id: 1, name: 'CI Result', app: { id: Number(p.CHECK_APP || 15368) },
      head_sha: p.CHECK_HEAD || sha, status: p.CHECK_STATUS || 'completed', conclusion: p.CHECK_CONCLUSION || 'success'
    }] }));
    process.exit(0);
  }
  if (/\/commits\/[a-f0-9]{40}\/statuses\?per_page=100$/.test(endpoint)) {
    const sha = endpoint.split('/commits/')[1].split('/')[0];
    fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'preview-result', sha, state: p.PREVIEW_STATE || 'success' }) + '\n');
    const statuses = p.PREVIEW_PRESENT === 'false' ? [] : [
      { id: 1, context: 'Preview Result', state: 'failure' },
      { id: 2, context: 'CI Result', state: 'success' },
      { id: 3, context: 'Preview Result', state: p.PREVIEW_STATE || 'success', target_url: p.PREVIEW_TARGET_URL || 'https://github.com/' + p.GITHUB_REPOSITORY + '/actions/runs/555' },
    ];
    console.log(JSON.stringify(statuses));
    process.exit(0);
  }
  if (/^repos\/[^/]+\/[^/]+\/actions\/runs\/[0-9]+$/.test(endpoint)) {
    const id = Number(endpoint.split('/').at(-1));
    if (id === 555) {
      console.log(JSON.stringify({
        id,
        path: p.CONTROLLER_PATH || '.github/workflows/preview.yml',
        event: p.CONTROLLER_EVENT || 'workflow_dispatch',
        head_branch: p.CONTROLLER_BRANCH || 'main',
        head_repository: { full_name: p.CONTROLLER_REPO || p.GITHUB_REPOSITORY },
        repository: { full_name: p.GITHUB_REPOSITORY },
        status: 'completed',
        conclusion: p.CONTROLLER_CONCLUSION || 'success',
      }));
      process.exit(0);
    }
    const events = fs.readFileSync(p.EVENTS, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const dispatch = events.filter((event) => event.type === 'dispatch')[id - 1];
    if (!dispatch) { console.error('Unknown CI run: ' + id); process.exit(1); }
    console.log(JSON.stringify({ id, event: 'workflow_dispatch', head_sha: p.CI_RUN_HEAD || dispatch.sha, status: 'completed', conclusion: p.CI_RUN_CONCLUSION || 'success' }));
    process.exit(0);
  }
  if (/^repos\/[^/]+\/[^/]+\/actions\/runs\/[0-9]+\/jobs\?per_page=100$/.test(endpoint)) {
    console.log(JSON.stringify({ total_count: 1, jobs: [{ name: 'Publish preview result', conclusion: 'success' }] }));
    process.exit(0);
  }
  if (/^repos\/[^/]+\/[^/]+\/actions\/runs\/[0-9]+\/artifacts\?per_page=100$/.test(endpoint)) {
    const events = fs.readFileSync(p.EVENTS, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const statusSha = ([...events].reverse().find((event) => event.type === 'preview-result') || {}).sha || '';
    const sha = statusSha || p.PREVIEW_SHA || '';
    console.log(JSON.stringify({ artifacts: [{ name: 'preview-deployment-' + sha, expired: false }] }));
    process.exit(0);
  }
  if (endpoint === 'repos/' + p.GITHUB_REPOSITORY + '/git/ref/heads/main') {
    const events = fs.readFileSync(p.EVENTS, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const enqueued = events.some((event) => event.type === 'enqueue' && event.invocation === p.INVOCATION_ID);
    console.log(enqueued && p.AFTER_ENQUEUE_BASE ? p.AFTER_ENQUEUE_BASE : p.CURRENT_BASE); process.exit(0);
  }
  console.error('Unexpected gh api endpoint: ' + endpoint); process.exit(2);
}
if (args[1] === 'view') {
  const states = JSON.parse(p.PR_STATES);
  const index = Number(fs.readFileSync(p.COUNTER, 'utf8'));
  fs.writeFileSync(p.COUNTER, String(index + 1));
  const events = fs.readFileSync(p.EVENTS, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const merge = events.findLast((event) => event.type === 'merge' && event.invocation === p.INVOCATION_ID);
  const pr = states[Math.min(index, states.length - 1)];
  const admitted = events.some((event) => event.type === 'admission-success' && event.invocation === p.INVOCATION_ID);
  const observed = p.BLOCKED_UNTIL_ADMISSION === 'true' && !admitted ? { ...pr, mergeStateStatus: 'BLOCKED' } : pr;
  const after = merge ? { ...observed, state: merge.state } : observed;
  if (merge && p.AFTER_ENQUEUE_HEAD) after.headRefOid = p.AFTER_ENQUEUE_HEAD;
  console.log(JSON.stringify(after));
  process.exit(0);
}
if (args[1] === 'merge') {
  if (p.AUTO_MERGE_DISABLED === 'true') { console.error('Auto merge is not allowed for this repository (enablePullRequestAutoMerge)'); process.exit(1); }
  const supplied = args[args.indexOf('--match-head-commit') + 1];
  if (supplied !== p.ACTUAL_HEAD) { console.error('Head changed at merge'); process.exit(1); }
  if (p.ACTUAL_BASE && p.ACTUAL_BASE !== p.BASE_SHA && p.QUEUE_ENFORCED !== 'true') { console.error('Base advanced at merge'); process.exit(1); }
  if (p.MERGE_FAIL === 'true') { console.error('Server-side branch rules rejected merge'); process.exit(1); }
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'merge', state: p.MERGE_OUTCOME || 'MERGED', invocation: p.INVOCATION_ID }) + '\n');
  process.exit(0);
}
process.exit(2);
`,
    { mode: 0o755 }
  );
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'timeout'), '#!/bin/sh\nshift\nexec "$@"\n', { mode: 0o755 });
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
  fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'push', args }) + '\n');
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
  writeFileSync(join(root, 'events'), '');
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    PR_NUMBER: '857',
    GITHUB_REPOSITORY: 'example/repo',
    GITHUB_OUTPUT: join(root, 'output'),
    GH_TOKEN: 'test-only',
    GITHUB_TOKEN: 'test-main',
    REVIEW_ADMISSION_APP_ID: '987654',
    REVIEW_ADMISSION_BOT_ID: '987655',
    REVIEW_ADMISSION_INSTALLATION_ID: '987656',
    RELEASE_VERSION: '1.2.3',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    REMOTE: remote,
    REAL_GIT: gitExecutable(),
    REAL_NODE: process.execPath,
    PUSHES: join(root, 'pushes'),
    EVENTS: join(root, 'events'),
    RULES: JSON.stringify([
      {
        type: 'required_status_checks',
        ruleset_source_type: 'Repository',
        ruleset_source: 'example/repo',
        ruleset_id: 42,
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: 'CI Result', integration_id: 15368 },
            { context: 'Preview Result', integration_id: 15368 },
          ],
        },
      },
    ]),
    HEAD_SHA: head,
    BASE_SHA: base,
    CURRENT_BASE: base,
    ACTUAL_HEAD: head,
    PREVIEW_SHA: head,
    PR_STATES: JSON.stringify([pr]),
    CALLS: join(root, 'calls'),
    COUNTER: join(root, 'counter'),
  };
  let invocation = 0;
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
        env: { ...env, ...overrides, INVOCATION_ID: String(++invocation) },
        encoding: 'utf8',
        timeout: GATE_SPAWN_TIMEOUT_MS,
      }),
    shell: (script, overrides) =>
      // Suppress remote/noninteractive startup files that can replace the mocked PATH.
      spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], {
        cwd: repo,
        env: { ...env, ...overrides, INVOCATION_ID: String(++invocation) },
        encoding: 'utf8',
        timeout: GATE_SPAWN_TIMEOUT_MS,
      }),
    release: (overrides) =>
      spawnSync('/bin/bash', [releaseGate], {
        cwd: repo,
        env: { ...env, ...overrides },
        encoding: 'utf8',
        timeout: GATE_SPAWN_TIMEOUT_MS,
      }),
    events: () => read(env.EVENTS).trim().split('\n').filter(Boolean).map(JSON.parse),
    pushes: () => read(env.PUSHES).trim().split('\n').filter(Boolean).map(JSON.parse),
    calls: () => read(env.CALLS).trim().split('\n').filter(Boolean).map(JSON.parse),
    output: () => read(env.GITHUB_OUTPUT),
  };
}
