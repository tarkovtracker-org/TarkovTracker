import assert from 'node:assert/strict';
import test from 'node:test';
import { collapseReviewCommands } from './codex-review-collapse.mjs';
const HEAD = 'a'.repeat(40);
const BOT = { login: 'chatgpt-codex-connector[bot]', type: 'Bot' };
function fixture(options = {}) {
  const command = {
    id: 1,
    node_id: 'IC_original',
    user: { login: 'maintainer', type: 'User' },
    author_association: 'MEMBER',
    body: `@codex review\n<!-- codex-review-request:${HEAD} -->`,
    created_at: '2026-10-01T01:00:00Z',
    reactions: { eyes: options.eyes ?? 0 },
  };
  const calls = [];
  const warnings = [];
  const context = {
    repo: 'example/repo',
    minimizedNodes: new Set(),
    warn: (message) => warnings.push(message),
    runGh: (args) => {
      calls.push(args);
      if (options.fail) throw new Error('cosmetic API failure');
      if (args.includes('graphql')) return graphqlResponse(args, options);
      return JSON.stringify([options.reactions ?? []]);
    },
  };
  const inputs = {
    pull: { head: { sha: HEAD } },
    comments: [command, ...(options.comments ?? [])],
    reviews: options.reviews ?? [],
    resolvedShas: {},
  };
  return { context, inputs, calls, warnings };
}
function graphqlResponse(args, options) {
  if (args.some((arg) => arg.includes('mutation'))) {
    assert.ok(args.includes('id=IC_original'));
    assert.ok(args.some((arg) => arg.includes('classifier: RESOLVED')));
    return JSON.stringify({
      data: { minimizeComment: { minimizedComment: { isMinimized: true } } },
    });
  }
  return JSON.stringify({ data: { node: { isMinimized: options.minimized ?? false } } });
}
function completion(options = {}) {
  return {
    id: 2,
    node_id: 'IC_findings',
    user: BOT,
    created_at: '2026-10-01T01:01:00Z',
    body: `Codex Review: No findings.\n**Reviewed commit:** \`${HEAD}\``,
    ...options,
  };
}
const mutations = (calls) => calls.filter((args) => args.some((arg) => arg.includes('mutation')));
test('pending requests with no acknowledgement perform no cleanup calls', () => {
  const f = fixture();
  collapseReviewCommands(f.context, f.inputs);
  assert.equal(f.calls.length, 0);
});
test('only verified Codex bot eyes authorize collapse; human and unrelated reactions do not', () => {
  for (const reaction of [
    { content: 'eyes', user: { login: BOT.login, type: 'User' } },
    { content: 'eyes', user: { login: 'other[bot]', type: 'Bot' } },
    { content: '+1', user: BOT },
  ]) {
    const f = fixture({ eyes: 1, reactions: [reaction] });
    collapseReviewCommands(f.context, f.inputs);
    assert.equal(mutations(f.calls).length, 0);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture({ eyes: 1, reactions: [{ content: 'eyes', user: BOT }] });
  collapseReviewCommands(f.context, f.inputs);
  assert.equal(mutations(f.calls).length, 1);
  assert.equal(f.calls.length, 3);
  collapseReviewCommands(f.context, f.inputs);
  assert.equal(f.calls.length, 3);
});
test('explicit corresponding completion collapses the command and leaves findings visible', () => {
  const f = fixture({
    comments: [
      completion({ body: `Codex Review: Findings recorded.\n**Reviewed commit:** \`${HEAD}\`` }),
    ],
  });
  collapseReviewCommands(f.context, f.inputs);
  assert.equal(mutations(f.calls).length, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(f.inputs.comments[1].node_id, 'IC_findings');
  assert.ok(f.calls.every((args) => !args.includes('id=IC_findings')));
});
test('formal completed reviews qualify, while pending and unrelated results stay visible', () => {
  const review = {
    user: BOT,
    commit_id: HEAD,
    submitted_at: '2026-10-01T01:01:00Z',
    state: 'COMMENTED',
    body: '## Codex Review\nNo findings.',
  };
  const completed = fixture({ reviews: [review] });
  collapseReviewCommands(completed.context, completed.inputs);
  assert.equal(mutations(completed.calls).length, 1);
  for (const comments of [
    [completion({ user: { login: BOT.login, type: 'User' } })],
    [completion({ user: { login: 'other[bot]', type: 'Bot' } })],
    [
      completion({
        body: `Codex Review: No findings.\n**Reviewed commit:** \`${'b'.repeat(40)}\``,
      }),
    ],
    [completion({ created_at: '2026-10-01T00:00:00Z' })],
    [completion({ body: '## Codex Security Review\nNo findings.' })],
    [
      completion({
        body: `<!-- codex-pull-request-review-summary -->\n| **Code Review** | **Completed** <relative-time datetime="2026-10-01T01:01:00Z">done</relative-time> | \`${HEAD}\` |`,
      }),
    ],
  ]) {
    const f = fixture({ comments });
    collapseReviewCommands(f.context, f.inputs);
    assert.equal(f.calls.length, 0);
  }
  const pending = fixture({ reviews: [{ ...review, state: 'PENDING' }] });
  collapseReviewCommands(pending.context, pending.inputs);
  assert.equal(pending.calls.length, 0);
});
test('already-minimized commands cache that state and cosmetic failures never throw', () => {
  const f = fixture({ comments: [completion()], minimized: true });
  collapseReviewCommands(f.context, f.inputs);
  collapseReviewCommands(f.context, f.inputs);
  assert.equal(f.calls.length, 1);
  assert.equal(mutations(f.calls).length, 0);
  const failed = fixture({ comments: [completion()], fail: true });
  collapseReviewCommands(failed.context, failed.inputs);
  assert.equal(failed.warnings.length, 1);
});
test('cleanup proof: pending zero calls, acknowledgement three, completion two, repeat zero', () => {
  for (const [label, options, expected] of [
    ['pending', {}, 0],
    ['acknowledged', { eyes: 1, reactions: [{ content: 'eyes', user: BOT }] }, 3],
    ['completed', { comments: [completion()] }, 2],
  ]) {
    const times = [];
    let firstCalls;
    let repeatCalls;
    for (let sample = 0; sample < 50; sample += 1) {
      const f = fixture(options);
      const start = performance.now();
      collapseReviewCommands(f.context, f.inputs);
      times.push(performance.now() - start);
      firstCalls = f.calls.length;
      collapseReviewCommands(f.context, f.inputs);
      repeatCalls = f.calls.length - firstCalls;
      assert.equal(firstCalls, expected);
      assert.equal(repeatCalls, 0);
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        benchmark: 'review-command-cleanup',
        scenario: label,
        samples: 50,
        apiCalls: firstCalls,
        repeatWithinInvocation: repeatCalls,
        medianControllerMs: Number(times[25].toFixed(3)),
      })
    );
  }
});
