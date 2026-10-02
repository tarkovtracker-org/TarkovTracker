import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyState, evidenceShas } from './codex-review-state.mjs';
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
