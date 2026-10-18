import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './helpers/automation-fixture.mjs';
import {
  jobBlock,
  permissionsBlock,
  workflowEvent,
  workflowStep,
} from './helpers/workflow-blocks.mjs';
/** Stage realistic generated assets without modifying application code. */
function releaseFixture(t) {
  const f = fixture(t);
  const ghPath = join(f.env.PATH.split(':')[0], 'gh');
  const mock = readFileSync(ghPath, 'utf8');
  writeFileSync(
    ghPath,
    mock.replace(
      "if (args[0] === 'api') {",
      String.raw`  if (args[0] === 'api' && args.includes('repos/' + p.GITHUB_REPOSITORY + '/pulls')) {
    if (p.CREATE_PR_FAIL === 'true') process.exit(1);
    fs.appendFileSync(p.EVENTS, JSON.stringify({ type: 'release-pr', args }) + '\n');
    console.log(p.RELEASE_PR_URL || 'https://github.com/' + p.GITHUB_REPOSITORY + '/pull/901'); process.exit(0);
  }
  if (args[0] === 'api') {`
    )
  );
  writeFileSync(join(f.repo, 'package.json'), '{"private":true,"version":"1.2.3"}');
  writeFileSync(join(f.repo, 'CHANGELOG.md'), '# 1.2.3\n');
  return f;
}
function assertDailyReleaseSchedule(release) {
  assert.match(workflowEvent(release, 'schedule'), /^ {4}- cron: '0 15 \* \* \*'(?:\s+#.*)?$/m);
}
test('automatic releases get a daily catch-up opportunity instead of losing a whole week', () => {
  assertDailyReleaseSchedule(readFileSync('.github/workflows/release.yml', 'utf8'));
});
test('comments cannot satisfy the daily catch-up schedule requirement', () => {
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  const weekly = release.replace("- cron: '0 15 * * *'", "- cron: '0 15 * * 2'");
  assert.notEqual(weekly, release);
  const comment = "    # cron: '0 15 * * *'\n";
  assert.throws(() =>
    assertDailyReleaseSchedule(weekly.replace('  schedule:\n', `  schedule:\n${comment}`))
  );
  assert.throws(() =>
    assertDailyReleaseSchedule(release.replace("- cron: '0 15 * * *'", "# cron: '0 15 * * *'"))
  );
});
test('the trusted release snapshot includes loadable admission dependencies', (t) => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const step = workflowStep(jobBlock(workflow, 'release'), 'Check validated commit before setup');
  const script = step.split('script: |\n')[1];
  assert.ok(script, 'release bootstrap script is missing');
  const boundary = script.indexOf('const gatePath =');
  assert.ok(boundary > 0, 'release bootstrap boundary is missing');
  const bootstrap = script.slice(0, boundary);
  const directory = mkdtempSync(join(tmpdir(), 'release-admission-snapshot-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `(async () => {
        ${bootstrap}
        await import(pathToFileURL(process.env.RUNNER_TEMP + '/ci/review-admission-binding.mjs'));
      })().catch((error) => { console.error(error); process.exitCode = 1; });`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_WORKSPACE: process.cwd(), RUNNER_TEMP: directory },
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
test('release stages a version-only reviewed PR without pushing main or waiting for its merge', (t) => {
  const f = releaseFixture(t);
  const result = f.release();
  assert.equal(result.status, 0, result.stderr);
  const sha = git(f.repo, 'rev-parse', 'HEAD');
  assert.ok(
    f
      .calls()
      .some((args) =>
        args.includes(
          `repos/example/repo/commits/${sha}/check-runs?check_name=CI%20Result&filter=latest&per_page=100`
        )
      )
  );
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  const events = f.events();
  const previewIndex = events.findIndex((event) => event.type === 'preview-result');
  const prIndex = events.findIndex((event) => event.type === 'release-pr');
  assert.ok(previewIndex > 0 && prIndex > previewIndex);
  const pr = events[prIndex].args;
  assert.ok(pr.includes('head=wip/release-1.2.3-123-1'));
  assert.ok(pr.includes('base=main'));
  assert.ok(pr.includes('title=chore(release): 1.2.3'));
  assert.ok(
    pr.some((arg) => arg.includes(`Source: ${f.base}`) && arg.includes(`Candidate: ${sha}`))
  );
  assert.equal(f.pushes().length, 1);
  assert.equal(f.pushes()[0].args.at(-1), `${sha}:refs/heads/wip/release-1.2.3-123-1`);
  assert.ok(!f.calls().some((args) => args[0] === 'pr' && args[1] === 'merge'));
  const admission = f
    .calls()
    .find((args) => args[0] === 'workflow' && args[2] === 'review-admission.yml');
  assert.ok(admission.includes('pull_request=901'));
  assert.equal(admission[admission.indexOf('--ref') + 1], 'main');
  assert.ok(events.findIndex((event) => event.type === 'admission-dispatch') > prIndex);
});
test('admission trigger failure remains retryable without publishing or waiting for approval', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ ADMISSION_DISPATCH_FAIL: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Version PR #901 awaits admission; retry:/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(f.pushes().length, 1);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'tag', '--list'), '');
});
test('a malformed or foreign PR response cannot trigger admission for an unchecked identity', (t) => {
  for (const RELEASE_PR_URL of [
    'https://github.com/example/repo/pull/not-a-number',
    'https://github.com/other/repo/pull/901',
  ]) {
    const f = releaseFixture(t);
    const result = f.release({ RELEASE_PR_URL });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected release PR response/);
    assert.ok(!f.events().some((event) => event.type === 'admission-dispatch'));
  }
});
test('failed staging CI leaves main unchanged and never attempts promotion', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ CHECK_CONCLUSION: 'failure' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CI Result did not succeed/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(f.pushes().length, 1);
  assert.ok(!f.events().some((event) => event.type === 'preview-dispatch'));
});
test('release refuses a stale CI run or failed preview dispatch before promotion', (t) => {
  for (const overrides of [
    { CI_RUN_HEAD: 'a'.repeat(40) },
    { CI_WATCH_FAIL: 'true' },
    { PREVIEW_DISPATCH_FAIL: 'true' },
  ]) {
    const f = releaseFixture(t);
    const result = f.release(overrides);
    assert.equal(result.status, 1);
    assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
    assert.equal(f.pushes().length, 1);
  }
});
test('a version commit without a successful preview is never promoted', (t) => {
  const f = releaseFixture(t);
  const result = f.release({ PREVIEW_STATE: 'failure' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Preview Result did not succeed/);
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(f.pushes().length, 1);
  const events = f.events();
  const preview = events.find((event) => event.type === 'preview-result');
  assert.ok(preview && preview.sha !== f.base);
  const missing = releaseFixture(t).release({ PREVIEW_PRESENT: 'false' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Timed out waiting for Preview Result/);
});
test('failed PR creation retains recoverable staging assets and leaves main unchanged', (t) => {
  const f = releaseFixture(t);
  assert.notEqual(f.release({ CREATE_PR_FAIL: 'true' }).status, 0);
  assert.equal(
    git(f.repo, '--git-dir', f.remote, 'rev-parse', 'refs/heads/wip/release-1.2.3-123-1'),
    git(f.repo, 'rev-parse', 'HEAD')
  );
  assert.equal(git(f.repo, '--git-dir', f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(f.pushes().length, 1);
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
  // Staging branches receive CI only through explicit dispatch; ordinary wip/** push CI is gone.
  assert.match(workflowEvent(ci, 'push'), /^ {4}branches: \[main\]$/m);
  assert.doesNotMatch(workflowEvent(ci, 'push'), /wip/);
  const release = jobBlock(releaseWorkflow, 'release');
  const eligibility = release.slice(0, release.indexOf('    steps:'));
  assert.match(eligibility, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflowEvent(releaseWorkflow, 'schedule'), /cron: '[^']+'/);
  const triggers = releaseWorkflow.slice(0, releaseWorkflow.indexOf('\npermissions:'));
  assert.match(triggers, /^ {2}workflow_dispatch:$/m);
  assert.match(workflowEvent(releaseWorkflow, 'workflow_run'), /workflows: \[CI\]/);
  assert.match(workflowEvent(releaseWorkflow, 'workflow_run'), /^ {4}branches: \[main\]$/m);
  assert.match(permissionsBlock(eligibility, '    '), /^ {6}actions: write$/m);
  assert.match(
    workflowStep(release, 'Semantic Release'),
    /GITHUB_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}/
  );
}
function assertPromotionBoundary(releaseWorkflow) {
  const release = jobBlock(releaseWorkflow, 'release');
  const validation = workflowStep(release, 'Validate merged release preview');
  assert.match(validation, /require_main_revision "\$RELEASE_SHA"/);
  assert.match(validation, /request_preview_after_dispatched_ci "\$RELEASE_SHA"/);
  const recovery = workflowStep(release, 'Recover interrupted version publication');
  assert.match(recovery, /validatePromotion: true/);
  assert.match(recovery, /if \(!result\.recovery\) throw/);
  const record = workflowStep(release, 'Record prepared promotion provenance');
  assert.match(record, /name: release-promotion-\$\{\{ steps\.prepare\.outputs\.sha \}\}/);
  assert.match(record, /if-no-files-found: error/);
  assert.match(
    workflowStep(release, 'Semantic Release'),
    /run: node scripts\/release\/release-run\.mjs/
  );
}
test('publication rechecks exact merged preview and owns immutable preparation provenance', () => {
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  assertPromotionBoundary(release);
  for (const [before, after] of [
    ['validatePromotion: true', 'validatePromotion: false'],
    ['require_main_revision "$RELEASE_SHA"', 'true'],
    ['if-no-files-found: error', 'if-no-files-found: warn'],
    ['release-promotion-${{ steps.prepare.outputs.sha }}', 'release-promotion-latest'],
  ]) {
    const mutated = release.replace(before, after);
    assert.notEqual(mutated, release);
    assert.throws(() => assertPromotionBoundary(mutated));
  }
});
test('release staging runs ordinary CI while publication retains its main-only gate', () => {
  const read = (path) => readFileSync(path, 'utf8');
  assertReleaseWorkflowBoundaries(
    read('.github/workflows/ci.yml'),
    read('.github/workflows/release.yml')
  );
  const config = JSON.parse(read('.releaserc.json'));
  assert.ok(config.plugins.includes('./scripts/release/release-commit.mjs'));
  // Internal-scope filtering must wrap both the version analysis and the notes.
  const names = config.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  assert.equal(names[0], './scripts/release/release-scope.mjs');
  assert.ok(!names.includes('@semantic-release/commit-analyzer'));
  assert.ok(!names.includes('@semantic-release/release-notes-generator'));
  assert.deepEqual(config.branches, ['main']);
});
test('unrelated triggers, jobs and steps cannot satisfy the release workflow contract', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  const wrongTrigger = ci.replace(
    'push:\n    branches: [main]',
    "push:\n    branches: [main, 'wip/**']"
  );
  assert.notEqual(wrongTrigger, ci);
  assert.throws(() => assertReleaseWorkflowBoundaries(wrongTrigger, release));
  const wrongJob =
    release.replace("github.ref == 'refs/heads/main'", "github.ref == 'refs/heads/develop'") +
    "\n  unrelated:\n    if: github.ref == 'refs/heads/main'\n";
  assert.throws(() => assertReleaseWorkflowBoundaries(ci, wrongJob));
  const wrongStep =
    release.replaceAll('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}', 'GITHUB_TOKEN: missing') +
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
  // Add a second commit so the checked-out parent (f.head) differs from `main` (f.base); a
  // script that compared against main would then be visibly wrong.
  git(f.repo, 'commit', '--allow-empty', '-m', 'follow-up');
  assert.equal(git(f.repo, 'rev-parse', 'HEAD^'), f.head);
  assert.notEqual(f.head, f.base);
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const step = workflowStep(jobBlock(ci, 'fallow'), 'Resolve Fallow base');
  // The step reads event data through `env:` rather than inline template expansion.
  assert.match(step, /EVENT_NAME: \$\{\{ github.event_name \}\}/);
  assert.match(
    step,
    /PR_BASE_SHA: \$\{\{ github.event.pull_request.base.sha \|\| github.event.merge_group.base_sha \}\}/
  );
  assert.match(step, /PUSH_BEFORE_SHA: \$\{\{ github.event.before \}\}/);
  const script = step.slice(step.indexOf('run: |\n') + 'run: |\n'.length);
  assert.doesNotMatch(script, /\$\{\{/);
  const result = spawnSync('/bin/bash', ['-e', '-c', script], {
    cwd: f.repo,
    env: { ...f.env, EVENT_NAME: 'workflow_dispatch', PR_BASE_SHA: '', PUSH_BEFORE_SHA: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.output(), `base=${f.head}\n`);
  assert.notEqual(f.head, git(f.repo, 'rev-parse', 'HEAD'));
});
test('release permission key order does not change dispatch authorization', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const reordered = workflow.replace(
    '      actions: write\n      checks: read',
    '      checks: read\n      actions: write'
  );
  assert.notEqual(reordered, workflow, 'permission reordering must apply');
  assertReleaseWorkflowBoundaries(ci, reordered);
});
function assertOptionalNotifications(workflow) {
  const release = jobBlock(workflow, 'release');
  const recover = workflowStep(release, 'Recover interrupted version publication');
  const notify = workflowStep(release, 'Notify released pull requests');
  assert.doesNotMatch(recover, /continue-on-error/);
  assert.match(notify, /^ {8}if: steps\.eligible\.outcome == 'success'$/m);
  assert.match(notify, /^ {8}continue-on-error: true$/m);
  assert.ok(release.indexOf(recover) < release.indexOf(notify));
}
test('post-publication PR notifications cannot fail a completed release', () => {
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  assertOptionalNotifications(release);
  for (const [before, after] of [
    ['        continue-on-error: true\n', ''],
    ["if: steps.eligible.outcome == 'success'", "if: steps.recover.outcome == 'success'"],
  ]) {
    const mutated = release.replace(before, after);
    assert.notEqual(mutated, release);
    assert.throws(() => assertOptionalNotifications(mutated));
  }
});
test('unrelated job steps cannot satisfy post-publication notification boundaries', () => {
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  const notify = workflowStep(jobBlock(release, 'release'), 'Notify released pull requests');
  const moved = release.replace(notify, '') + '\n  unrelated:\n    steps:\n' + notify;
  assert.throws(() => assertOptionalNotifications(moved));
});
