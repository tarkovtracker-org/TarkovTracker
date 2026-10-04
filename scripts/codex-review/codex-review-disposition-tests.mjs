import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeSync,
  fstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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
function fixture(
  t,
  {
    selectedRun = run,
    interval = [run],
    intervalPages = [{ total_count: interval.length, workflow_runs: interval }],
    lastEditedAt = null,
  } = {}
) {
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
        return JSON.stringify(intervalPages);
      }
      return JSON.stringify(selectedRun);
    },
  };
}
function seedReceipt(context) {
  const directory = join(context.stateDirectory, 'dispositions');
  mkdirSync(directory, { recursive: true });
  publishReceipt(join(directory, 'example_repo-44-10.json'), {
    commentId: command.id,
    sha,
    runId: run.id,
    createdAt: command.created_at,
    bodyHash: createHash('sha256').update(command.body).digest('hex'),
  });
}
test('a workflow-skipped push before an untagged request cannot publish a receipt', (t) => {
  // A runs at 01:04, B is pushed with [skip ci] at 01:04:30, the command is
  // posted at B at 01:05, and A receives a late review at 01:06. Actions only sees A.
  const context = fixture(t);
  const original = inputs();
  assert.throws(() => applyRequestDispositions(context, original), /request-time head/);
  assert.deepEqual(readdirSync(context.stateDirectory), []);
  assert.equal(classifyState(original, Date.parse('2026-10-02T02:00:00Z')).status, 'pending');
});
test('a legacy receipt cannot retire a request after a workflow-skipped push', (t) => {
  const context = fixture(t);
  seedReceipt(context);
  const original = inputs();
  assert.throws(
    () => applyRequestDispositions({ ...context, retireRequest: undefined }, original),
    /request-time head/
  );
  assert.equal(original.comments[0].body, '@codex review');
  assert.equal(classifyState(original, Date.parse('2026-10-02T02:00:00Z')).status, 'pending');
});
test('Actions evidence alone cannot retire even an apparently completed historical request', (t) => {
  const context = fixture(t);
  const original = inputs();
  assert.throws(() => applyRequestDispositions(context, original), /request-time head/);
  assert.equal(original.comments[0].body, '@codex review');
  assert.deepEqual(readdirSync(context.stateDirectory), []);
  assert.equal(classifyState(original, Date.parse('2026-10-02T02:00:00Z')).status, 'pending');
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
    { created_at: command.created_at },
  ]) {
    assert.throws(
      () => applyRequestDispositions(fixture(t, { selectedRun: { ...run, ...change } }), inputs()),
      /does not verify/
    );
  }
});
test('intervening PR-head evidence fails closed', (t) => {
  const context = fixture(t, { interval: [run, { ...run, id: 21, head_sha: head }] });
  assert.throws(() => applyRequestDispositions(context, inputs()), /ambiguous/);
});
test('unassociated and renamed-branch intervening heads remain ambiguous', (t) => {
  for (const change of [
    { pull_requests: [] },
    { pull_requests: undefined },
    { head_branch: 'renamed-topic' },
  ]) {
    const context = fixture(t, { interval: [run, { ...run, id: 21, head_sha: head, ...change }] });
    assert.throws(() => applyRequestDispositions(context, inputs()), /ambiguous/);
  }
});
test('identified runs for other pull requests do not prove the request-time head', (t) => {
  const context = fixture(t, {
    interval: [run, { ...run, id: 21, head_sha: head, pull_requests: [{ number: 45 }] }],
  });
  assert.throws(() => applyRequestDispositions(context, inputs()), /request-time head/);
});
test('capped or incomplete workflow searches cannot publish a disposition', (t) => {
  const runs = Array.from({ length: 1000 }, (_, index) => ({ ...run, id: run.id + index }));
  const capped = Array.from({ length: 10 }, (_, index) => ({
    total_count: 1001,
    workflow_runs: runs.slice(index * 100, (index + 1) * 100),
  }));
  for (const intervalPages of [
    capped,
    capped.map((page) => ({ ...page, total_count: 1000 })),
    [{ total_count: 2, workflow_runs: [run] }],
    [{ total_count: 0, workflow_runs: [] }],
    [{ total_count: 1 }],
    [{ workflow_runs: [run] }],
    [],
    null,
  ]) {
    const context = fixture(t, { intervalPages });
    const original = inputs();
    assert.throws(() => applyRequestDispositions(context, original), /workflow-run interval/);
    assert.deepEqual(readdirSync(context.stateDirectory), [], 'no receipt is published');
    assert.equal(classifyState(original, Date.parse('2026-10-02T02:00:00Z')).status, 'pending');
    assert.equal(original.comments[0].body, '@codex review');
  }
});
test('inconsistent counts, duplicate runs or a missing evidence run fail closed', (t) => {
  const other = { ...run, id: 21 };
  for (const intervalPages of [
    [
      { total_count: 2, workflow_runs: [run] },
      { total_count: 3, workflow_runs: [other] },
    ],
    [
      { total_count: 2, workflow_runs: [run] },
      { total_count: 2, workflow_runs: [run] },
    ],
    [{ total_count: 1, workflow_runs: [other] }],
  ]) {
    const context = fixture(t, { intervalPages });
    assert.throws(() => applyRequestDispositions(context, inputs()), /workflow-run interval/);
    assert.deepEqual(readdirSync(context.stateDirectory), []);
  }
});
test('complete multi-page intervals below the search limit still lack request-time head proof', (t) => {
  const runs = Array.from({ length: 999 }, (_, index) => ({ ...run, id: run.id + index }));
  const intervalPages = Array.from({ length: 10 }, (_, index) => ({
    total_count: runs.length,
    workflow_runs: runs.slice(index * 100, (index + 1) * 100),
  }));
  assert.throws(
    () => applyRequestDispositions(fixture(t, { intervalPages }), inputs()),
    /request-time head/
  );
});
test('a persisted disposition is rejected when its live workflow search becomes incomplete', (t) => {
  const intervalPages = [{ total_count: 1, workflow_runs: [run] }];
  const context = fixture(t, { intervalPages });
  seedReceipt(context);
  intervalPages[0].total_count = 1001;
  assert.throws(
    () => applyRequestDispositions({ ...context, retireRequest: undefined }, inputs()),
    /workflow-run interval/
  );
  assert.equal(readdirSync(join(context.stateDirectory, 'dispositions')).length, 1);
});
test('a command edited into place after creation cannot use earlier completion', (t) => {
  const context = fixture(t, { lastEditedAt: '2026-10-02T01:07:00Z' });
  assert.throws(() => applyRequestDispositions(context, inputs()), /edited/);
});
test('edited or removed request invalidates a persisted disposition', (t) => {
  const context = fixture(t);
  seedReceipt(context);
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
test('receipt publication is restricted to its owner', (t) => {
  const path = join(fixture(t).stateDirectory, 'restricted.json');
  publishReceipt(path, { original: true });
  const descriptor = openSync(path, 'r');
  try {
    assert.equal(fstatSync(descriptor).mode & 0o777, 0o600);
  } finally {
    closeSync(descriptor);
  }
});
test('receipt publication is complete, exclusive and cleans temporary files', (t) => {
  const context = fixture(t);
  const path = join(context.stateDirectory, 'receipt.json');
  publishReceipt(path, { original: true });
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { original: true });
  assert.throws(() => publishReceipt(path, { replacement: true }), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { original: true });
  assert.deepEqual(readdirSync(context.stateDirectory), ['receipt.json']);
});
test('disposition flags require complete evidence and cannot combine with a request', () => {
  assert.throws(() => parseArgs(['44', '--retire-request', '10']));
  const options = ['44', '--retire-request', '10', '--request-sha', sha, '--evidence-run', '20'];
  assert.equal(parseArgs(options).retireRequest, 10);
  assert.throws(() => parseArgs([...options, '--request']));
});
