import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyState, completedReviewRequests, evidenceShas } from './codex-review-state.mjs';
const head = '84671de39454b0fceb8eef1b2ae9cd3460bbf2fc';
const otherHead = '29ba60fa9c000000000000000000000000000000';
const now = Date.parse('2026-09-27T03:00:00Z');
const pull = (extra = {}) => ({
  head: { sha: head },
  created_at: '2026-09-26T20:00:00Z',
  updated_at: '2026-09-27T01:00:00Z',
  state: 'open',
  draft: false,
  ...extra,
});
const inputs = (extra = {}) => ({
  pull: pull(),
  comments: [],
  reviews: [],
  intents: [],
  requestedReviewers: { users: [] },
  ...extra,
});
const request = (createdAt, sha) => ({
  user: { login: 'DysektAI' },
  author_association: 'MEMBER',
  body: `@codex review${sha ? `\n<!-- codex-review-request:${sha} -->` : ''}`,
  created_at: createdAt,
});
const reviewComment = (sha, createdAt = '2026-09-27T02:00:00Z') => ({
  user: { login: 'chatgpt-codex-connector[bot]' },
  body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${sha}\``,
  created_at: createdAt,
});
const summary = (sha) => ({
  user: { login: 'chatgpt-codex-connector[bot]' },
  body: `<!-- codex-pull-request-review-summary -->\n| **Code Review** | ✅ **Completed** <relative-time datetime="2026-09-27T02:00:00Z">done</relative-time> | \`${sha}\` | Manual |`,
});
test('a newer summary never borrows an earlier explicit same-SHA result', () => {
  const clean = reviewComment(head, '2026-09-27T01:59:40Z');
  const requested = request('2026-09-27T01:59:50Z', head);
  const state = classifyState(inputs({ comments: [clean, requested, summary(head)] }), now);
  assert.equal(state.status, 'complete');
  assert.equal(state.result, 'unknown');
});
test('quoted security headings do not hide exact-head code-review completion', () => {
  const comment = reviewComment(head);
  comment.body +=
    '\n\nExample report:\n<!-- codex-security-review-finding:v1 -->\n### Codex Security Review\nNo security issues found.';
  const formal = {
    user: comment.user,
    state: 'COMMENTED',
    commit_id: head,
    submitted_at: comment.created_at,
    body: '### Codex Review\nNo findings.\n\nExample:\n### Codex Security Review',
  };
  assert.equal(classifyState(inputs({ comments: [comment] }), now).status, 'complete');
  assert.equal(classifyState(inputs({ reviews: [formal] }), now).status, 'complete');
});
test('top-level security report envelopes never establish code-review completion', () => {
  const comment = reviewComment(head.slice(0, 10));
  comment.body = `\n### 🛡️ Codex Security Review\n${comment.body}`;
  assert.deepEqual(evidenceShas([comment]), []);
  assert.equal(classifyState(inputs({ comments: [comment] }), now).status, 'unreviewed');
  comment.body = `<!-- codex-security-review-finding:v1 -->\n${comment.body}`;
  assert.deepEqual(evidenceShas([comment]), []);
  assert.equal(classifyState(inputs({ comments: [comment] }), now).status, 'unreviewed');
  assert.equal(
    classifyState(inputs({ comments: [comment, reviewComment(head)] }), now).status,
    'complete'
  );
});
test('untagged requests require a later completion for the exact current head', () => {
  const requested = request('2026-09-27T01:30:00Z');
  const olderHeadCompletion = reviewComment(otherHead, '2026-09-27T02:30:00Z');
  assert.equal(
    classifyState(inputs({ comments: [requested, olderHeadCompletion] }), now).status,
    'pending'
  );
  assert.equal(
    classifyState(inputs({ comments: [requested, reviewComment(head)] }), now).status,
    'complete'
  );
});
test('same-second completion finishes exact-SHA comment requests and confirmed intents', () => {
  const timestamp = '2026-09-27T02:00:00Z';
  const at = Date.parse(timestamp);
  const untagged = request(timestamp);
  const tagged = request(timestamp, head);
  const intent = { sha: head, createdAt: at - 1000, requestedAt: at };
  const completion = reviewComment(head, timestamp);
  for (const candidate of [untagged, tagged]) {
    assert.equal(
      classifyState(inputs({ comments: [candidate, completion] }), now).status,
      'complete'
    );
  }
  assert.equal(
    classifyState(inputs({ comments: [completion], intents: [intent] }), now).status,
    'complete'
  );
});
test('same-second completion for an old SHA cannot retire a current-head request', () => {
  const timestamp = '2026-09-27T02:00:00Z';
  const requested = request(timestamp, head);
  const oldCompletion = reviewComment(otherHead, timestamp);
  assert.equal(
    classifyState(inputs({ comments: [requested, oldCompletion] }), now).status,
    'pending'
  );
});
test('an older SHA-tagged request does not block the new head', () => {
  const requested = request('2026-09-27T01:30:00Z', otherHead);
  const oldCompletion = reviewComment(otherHead, '2026-09-27T02:00:00Z');
  assert.equal(
    classifyState(inputs({ comments: [requested, oldCompletion] }), now).status,
    'unreviewed'
  );
});
test('abbreviated request tags need resolution and are never treated as untagged', () => {
  const short = otherHead.slice(0, 10);
  const requested = request('2026-09-27T01:30:00Z', short);
  assert.deepEqual(evidenceShas([requested]), [short]);
  assert.equal(classifyState(inputs({ comments: [requested] }), now).status, 'unknown');
  assert.equal(
    classifyState(inputs({ comments: [requested], resolvedShas: { [short]: otherHead } }), now)
      .status,
    'unreviewed'
  );
});
test('local intent clock skew is ignored but a server request time is honored', () => {
  const completed = reviewComment(head, '2026-09-27T02:00:00Z');
  const localOnly = { sha: head, createdAt: Date.parse('2026-09-27T02:59:00Z') };
  const confirmedLater = { ...localOnly, requestedAt: Date.parse('2026-09-27T02:30:00Z') };
  const confirmedEarlier = { ...localOnly, requestedAt: Date.parse('2026-09-27T01:30:00Z') };
  assert.equal(
    classifyState(inputs({ comments: [completed], intents: [localOnly] }), now).status,
    'complete'
  );
  assert.equal(
    classifyState(inputs({ comments: [completed], intents: [confirmedLater] }), now).status,
    'pending'
  );
  assert.equal(
    classifyState(inputs({ comments: [completed], intents: [confirmedEarlier] }), now).status,
    'complete'
  );
});
test('abbreviated completion evidence requires a validated full SHA resolution', () => {
  const comment = reviewComment(head.slice(0, 10));
  assert.equal(classifyState(inputs({ comments: [comment] }), now).status, 'unknown');
  assert.equal(
    classifyState(inputs({ comments: [comment], resolvedShas: { [head.slice(0, 10)]: head } }), now)
      .status,
    'complete'
  );
  assert.equal(
    classifyState(
      inputs({ comments: [comment], resolvedShas: { [head.slice(0, 10)]: 'not-a-full-sha' } }),
      now
    ).status,
    'unknown'
  );
});
test('abbreviated SHA evidence is listed once and never matched as a prefix', () => {
  const short = head.slice(0, 10);
  const comments = [summary(short), reviewComment(short)];
  assert.deepEqual(evidenceShas(comments), [short]);
  assert.equal(
    classifyState(inputs({ comments, resolvedShas: { [short]: otherHead } }), now).status,
    'unreviewed'
  );
});
test('formal review commit ids must be full SHA values', () => {
  const review = {
    user: { login: 'chatgpt-codex-connector[bot]' },
    state: 'COMMENTED',
    commit_id: head.slice(0, 10),
    submitted_at: '2026-09-27T02:00:00Z',
    body: '### Codex Review\nNo findings.',
  };
  assert.equal(classifyState(inputs({ reviews: [review] }), now).status, 'unknown');
});
test('draft and closed pull requests cannot report review completion', () => {
  const comments = [reviewComment(head)];
  assert.equal(
    classifyState(inputs({ pull: pull({ draft: true }), comments }), now).status,
    'unknown'
  );
  assert.equal(
    classifyState(inputs({ pull: pull({ state: 'closed' }), comments }), now).status,
    'unknown'
  );
});
test('only a literal first-line review command is a request', () => {
  const timestamp = '2026-09-27T02:00:00Z';
  const examples = [
    {
      ...request(timestamp),
      body: `Please run this command:\n@codex review\n<!-- codex-review-request:${head.slice(0, 10)} -->`,
    },
    {
      ...request(timestamp),
      body: `\`\`\`text\n@codex review\n<!-- codex-review-request:${head.slice(0, 10)} -->\n\`\`\``,
    },
    {
      ...request(timestamp),
      body: `  @codex review\n<!-- codex-review-request:${head.slice(0, 10)} -->`,
    },
  ];
  for (const example of examples) {
    assert.equal(classifyState(inputs({ comments: [example] }), now).status, 'unreviewed');
  }
  assert.deepEqual(evidenceShas(examples), []);
  assert.equal(classifyState(inputs({ comments: [request(timestamp)] }), now).status, 'pending');
});
test('a genuine running Code Review summary remains pending', () => {
  const running = {
    user: { login: 'chatgpt-codex-connector[bot]' },
    created_at: '2026-09-27T02:00:00Z',
    body: `<!-- codex-pull-request-review-summary -->\n| **Code Review** | ⏳ **Running** <relative-time datetime="2026-09-27T02:00:00Z">now</relative-time> | \`${head}\` | Manual |`,
  };
  assert.equal(classifyState(inputs({ comments: [running] }), now).status, 'pending');
  assert.equal(
    classifyState(inputs({ comments: [running, reviewComment(head, '2026-09-27T02:00:00Z')] }), now)
      .status,
    'pending'
  );
  assert.equal(
    classifyState(inputs({ comments: [running, reviewComment(head, '2026-09-27T02:00:01Z')] }), now)
      .status,
    'complete'
  );
});
test('outsider request markers cannot override current-head completion or trigger SHA lookups', () => {
  const timestamp = '2026-09-27T02:30:00Z';
  const outsider = {
    ...request(timestamp),
    author_association: 'NONE',
    body: '@codex review\n<!-- codex-review-request:not-a-sha -->',
  };
  assert.equal(
    classifyState(inputs({ comments: [reviewComment(head), outsider] }), now).status,
    'complete'
  );
  assert.equal(classifyState(inputs({ comments: [outsider] }), now).status, 'unreviewed');
  assert.deepEqual(
    evidenceShas([{ ...outsider, body: request(timestamp, head.slice(0, 10)).body }]),
    []
  );
});
test('only trusted GitHub request associations can block coordination', () => {
  for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    const comment = { ...request('2026-09-27T02:00:00Z'), author_association: association };
    assert.equal(classifyState(inputs({ comments: [comment] }), now).status, 'pending');
  }
  for (const association of [
    'NONE',
    'CONTRIBUTOR',
    'FIRST_TIMER',
    'FIRST_TIME_CONTRIBUTOR',
    null,
  ]) {
    const comment = { ...request('2026-09-27T02:00:00Z'), author_association: association };
    assert.equal(classifyState(inputs({ comments: [comment] }), now).status, 'unreviewed');
  }
});
const refusedAt = '2026-09-27T02:00:01Z';
const limitReply = (extra = {}) => ({
  user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
  body: 'You have reached your Codex usage limits for code reviews.',
  created_at: refusedAt,
  updated_at: refusedAt,
  ...extra,
});
const limitedRequest = (sha = head, createdAt = '2026-09-27T02:00:00Z') => ({
  ...request(createdAt, sha),
  updated_at: createdAt,
});
test('usage-limit refusal ends the request without establishing completion on any head', () => {
  const comments = [limitedRequest(), limitReply()];
  assert.deepEqual(completedReviewRequests(inputs({ comments })), []);
  for (const sha of [head, otherHead]) {
    const state = classifyState(inputs({ pull: pull({ head: { sha } }), comments }), now);
    assert.equal(state.status, 'unavailable');
    assert.match(state.reason, /another provider or a human/);
    assert.equal(state.retryAt, undefined);
    assert.equal(state.result, undefined);
  }
});
test('refusals never expire; only explicit retry restores request eligibility', () => {
  const comments = [limitedRequest(), limitReply()];
  assert.equal(classifyState(inputs({ comments }), now + 10 * 86400000).status, 'unavailable');
  for (const sha of [head, otherHead]) {
    assert.equal(
      classifyState(
        inputs({ pull: pull({ head: { sha } }), comments, retryUnavailable: true }),
        now
      ).status,
      'unreviewed'
    );
  }
  const recent = pull({ updated_at: new Date(now - 1000).toISOString() });
  assert.equal(
    classifyState(inputs({ pull: recent, comments, retryUnavailable: true }), now).status,
    'pending'
  );
  comments.push(limitedRequest(head, '2026-09-27T02:30:00Z'));
  assert.equal(classifyState(inputs({ comments, retryUnavailable: true }), now).status, 'pending');
  const later = '2026-09-27T02:30:01Z';
  comments.push(limitReply({ created_at: later, updated_at: later }));
  assert.equal(classifyState(inputs({ comments }), now).status, 'unavailable');
});
test('a usage-limit refusal retires only the confirmed matching local intent', () => {
  const comments = [limitedRequest(), limitReply()];
  const intent = { sha: head, requestedAt: Date.parse('2026-09-27T02:00:00Z') };
  assert.equal(classifyState(inputs({ comments, intents: [intent] }), now).status, 'unavailable');
  for (const requestedAt of [null, intent.requestedAt + 1]) {
    assert.equal(
      classifyState(inputs({ comments, intents: [{ ...intent, requestedAt }] }), now).status,
      'pending'
    );
  }
});
test('a refusal cannot retire earlier unmatched requests or genuine pending formal reviews', () => {
  const comments = [limitedRequest(head, '2026-09-27T01:30:00Z'), limitedRequest(), limitReply()];
  assert.equal(classifyState(inputs({ comments }), now).status, 'pending');
  const reviews = [
    { user: { login: 'chatgpt-codex-connector[bot]' }, state: 'PENDING', commit_id: head },
  ];
  assert.equal(
    classifyState(inputs({ comments: comments.slice(1), reviews }), now).status,
    'pending'
  );
});
test('spoofed, edited, ambiguous and unrelated usage-limit evidence stays fail closed', () => {
  const replies = [
    limitReply({ user: { login: 'chatgpt-codex-connector[bot]', type: 'User' } }),
    limitReply({ updated_at: '2026-09-27T02:30:00Z' }),
    limitReply({ created_at: 'invalid', updated_at: 'invalid' }),
    limitReply({ created_at: '2026-09-27T02:00:00Z', updated_at: '2026-09-27T02:00:00Z' }),
    limitReply({ body: 'Example: You have reached your Codex usage limits for code reviews.' }),
  ];
  for (const reply of replies) {
    const state = classifyState(
      inputs({ comments: [limitedRequest(), reply] }),
      now + 2 * 86400000
    );
    assert.ok(['unknown', 'pending'].includes(state.status), JSON.stringify(reply));
    assert.equal(
      classifyState(
        inputs({ pull: pull({ head: { sha: otherHead } }), comments: [limitedRequest(), reply] }),
        now + 2 * 86400000
      ).status,
      'unknown'
    );
  }
  for (const comments of [
    [limitReply()],
    [limitedRequest(null), limitReply()],
    [{ ...limitedRequest(), updated_at: refusedAt }, limitReply()],
    [limitedRequest(), limitedRequest(), limitReply()],
  ]) {
    assert.ok(['unknown', 'pending'].includes(classifyState(inputs({ comments }), now).status));
  }
  const outsider = limitReply({ user: { login: 'outsider', type: 'Bot' } });
  assert.equal(
    classifyState(inputs({ comments: [limitedRequest(), outsider] }), now).status,
    'pending'
  );
});
test('exact-head completion after a refusal remains reusable', () => {
  const comments = [limitedRequest(), limitReply(), reviewComment(head, '2026-09-27T02:30:00Z')];
  assert.equal(classifyState(inputs({ comments }), now).status, 'complete');
});
test('a same-second newer request makes refusal correlation ambiguous', () => {
  const comments = [
    limitedRequest(head, '2026-09-27T01:00:00Z'),
    limitedRequest(head, refusedAt),
    limitReply(),
  ];
  assert.equal(classifyState(inputs({ comments }), now).status, 'pending');
  assert.equal(
    classifyState(inputs({ pull: pull({ head: { sha: otherHead } }), comments }), now).status,
    'unknown'
  );
});
test('overlapping requests for different heads cannot be retired by an unscoped refusal', () => {
  const earlier = limitedRequest(otherHead, '2026-09-27T01:30:00Z');
  const comments = [earlier, limitedRequest(), limitReply()];
  assert.equal(classifyState(inputs({ comments }), now).status, 'pending');
  assert.equal(classifyState(inputs({ comments }), now + 2 * 86400000).status, 'pending');
});
test('completed historical requests do not make a later refusal ambiguous', () => {
  const earlier = limitedRequest(otherHead, '2026-09-27T01:00:00Z');
  const done = reviewComment(otherHead, '2026-09-27T01:30:00Z');
  const comments = [limitReply(), done, limitedRequest(), earlier];
  assert.equal(classifyState(inputs({ comments }), now).status, 'unavailable');
});
test('explicit retry preserves unknown activity, pending reviews and unresolved intents', () => {
  const comments = [limitedRequest(), limitReply()];
  const cases = [
    { comments: [...comments, limitReply({ body: 'Unrecognized bot activity' })] },
    {
      reviews: [
        { user: { login: 'chatgpt-codex-connector[bot]' }, state: 'PENDING', commit_id: head },
      ],
    },
    { requestedReviewers: { users: [{ login: 'chatgpt-codex-connector[bot]' }] } },
    { intents: [{ sha: head, requestedAt: null }] },
  ];
  for (const extra of cases) {
    const state = classifyState(inputs({ comments, retryUnavailable: true, ...extra }), now);
    assert.ok(['pending', 'unknown'].includes(state.status));
  }
  const spoofed = limitReply({ user: { login: 'chatgpt-codex-connector[bot]', type: 'User' } });
  assert.equal(
    classifyState(inputs({ comments: [limitedRequest(), spoofed], retryUnavailable: true }), now)
      .status,
    'pending'
  );
});
test('a later completed review clears refusal on a new head without transferring completion', () => {
  const comments = [limitedRequest(), limitReply(), reviewComment(head, '2026-09-27T02:30:00Z')];
  const newPull = pull({ head: { sha: otherHead } });
  const state = classifyState(inputs({ pull: newPull, comments }), now);
  assert.equal(state.status, 'unreviewed');
  assert.equal(state.result, undefined);
  for (const [completedAt, expected] of [
    ['2026-09-27T02:00:00Z', 'unknown'],
    [refusedAt, 'unavailable'],
  ]) {
    const stale = [limitedRequest(), limitReply(), reviewComment(head, completedAt)];
    assert.equal(classifyState(inputs({ pull: newPull, comments: stale }), now).status, expected);
  }
  const later = '2026-09-27T02:45:01Z';
  comments.push(limitedRequest(otherHead, '2026-09-27T02:45:00Z'));
  comments.push(limitReply({ created_at: later, updated_at: later }));
  assert.equal(classifyState(inputs({ pull: newPull, comments }), now).status, 'unavailable');
});
