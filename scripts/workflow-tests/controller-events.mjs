import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { relevantComment } from '../ci/review-admission.mjs';
import {
  jobBlock,
  permissionsBlock,
  workflowEvent,
  workflowStep,
} from './helpers/workflow-blocks.mjs';
const repository = 'example/repo';
const head = 'a'.repeat(40);
const bot = { id: 136622811, type: 'Bot', login: 'coderabbitai[bot]' };
function event(name, payload = {}) {
  return {
    event_name: name,
    ref: 'refs/heads/main',
    repository,
    event: {
      workflow_run: { conclusion: 'success', repository: { full_name: repository } },
      issue: { pull_request: {} },
      comment: { body: '', user: { id: 1, type: 'User' } },
      changes: { body: { from: '' } },
      sender: { type: 'User' },
      ...payload,
    },
  };
}
function allows(filename, job, github, needs = {}) {
  const source = readFileSync(`.github/workflows/${filename}.yml`, 'utf8');
  const block = jobBlock(source, job);
  const condition = block.match(/^ {4}if: (?:>-\n((?: {6}.*\n)+)|([^\n]+))/m);
  assert.ok(condition, `${filename}/${job} has no intake condition`);
  const expression = condition[1] || condition[2];
  // These gates use the common JS/GitHub boolean subset; string predicates are
  // case-insensitive, as GitHub's expression functions are.
  const evaluate = new Function(
    'github',
    'needs',
    'contains',
    'startsWith',
    'endsWith',
    'fromJSON',
    `return Boolean(${expression});`
  );
  const text = (value) => String(value ?? '').toLowerCase();
  return evaluate(
    github,
    needs,
    (value, needle) =>
      Array.isArray(value)
        ? value.some((item) => text(item) === text(needle))
        : text(value).includes(text(needle)),
    (value, prefix) => text(value).startsWith(text(prefix)),
    (value, suffix) => text(value).endsWith(text(suffix)),
    JSON.parse
  );
}
function comment(body, from = '', user = { id: 1, type: 'User' }) {
  return event('issue_comment', { comment: { body, user }, changes: { body: { from } } });
}
test('unrelated comments allocate no admission-filter runner', () => {
  for (const github of [
    comment(''),
    comment('Thanks for the fix'),
    comment('<!-- recent_review_start -->', '', { ...bot, id: 2 }),
    event('issue_comment', {
      issue: {},
      comment: { body: `/approve-sensitive ${head}`, user: { id: 1, type: 'User' } },
    }),
  ]) {
    assert.equal(allows('review-admission', 'filter', github), false, JSON.stringify(github.event));
  }
});
test('the admission prefilter preserves command and provider withdrawal events', () => {
  for (const github of [
    comment(`/approve-sensitive ${head}`),
    comment(`\r\n\t /approve-sensitive ${head}`),
    comment('withdrawn', `\t/approve-sensitive ${head}`),
    comment(`/approve-sensitive ${head}`, ''),
    comment('<!-- recent_review_start -->', '', bot),
    comment('<!-- final_review_risk_coverage:{} -->', '', bot),
    comment('withdrawn', '<!-- recent_review_start -->', bot),
    comment('withdrawn', '<!-- final_review_risk_coverage:{} -->', bot),
  ]) {
    for (const action of ['created', 'edited', 'deleted']) {
      github.event.action = action;
      assert.equal(relevantComment(github.event), true);
      assert.equal(allows('review-admission', 'filter', github), true);
    }
  }
});
test('admission signal intake ignores unsuccessful runs and retains other trusted events', () => {
  for (const conclusion of ['success', 'failure', 'cancelled', 'skipped', null]) {
    const github = event('workflow_run');
    github.event.workflow_run.conclusion = conclusion;
    assert.equal(allows('review-admission', 'filter', github), conclusion === 'success');
  }
  for (const name of ['pull_request_target', 'workflow_dispatch'])
    assert.equal(allows('review-admission', 'filter', event(name)), true);
});
test('only relevant release-promotion jobs enter the serialized queue', () => {
  const workflow = readFileSync('.github/workflows/release-promotion-queue.yml', 'utf8');
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.match(
    jobBlock(workflow, 'enqueue'),
    /^ {4}concurrency:\n {6}group: release-promotion-queue\n {6}queue: max\n {6}cancel-in-progress: false$/m
  );
  for (const conclusion of ['success', 'failure', 'cancelled', 'skipped']) {
    const github = sourceRun('release');
    github.event.workflow_run.conclusion = conclusion;
    assert.equal(allows('release-promotion-queue', 'enqueue', github), conclusion === 'success');
  }
  const foreign = sourceRun('release');
  foreign.event.workflow_run.repository.full_name = 'other/repo';
  assert.equal(allows('release-promotion-queue', 'enqueue', foreign), false);
});
test('explicit promotion dispatch only runs the main controller', () => {
  const dispatch = event('workflow_dispatch');
  assert.equal(allows('release-promotion-queue', 'enqueue', dispatch), true);
  dispatch.ref = 'refs/heads/untrusted';
  assert.equal(allows('release-promotion-queue', 'enqueue', dispatch), false);
});
test('only published release admission requests promotion with isolated dispatch permissions', async () => {
  const workflow = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  const job = jobBlock(workflow, 'request-promotion');
  assert.match(job, /needs: admission/);
  assert.equal(permissionsBlock(job, '    ').trim(), 'actions: write');
  assert.doesNotMatch(job, /secrets\.|environment:|checkout@/);
  const admission = jobBlock(workflow, 'admission');
  assert.match(admission, /release_promotion: \$\{\{ steps.publish.outputs.release_promotion \}\}/);
  assert.match(
    admission,
    /admission_run_attempt: \$\{\{ steps.publish.outputs.admission_run_attempt \}\}/
  );
  const publish = workflowStep(admission, 'Publish verified admission after evidence upload');
  assert.match(publish, /id: publish/);
  assert.match(publish, /const releasePromotion = await publishReviewScope/);
  assert.match(publish, /core.setOutput\('release_promotion', String\(releasePromotion\)\)/);
  assert.match(
    publish,
    /core.setOutput\('admission_run_attempt', process.env.GITHUB_RUN_ATTEMPT\)/
  );
  const calls = [];
  const github = {
    rest: { actions: { createWorkflowDispatch: async (args) => calls.push(args) } },
  };
  const dispatch = workflowStep(job, 'Dispatch promotion from trusted main');
  assert.match(dispatch, /^ {10}retries: 3$/m);
  assert.match(
    dispatch,
    /ADMISSION_RUN_ATTEMPT: \$\{\{ needs.admission.outputs.admission_run_attempt \}\}/
  );
  const script = dispatch.split('script: |\n')[1];
  const execute = new Function(
    'github',
    'context',
    'process',
    `return (async () => { ${script} })()`
  );
  for (const output of [undefined, '', 'false', 'true']) {
    const needs = { admission: { outputs: { release_promotion: output } } };
    const allowed = allows(
      'review-admission',
      'request-promotion',
      event('workflow_dispatch'),
      needs
    );
    assert.equal(allowed, output === 'true');
    if (allowed)
      await execute(
        github,
        { repo: { owner: 'example', repo: 'repo' }, runId: 123 },
        { env: { GITHUB_RUN_ATTEMPT: '2', ADMISSION_RUN_ATTEMPT: '2' } }
      );
  }
  assert.deepEqual(calls, [
    {
      owner: 'example',
      repo: 'repo',
      workflow_id: 'release-promotion-queue.yml',
      ref: 'main',
      inputs: { admission_run_id: '123', admission_run_attempt: '2' },
    },
  ]);
  for (const attempt of ['1', undefined]) {
    await assert.rejects(
      execute(
        github,
        { repo: { owner: 'example', repo: 'repo' }, runId: 123 },
        { env: { GITHUB_RUN_ATTEMPT: '2', ADMISSION_RUN_ATTEMPT: attempt } }
      ),
      /freshly published admission/
    );
    assert.equal(calls.length, 1);
  }
});
function sourceRun(path, fields = {}) {
  const github = event('workflow_run');
  Object.assign(github.event.workflow_run, { path: `.github/workflows/${path}.yml`, ...fields });
  return github;
}
test('ordinary PR admissions never wake the release promotion queue', () => {
  const workflow = readFileSync('.github/workflows/release-promotion-queue.yml', 'utf8');
  assert.match(workflow, /workflows: \[Release\]/);
  assert.doesNotMatch(workflow, /workflows: \[[^\n]*Review Admission/);
  const admission = (title) =>
    allows(
      'release-promotion-queue',
      'enqueue',
      sourceRun('review-admission', { display_title: title })
    );
  for (const title of [
    'Review Admission feat/dashboard-up-next',
    'Review Admission main',
    'Review Admission fix/release-notes',
  ])
    assert.equal(admission(title), false, title);
  for (const title of [
    'Review Admission wip/release-1.2.3-123-1',
    'Review Admission gh-readonly-queue/main/pr-7-abcdef',
    'Review Admission unscoped',
    // Older display titles cannot restore the removed completion trigger either.
    'Review Admission',
    'chore(release): 1.2.3',
  ])
    assert.equal(admission(title), false, title);
  for (const event of ['schedule', 'workflow_dispatch', 'workflow_run'])
    assert.equal(
      allows('release-promotion-queue', 'enqueue', sourceRun('release', { event })),
      true
    );
});
/** Evaluate the actual display locator and feed its title into promotion intake. */
function admissionTitle(payload = {}) {
  const workflow = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  const expression = workflow.match(/^run-name: Review Admission \$\{\{ (.+) \}\}$/m);
  assert.ok(expression, 'admission workflow has no display locator');
  const github = event('workflow_run', { pull_request: { head: { ref: '' } }, ...payload });
  return `Review Admission ${new Function('github', `return (${expression[1]});`)(github)}`;
}
test('provider-suite admissions do not automatically wake promotion from the default branch', () => {
  const title = admissionTitle({ workflow_run: { event: 'check_suite', head_branch: 'main' } });
  assert.equal(title, 'Review Admission unscoped');
  assert.equal(
    allows(
      'release-promotion-queue',
      'enqueue',
      sourceRun('review-admission', { display_title: title })
    ),
    false
  );
});
test('the admission locator preserves candidate branches and unscoped events', () => {
  for (const [payload, branch] of [
    [{ pull_request: { head: { ref: 'wip/release-1.2.3' } } }, 'wip/release-1.2.3'],
    [{ pull_request: { head: { ref: 'feat/dashboard' } } }, 'feat/dashboard'],
    [
      { workflow_run: { event: 'pull_request_review', head_branch: 'wip/release-1.2.3' } },
      'wip/release-1.2.3',
    ],
    [
      { workflow_run: { event: 'pull_request_review_comment', head_branch: 'feat/dashboard' } },
      'feat/dashboard',
    ],
    [
      { workflow_run: { event: 'merge_group', head_branch: 'gh-readonly-queue/main/pr-7-abcdef' } },
      'gh-readonly-queue/main/pr-7-abcdef',
    ],
    [{}, 'unscoped'],
  ])
    assert.equal(admissionTitle(payload), `Review Admission ${branch}`);
});
test('review withdrawals cannot be canceled or delayed by subsequent review edits', () => {
  const signal = readFileSync('.github/workflows/review-admission-signal.yml', 'utf8');
  for (const [name, types] of [
    ['pull_request_review', ['submitted', 'edited', 'dismissed']],
    ['pull_request_review_comment', ['created', 'edited', 'deleted']],
  ]) {
    const block = workflowEvent(signal, name);
    const configured = block.match(/^ {4}types:\s*\[([^\]]+)\]/m);
    assert.ok(configured, `${name} must configure its event types`);
    assert.deepEqual(
      configured[1]
        .split(',')
        .map((type) => type.trim())
        .sort(),
      types.sort()
    );
  }
  assert.doesNotMatch(signal, /^concurrency:/m);
  const job = jobBlock(signal, 'signal');
  assert.doesNotMatch(job, /sleep\s+\d|concurrency:/);
  assert.ok(job.includes('Notify trusted admission controller'));
  for (const [name, action, state] of [
    ['pull_request_review', 'dismissed', 'DISMISSED'],
    ['pull_request_review', 'submitted', 'CHANGES_REQUESTED'],
    ['pull_request_review', 'edited', 'COMMENTED'],
    ['pull_request_review_comment', 'edited', 'COMMENTED'],
  ]) {
    assert.equal(
      allows(
        'review-admission-signal',
        'signal',
        event(name, {
          action,
          pull_request: { number: 7 },
          review: { state },
        })
      ),
      true
    );
  }
});
