import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { relevantComment } from '../ci/review-admission.mjs';
import { jobBlock } from './helpers/workflow-blocks.mjs';
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
function allows(filename, job, github) {
  const source = readFileSync(`.github/workflows/${filename}.yml`, 'utf8');
  const block = jobBlock(source, job);
  const condition = block.match(/^ {4}if: (?:>-\n((?: {6}.*\n)+)|([^\n]+))/m);
  assert.ok(condition, `${filename}/${job} has no intake condition`);
  const expression = condition[1] || condition[2];
  // These gates use the common JS/GitHub boolean subset; string predicates are
  // case-insensitive, as GitHub's expression functions are.
  const evaluate = new Function(
    'github',
    'contains',
    'startsWith',
    `return Boolean(${expression});`
  );
  return evaluate(
    github,
    (value, needle) =>
      String(value ?? '')
        .toLowerCase()
        .includes(needle.toLowerCase()),
    (value, prefix) =>
      String(value ?? '')
        .toLowerCase()
        .startsWith(prefix.toLowerCase())
  );
}
function comment(body, from = '', user = { id: 1, type: 'User' }) {
  return event('issue_comment', { comment: { body, user }, changes: { body: { from } } });
}
test('unrelated comments allocate no admission-filter runner', () => {
  for (const github of [
    comment(''),
    comment('Thanks for the fix'),
    comment('<!-- tarkovtracker:pr-controls:v1 -->'),
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
test('skipped sources allocate no control-panel runner while failures still refresh the panel', () => {
  for (const conclusion of ['success', 'failure', 'cancelled', 'skipped']) {
    const github = event('workflow_run');
    github.event.workflow_run.conclusion = conclusion;
    assert.equal(allows('pr-controls', 'targets', github), conclusion !== 'skipped');
  }
  for (const name of ['pull_request_target', 'workflow_dispatch'])
    assert.equal(allows('pr-controls', 'targets', event(name)), true);
  const edited = comment('requested operation', '<!-- tarkovtracker:pr-controls:v1 -->');
  assert.equal(allows('pr-controls', 'targets', edited), true);
  edited.ref = 'refs/heads/untrusted';
  assert.equal(allows('pr-controls', 'targets', edited), false);
});
test('only relevant release-promotion jobs enter the serialized queue', () => {
  const workflow = readFileSync('.github/workflows/release-promotion-queue.yml', 'utf8');
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.match(
    jobBlock(workflow, 'enqueue'),
    /^ {4}concurrency:\n {6}group: release-promotion-queue\n {6}queue: max\n {6}cancel-in-progress: false$/m
  );
  for (const conclusion of ['success', 'failure', 'cancelled', 'skipped']) {
    const github = event('workflow_run');
    github.event.workflow_run.conclusion = conclusion;
    assert.equal(allows('release-promotion-queue', 'enqueue', github), conclusion === 'success');
  }
  const foreign = event('workflow_run');
  foreign.event.workflow_run.repository.full_name = 'other/repo';
  assert.equal(allows('release-promotion-queue', 'enqueue', foreign), false);
});
