import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './helpers/automation-fixture.mjs';
import { jobBlock, workflowEvent, workflowStep } from './helpers/workflow-blocks.mjs';
/** Stage realistic generated assets without modifying application code. */
function releaseFixture(t) {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'package.json'), '{"private":true,"version":"1.2.3"}');
  writeFileSync(join(f.repo, 'CHANGELOG.md'), '# 1.2.3\n');
  return f;
}
test('release validates a staging commit before promoting that identical SHA without PAT bypass', (t) => {
  const f = releaseFixture(t);
  const result = f.release();
  assert.equal(result.status, 0, result.stderr);
  const sha = git(f.repo, 'rev-parse', 'HEAD');
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), sha);
  assert.ok(
    f
      .calls()
      .some((args) =>
        args.includes(
          `repos/example/repo/commits/${sha}/check-runs?check_name=CI%20Result&filter=latest&per_page=100`
        )
      )
  );
  const events = f.events();
  const dispatchIndex = events.findIndex((event) => event.type === 'dispatch');
  assert.equal(events[dispatchIndex]?.ref, 'wip/release-1.2.3-123-1');
  const ciIndex = events.findIndex((event) => event.type === 'ci-result');
  const mainIndex = events.findIndex(
    (event) => event.type === 'push' && event.args.at(-1) === `${sha}:refs/heads/main`
  );
  assert.ok(dispatchIndex < ciIndex, 'dispatch must precede waiting for CI');
  assert.notEqual(ciIndex, -1, 'missing CI result event');
  assert.notEqual(mainIndex, -1, 'missing main promotion event');
  assert.deepEqual(events[ciIndex], {
    type: 'ci-result',
    sha,
    status: 'completed',
    conclusion: 'success',
  });
  assert.ok(ciIndex < mainIndex, 'successful exact-head CI must precede main promotion');
  const pushes = f.pushes();
  assert.equal(pushes[0].credential, 'main');
  assert.equal(pushes[0].args.at(-1), `${sha}:refs/heads/wip/release-1.2.3-123-1`);
  assert.equal(pushes[1].credential, 'main');
  assert.equal(pushes[1].args.at(-1), `${sha}:refs/heads/main`);
  assert.equal(git(f.repo, 'log', '-1', '--format=%s'), 'chore(release): 1.2.3');
  assert.equal(git(f.repo, 'rev-parse', 'HEAD^'), f.base);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'branch', '--list', 'wip/release-*'), '');
});
test('failed staging CI leaves main unchanged and never attempts promotion', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ CHECK_CONCLUSION: 'failure' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CI Result did not succeed/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(f.pushes().length, 1);
});
test('concurrent main advancement is rejected by the actual Git push', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ RACE_MAIN_SHA: f.head });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-fast-forward|fetch first/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.head);
});
test('release refuses missing CI credentials or a missing strict CI policy', (t) => {
  const f = releaseFixture(t);
  assert.equal(f.release({ GITHUB_TOKEN: '' }).status, 1);
  assert.equal(f.release({ RULES: '[]' }).status, 1);
  assert.equal(f.pushes().length, 0);
});
test('release refuses unrelated staged content', (t) => {
  const f = releaseFixture(t);
  writeFileSync(join(f.repo, 'unexpected.txt'), 'unrelated');
  git(f.repo, 'add', 'unexpected.txt');
  const result = f.release();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected staged release asset/);
  assert.equal(f.pushes().length, 0);
});
/** Keep trigger, job eligibility and publication credentials within their owning blocks. */
function assertReleaseWorkflowBoundaries(ci, releaseWorkflow) {
  workflowEvent(ci, 'workflow_dispatch');
  assert.match(workflowEvent(ci, 'push'), /branches: \[main, develop, 'wip\/\*\*'\]/);
  const release = jobBlock(releaseWorkflow, 'release');
  const eligibility = release.slice(0, release.indexOf('    steps:'));
  assert.match(eligibility, /head_branch == 'main'/);
  assert.match(eligibility, /permissions:\n {6}actions: write\n/);
  assert.match(
    workflowStep(release, 'Semantic Release'),
    /GITHUB_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}/
  );
}
test('release staging runs ordinary CI while publication retains its main-only gate', () => {
  const read = (path) => readFileSync(path, 'utf8');
  assertReleaseWorkflowBoundaries(
    read('.github/workflows/ci.yml'),
    read('.github/workflows/release.yml')
  );
  const config = JSON.parse(read('.releaserc.json'));
  assert.ok(config.plugins.includes('./scripts/release-commit.mjs'));
  assert.deepEqual(config.branches, ['main']);
});
test('unrelated triggers, jobs and steps cannot satisfy the release workflow contract', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  const wrongTrigger = ci
    .replace("branches: [main, develop, 'wip/**']", 'branches: [main, develop]')
    .replace(
      'pull_request:\n    branches: [main, develop]',
      "pull_request:\n    branches: [main, develop, 'wip/**']"
    );
  assert.throws(() => assertReleaseWorkflowBoundaries(wrongTrigger, release));
  const wrongJob =
    release.replace("head_branch == 'main'", "head_branch == 'develop'") +
    "\n  unrelated:\n    if: head_branch == 'main'\n";
  assert.throws(() => assertReleaseWorkflowBoundaries(ci, wrongJob));
  const wrongStep =
    release.replace('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}', 'GITHUB_TOKEN: missing') +
    '\n      - name: Unrelated\n        env:\n          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n';
  assert.throws(() => assertReleaseWorkflowBoundaries(ci, wrongStep));
});
test('failed CI dispatch leaves the staged commit unpromoted', (t) => {
  const f = releaseFixture(t);
  assert.notEqual(f.release({ DISPATCH_FAIL: 'true' }).status, 0);
  assert.equal(f.pushes().length, 1);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.ok(!f.events().some((event) => event.type === 'ci-result'));
});
test('release requires the CI dispatch trigger and its own actions write permission', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  assert.throws(() =>
    assertReleaseWorkflowBoundaries(ci.replace('  workflow_dispatch:\n', ''), release)
  );
  const readOnly = release.replace('actions: write', 'actions: read');
  const unrelated = '\n  unrelated:\n    permissions:\n      actions: write\n';
  assert.throws(() => assertReleaseWorkflowBoundaries(ci, readOnly + unrelated));
});
test('accepted dispatch without a created run fails before waiting for checks or promotion', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ DISPATCH_MISSING: 'true' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no new run appeared/);
  assert.equal(f.pushes().length, 1);
  assert.ok(!f.events().some((event) => event.type === 'ci-result'));
});
test('dispatched main Fallow audit compares the real parent instead of main against itself', (t) => {
  const f = fixture(t);
  git(f.repo, 'checkout', 'locales');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const step = workflowStep(jobBlock(ci, 'fallow'), 'Resolve Fallow base');
  const script = step
    .slice(step.indexOf('run: |\n') + 'run: |\n'.length)
    .replaceAll('${{ github.event_name }}', 'workflow_dispatch')
    .replaceAll('${{ github.event.pull_request.base.sha }}', '')
    .replaceAll('${{ github.event.before }}', '');
  const result = spawnSync('/bin/bash', ['-e', '-c', script], {
    cwd: f.repo,
    env: f.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.output(), `base=${f.base}\n`);
  assert.notEqual(f.base, git(f.repo, 'rev-parse', 'HEAD'));
});
