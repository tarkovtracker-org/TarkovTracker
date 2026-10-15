import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enqueuePullRequest } from '../ci/enqueue-pr.mjs';
const head = 'a'.repeat(40);
const repo = { owner: 'example', repo: 'repo' };
function fixture() {
  const pr = {
    number: 1,
    node_id: 'PR_1',
    state: 'open',
    draft: false,
    head: { sha: head, repo: { full_name: 'example/repo' } },
    base: { ref: 'main', repo: { full_name: 'example/repo' } },
  };
  const entry = { id: 'MQE_1', pullRequest: { number: 1, headRefOid: head } };
  const state = { queued: null, queriedHead: head, result: entry, calls: [] };
  const github = {
    rest: { pulls: { get: async () => ({ data: pr }) } },
    graphql: async (query, variables) => {
      state.calls.push({ query, variables });
      if (query.startsWith('query'))
        return (
          state.current || {
            repository: {
              pullRequest: { headRefOid: state.queriedHead, mergeQueueEntry: state.queued },
            },
          }
        );
      if (state.error) throw state.error;
      return { enqueuePullRequest: { mergeQueueEntry: state.result } };
    },
  };
  return { pr, entry, state, run: () => enqueuePullRequest({ github, repo, number: 1, head }) };
}
test('native enqueue binds immutable PR identity and reports QUEUED without auto-merge', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { state: 'QUEUED', number: 1, head, entryId: 'MQE_1' });
  assert.match(f.state.calls[1].query, /enqueuePullRequest/);
  assert.deepEqual(f.state.calls[1].variables, {
    input: { pullRequestId: 'PR_1', expectedHeadOid: head },
  });
  assert.doesNotMatch(f.state.calls[1].query, /enablePullRequestAutoMerge|mergePullRequest/);
});
test('an already queued exact head is idempotent without a second mutation', async () => {
  const f = fixture();
  f.state.queued = f.entry;
  assert.equal((await f.run()).state, 'QUEUED');
  assert.equal(f.state.calls.length, 1);
});
test('queue submission denies changed, fork, draft, closed or foreign-base PRs', async () => {
  for (const change of [
    { number: 2 },
    { state: 'closed' },
    { draft: true },
    { node_id: '' },
    { head: { sha: 'b'.repeat(40), repo: { full_name: 'example/repo' } } },
    { head: { sha: head, repo: { full_name: 'fork/repo' } } },
    { base: { ref: 'develop', repo: { full_name: 'example/repo' } } },
    { base: { ref: 'main', repo: { full_name: 'foreign/repo' } } },
  ]) {
    const f = fixture();
    Object.assign(f.pr, change);
    await assert.rejects(f.run());
    assert.equal(f.state.calls.length, 0);
  }
});
test('head races, missing metadata and mismatched queue receipts never report success', async () => {
  const changed = fixture();
  changed.state.queriedHead = 'b'.repeat(40);
  await assert.rejects(changed.run());
  assert.equal(changed.state.calls.length, 1);
  for (const current of [{}, { repository: { pullRequest: { headRefOid: head } } }]) {
    const f = fixture();
    f.state.current = current;
    await assert.rejects(f.run());
    assert.equal(f.state.calls.length, 1);
  }
  for (const result of [
    null,
    {},
    { id: 'MQE_2', pullRequest: { number: 2, headRefOid: head } },
    { id: 'MQE_1', pullRequest: { number: 1, headRefOid: 'b'.repeat(40) } },
  ]) {
    const f = fixture();
    f.state.result = result;
    await assert.rejects(f.run());
  }
  const rejected = fixture();
  rejected.state.error = new Error('Expected head changed at enqueue');
  await assert.rejects(rejected.run(), /Expected head changed/);
});
