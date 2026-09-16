import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './helpers/automation-fixture.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const read = (path) => readFileSync(path, 'utf8');
/** Require a successful gate subprocess with its diagnostic on failure. */
function passed(result) {
  assert.equal(result.status, 0, result.stderr);
}
/** Require a failed gate subprocess with the expected rejection reason. */
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
  const ciRead = f.calls().find((args) => args.some((arg) => arg.includes('/check-runs?')));
  assert.ok(
    ciRead.includes(
      `repos/example/repo/commits/${f.head}/check-runs?check_name=CI%20Result&filter=latest&per_page=100`
    )
  );
  const merge = f.calls().find((args) => args[1] === 'merge');
  assert.equal(merge[merge.indexOf('--match-head-commit') + 1], f.head);
  assert.ok(merge.includes('--squash'));
  assert.ok(!merge.includes('--admin'));
  assert.equal(merge[merge.indexOf('--body') + 1], 'Automated translation updates from Crowdin.');
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
  rejected(f.run('merge', { GH_TOKEN: '' }), /GH_TOKEN is required/);
  rejected(f.run('merge', { CURRENT_BASE: 'c'.repeat(40) }), /Main changed/);
  rejected(
    f.run('merge', { PR_STATES: JSON.stringify([{ ...f.pr, isDraft: true }]) }),
    /Expected an open/
  );
  git(f.repo, 'checkout', 'main');
  rejected(f.run('merge'), /Checkout differs/);
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
/** Require both workflow boundaries before checking their execution order. */
function assertStepOrder(job, first, second) {
  const firstIndex = job.indexOf(first);
  const secondIndex = job.indexOf(second);
  assert.notEqual(firstIndex, -1, `missing ${first}`);
  assert.notEqual(secondIndex, -1, `missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} must precede ${second}`);
}
/** Verify each workflow boundary within its owning job and step. */
function assertWorkflowBoundaries(workflow) {
  const sync = jobBlock(workflow, 'sync');
  assertStepOrder(
    sync,
    '      - name: Preserve trusted merge gate\n',
    '      - name: Synchronize Crowdin translations\n'
  );
  assertStepOrder(
    sync,
    '      - name: Prepare immutable translation checkout\n',
    '      - uses: ./.github/actions/setup-project\n'
  );
  const mergeStep = workflowStep(sync, 'Merge validated translations');
  const beforeMerge = sync.slice(0, sync.indexOf('      - name: Merge validated translations'));
  const synchronization = workflowStep(sync, 'Synchronize Crowdin translations');
  assert.match(synchronization, /GITHUB_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}/);
  const update = workflowStep(sync, 'Update translation branch from main');
  assert.match(update, /GH_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}/);
  assert.match(update, /crowdin-pr.sh" update/);
  assertStepOrder(
    sync,
    '      - name: Update translation branch from main\n',
    '      - name: Prepare immutable translation checkout\n'
  );
  const prepare = workflowStep(sync, 'Prepare immutable translation checkout');
  assert.doesNotMatch(prepare, /ACCESS_TOKEN_GITHUB/);
  assert.ok(beforeMerge.includes('setup-project'));
  assert.match(mergeStep, /GH_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}/);
  assert.match(mergeStep, /HEAD_SHA: \$\{\{ steps.candidate.outputs.head_sha \}\}/);
  assert.match(mergeStep, /BASE_SHA: \$\{\{ steps.candidate.outputs.base_sha \}\}/);
  assert.match(mergeStep, /run: bash "\$RUNNER_TEMP\/crowdin-pr.sh" merge/);
  const validation = workflowStep(sync, 'Validate translations');
  assert.doesNotMatch(validation, /GH_TOKEN|secrets\./);
  for (const check of ['format:check', 'i18n:check', 'systems:check'])
    assert.ok(validation.includes(`pnpm run ${check}`));
}
test('workflow separates trusted gate, immutable setup, token-free checks and job-token merge', () => {
  assertWorkflowBoundaries(read('.github/workflows/crowdin.yml'));
  assert.match(read('.github/workflows/ci.yml'), /push:\n {4}branches: \[main,/);
  assert.match(read('.github/workflows/release.yml'), /workflow_run.event == 'push'/);
});
test('unrelated steps and jobs cannot satisfy the real merge-step contract', () => {
  const workflow = read('.github/workflows/crowdin.yml');
  const broken = workflow.replace(
    'GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    'GITHUB_TOKEN: missing'
  );
  const decoy = '        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n';
  assert.throws(() => assertWorkflowBoundaries(`${broken}      - name: Unrelated step\n${decoy}`));
  assert.throws(() =>
    assertWorkflowBoundaries(
      `${broken}  unrelated:\n    steps:\n      - name: Merge validated translations\n${decoy}`
    )
  );
});
test('missing or reversed required workflow steps cannot pass ordering checks', () => {
  const workflow = read('.github/workflows/crowdin.yml');
  const pairs = [
    [
      '      - name: Preserve trusted merge gate\n',
      '      - name: Synchronize Crowdin translations\n',
    ],
    [
      '      - name: Prepare immutable translation checkout\n',
      '      - uses: ./.github/actions/setup-project\n',
    ],
  ];
  for (const [first, second] of pairs) {
    assert.throws(() => assertWorkflowBoundaries(workflow.replace(first, '')), /missing/);
    assert.throws(() => assertWorkflowBoundaries(workflow.replace(second, '')), /missing/);
    const reversed = workflow
      .replace(first, '__FIRST_STEP__')
      .replace(second, first)
      .replace('__FIRST_STEP__', second);
    assert.throws(() => assertWorkflowBoundaries(reversed), /must precede/);
  }
});
test('strict server policy rejects a base race and a missing required check', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  rejected(f.run('merge', { ACTUAL_BASE: 'd'.repeat(40) }), /Base advanced at merge/);
  rejected(f.run('merge', { RULES: '[]' }), /Missing strict main/);
  assert.ok(!f.calls().some((args) => args.some((arg) => arg.includes('/rulesets/'))));
});
test('Crowdin waits for successful exact-head CI and rejects terminal failures', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  for (const CHECK_CONCLUSION of ['failure', 'cancelled', 'skipped', 'neutral']) {
    rejected(f.run('merge', { CHECK_CONCLUSION }), /CI Result did not succeed/);
  }
  rejected(f.run('merge', { CHECK_APP: '999' }), /Timed out/);
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
test('main policy configuration enforces GitHub Actions CI and freshness without exceptions', () => {
  const policy = JSON.parse(read('.github/main-ci-ruleset.json'));
  assert.equal(policy.enforcement, 'active');
  assert.equal(policy.target, 'branch');
  assert.deepEqual(policy.bypass_actors, []);
  assert.deepEqual(policy.conditions.ref_name, { include: ['refs/heads/main'], exclude: [] });
  assert.deepEqual(policy.rules, [
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [{ context: 'CI Result', integration_id: 15368 }],
      },
    },
  ]);
});
test('a candidate must contain main even when its full tree only differs in translations', (t) => {
  const f = fixture(t);
  git(f.repo, 'commit', '--allow-empty', '-m', 'advance main');
  rejected(f.run('prepare'), /must include current main/);
  assert.equal(f.output(), '');
});
test('policy checks reject loose freshness, another provider and another required context', (t) => {
  const f = fixture(t);
  passed(f.run('prepare'));
  const policy = JSON.parse(read('.github/main-ci-ruleset.json'));
  for (const parameters of [
    { ...policy.rules[0].parameters, strict_required_status_checks_policy: false },
    {
      strict_required_status_checks_policy: true,
      required_status_checks: [{ context: 'CI Result', integration_id: 999 }],
    },
    {
      strict_required_status_checks_policy: true,
      required_status_checks: [{ context: 'Other check', integration_id: 15368 }],
    },
  ]) {
    const rule = {
      type: 'required_status_checks',
      ruleset_source_type: 'Repository',
      ruleset_source: 'example/repo',
      ruleset_id: 42,
      parameters,
    };
    rejected(f.run('merge', { RULES: JSON.stringify([rule]) }), /Missing strict main/);
  }
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
test('branch update preserves current heads and guards stale heads before validation', (t) => {
  const current = fixture(t);
  passed(current.run('update'));
  assert.ok(!current.calls().some((args) => args.includes('--method')));
  const f = fixture(t);
  git(f.repo, 'commit', '--allow-empty', '-m', 'advance main');
  git(f.repo, 'checkout', 'locales');
  git(f.repo, 'merge', '--no-ff', 'main', '-m', 'update branch');
  const headRefOid = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'checkout', 'main');
  const states = JSON.stringify([f.pr, f.pr, { ...f.pr, headRefOid }]);
  passed(f.run('update', { PR_STATES: states }));
  const update = f.calls().find((args) => args.includes('--method'));
  assert.ok(update.includes(`expected_head_sha=${f.head}`));
  passed(f.run('prepare', { PR_STATES: JSON.stringify([{ ...f.pr, headRefOid }]) }));
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), headRefOid);
});
test('branch updates reject raced heads, wrong PR identity and an update that never completes', (t) => {
  const f = fixture(t);
  git(f.repo, 'commit', '--allow-empty', '-m', 'advance main');
  rejected(f.run('update', { ACTUAL_HEAD: 'a'.repeat(40) }), /Head changed at branch update/);
  rejected(
    f.run('update', { PR_STATES: JSON.stringify([{ ...f.pr, isCrossRepository: true }]) }),
    /Expected an open/
  );
  rejected(f.run('update'), /Timed out waiting for the translation branch update/);
  assert.equal(f.output(), '');
});
test('Crowdin dispatches candidate CI before merge and main CI after merge', (t) => {
  const f = fixture(t);
  assert.equal(f.run('prepare').status, 0);
  const result = f.run('merge');
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  const dispatches = calls.filter((args) => args[0] === 'workflow');
  assert.deepEqual(
    dispatches.map((args) => args.at(-1)),
    ['locales', 'main']
  );
  const merged = calls.findIndex((args) => args[0] === 'pr' && args[1] === 'merge');
  assert.ok(calls.indexOf(dispatches[0]) < merged);
  assert.ok(calls.indexOf(dispatches[1]) > merged);
});
test('Crowdin refuses to merge when dispatch fails', (t) => {
  const f = fixture(t);
  assert.equal(f.run('prepare').status, 0);
  assert.notEqual(f.run('merge', { DISPATCH_FAIL: 'true' }).status, 0);
  assert.ok(!f.calls().some((args) => args[1] === 'merge'));
});
