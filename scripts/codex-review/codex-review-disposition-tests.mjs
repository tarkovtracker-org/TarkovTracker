import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRequestDispositions, publishReceipt } from './codex-review-disposition.mjs';
import { classifyState } from './codex-review-state.mjs';
import { parseArgs } from './codex-review.mjs';
const sha = '1111111111111111111111111111111111111111';
const head = '2222222222222222222222222222222222222222';
const command = {
  id: 10,
  node_id: 'IC_original',
  body: '@codex review',
  created_at: '2026-10-02T01:05:00Z',
  user: { login: 'maintainer', type: 'User' },
  author_association: 'MEMBER',
};
const review = {
  user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
  state: 'COMMENTED',
  commit_id: sha,
  submitted_at: '2026-10-02T01:06:00Z',
  body: '### Codex Review\nFindings recorded.',
};
const run = {
  id: 20,
  event: 'pull_request',
  head_sha: sha,
  head_branch: 'topic',
  repository: { full_name: 'example/repo' },
  head_repository: { full_name: 'example/repo' },
  pull_requests: [{ number: 44 }],
  created_at: '2026-10-02T01:04:00Z',
};
const inputs = () => ({
  pull: {
    head: { sha: head },
    state: 'open',
    draft: false,
    created_at: '2026-10-02T01:00:00Z',
    updated_at: '2026-10-02T01:10:00Z',
  },
  comments: [command],
  reviews: [review],
});
function fixture(t, { selectedRun = run, interval = [run], lastEditedAt = null } = {}) {
  const stateDirectory = mkdtempSync(join(tmpdir(), 'codex-disposition-'));
  t.after(() => rmSync(stateDirectory, { recursive: true, force: true }));
  return {
    stateDirectory,
    repo: 'example/repo',
    pr: 44,
    retireRequest: 10,
    requestSha: sha,
    evidenceRun: 20,
    runGh: (args) => {
      assert.ok(!args.includes('--method'), 'disposition must not mutate GitHub');
      if (args.includes('graphql'))
        return JSON.stringify({
          data: {
            node: {
              id: command.node_id,
              body: command.body,
              createdAt: command.created_at,
              lastEditedAt,
            },
          },
        });
      if (args.at(-1).includes('?')) {
        assert.ok(!args.at(-1).includes('branch='), 'branch renames cannot narrow the evidence');
        return JSON.stringify([{ workflow_runs: interval }]);
      }
      return JSON.stringify(selectedRun);
    },
  };
}
test('verified historical request permits one fresh head request, never marks that head reviewed', (t) => {
  const context = fixture(t);
  const original = inputs();
  assert.equal(classifyState(original, Date.parse('2026-10-02T02:00:00Z')).status, 'pending');
  const scoped = applyRequestDispositions(context, original);
  assert.equal(classifyState(scoped, Date.parse('2026-10-02T02:00:00Z')).status, 'unreviewed');
  assert.equal(original.comments[0].body, '@codex review', 'original evidence is not edited');
  assert.equal(readdirSync(join(context.stateDirectory, 'dispositions')).length, 1);
  const observed = applyRequestDispositions({ ...context, retireRequest: undefined }, original);
  assert.deepEqual(observed, scoped, 'receipt can be reused by ordinary observation');
  observed.comments.push({
    ...command,
    id: 11,
    body: `@codex review\n<!-- codex-review-request:${head} -->`,
  });
  assert.equal(classifyState(observed, Date.parse('2026-10-02T02:00:00Z')).status, 'pending');
});
test('missing, forged, earlier or wrong-SHA completion cannot retire a request', (t) => {
  for (const candidate of [
    null,
    { ...review, user: { login: review.user.login, type: 'User' } },
    { ...review, commit_id: head },
    { ...review, submitted_at: '2026-10-02T01:03:00Z' },
    { ...review, body: '### Codex Security Review\nNo issues.' },
    { ...review, body: '<!-- codex-security-review-finding:v1 -->\n### Codex Review\nNo issues.' },
    { ...review, state: 'PENDING' },
  ]) {
    const evidence = { ...inputs(), reviews: candidate ? [candidate] : [] };
    assert.throws(() => applyRequestDispositions(fixture(t), evidence), /authenticated/);
  }
});
test('wrong repository, fork, PR, revision or later run cannot establish request-time evidence', (t) => {
  for (const change of [
    { repository: { full_name: 'other/repo' } },
    { head_repository: { full_name: 'fork/repo' } },
    { pull_requests: [{ number: 45 }] },
    { head_sha: head },
    { event: 'workflow_dispatch' },
    { created_at: '2026-10-02T01:07:00Z' },
  ]) {
    assert.throws(
      () => applyRequestDispositions(fixture(t, { selectedRun: { ...run, ...change } }), inputs()),
      /does not verify/
    );
  }
});
test('intervening PR-head evidence fails closed', (t) => {
  const context = fixture(t, { interval: [run, { ...run, head_sha: head }] });
  assert.throws(() => applyRequestDispositions(context, inputs()), /ambiguous/);
});
test('unassociated and renamed-branch intervening heads remain ambiguous', (t) => {
  for (const change of [
    { pull_requests: [] },
    { pull_requests: undefined },
    { head_branch: 'renamed-topic' },
  ]) {
    const context = fixture(t, { interval: [run, { ...run, head_sha: head, ...change }] });
    assert.throws(() => applyRequestDispositions(context, inputs()), /ambiguous/);
  }
});
test('identified runs for other pull requests do not prevent disposition', (t) => {
  const context = fixture(t, {
    interval: [run, { ...run, head_sha: head, pull_requests: [{ number: 45 }] }],
  });
  assert.doesNotThrow(() => applyRequestDispositions(context, inputs()));
});
test('a command edited into place after creation cannot use earlier completion', (t) => {
  const context = fixture(t, { lastEditedAt: '2026-10-02T01:07:00Z' });
  assert.throws(() => applyRequestDispositions(context, inputs()), /edited/);
});
test('edited or removed request invalidates a persisted disposition', (t) => {
  const context = fixture(t);
  applyRequestDispositions(context, inputs());
  for (const comments of [
    [],
    [{ ...command, body: '@codex review changed' }],
    [{ ...command, created_at: '2026-10-02T01:04:00Z' }],
  ]) {
    assert.throws(() =>
      applyRequestDispositions({ ...context, retireRequest: undefined }, { ...inputs(), comments })
    );
  }
});
test('receipt publication is complete, restricted, exclusive and cleans temporary files', (t) => {
  const context = fixture(t);
  const path = join(context.stateDirectory, 'receipt.json');
  publishReceipt(path, { original: true });
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { original: true });
  const descriptor = openSync(path, 'r');
  try {
    assert.equal(fstatSync(descriptor).mode & 0o777, 0o600);
  } finally {
    closeSync(descriptor);
  }
  assert.throws(() => publishReceipt(path, { replacement: true }), { code: 'EEXIST' });
  const retained = openSync(path, 'r');
  try {
    assert.deepEqual(JSON.parse(readFileSync(retained, 'utf8')), { original: true });
  } finally {
    closeSync(retained);
  }
  assert.deepEqual(readdirSync(context.stateDirectory), ['receipt.json']);
});
test('disposition flags require complete evidence and cannot combine with a request', () => {
  assert.throws(() => parseArgs(['44', '--retire-request', '10']));
  const options = ['44', '--retire-request', '10', '--request-sha', sha, '--evidence-run', '20'];
  assert.equal(parseArgs(options).retireRequest, 10);
  assert.throws(() => parseArgs([...options, '--request']));
});
