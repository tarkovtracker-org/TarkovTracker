import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classifyState, parseArgs, runGuard } from './codex-review.mjs';
const head = '84671de39454b0fceb8eef1b2ae9cd3460bbf2fc';
const oldHead = '29ba60fa9c000000000000000000000000000000';
const now = Date.parse('2026-09-27T02:00:00Z');
const pull = (sha = head, extra = {}) => ({
  head: { sha },
  created_at: '2026-09-26T20:00:00Z',
  state: 'open',
  draft: false,
  ...extra,
});
const emptyInputs = (extra = {}) => ({
  pull: pull(),
  comments: [],
  resolvedShas: { '84671de': head, '84671de394': head, '29ba60fa9c': oldHead },
  reviews: [],
  requestedReviewers: { users: [] },
  intents: [],
  ...extra,
});
const request = (createdAt, sha = null, eyes = 0) => ({
  user: { login: 'DysektAI' },
  author_association: 'MEMBER',
  body: `@codex review${sha ? `\n\n<!-- codex-review-request:${sha} -->` : ''}`,
  created_at: createdAt,
  reactions: { eyes },
});
const cleanComment = (sha = '84671de394') => ({
  user: { login: 'chatgpt-codex-connector[bot]' },
  body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${sha}\``,
  created_at: '2026-09-27T01:12:54Z',
});
const summaryComment = (sha, status, datetime) => ({
  user: { login: 'chatgpt-codex-connector[bot]' },
  created_at: '2026-09-26T21:00:00Z',
  updated_at: '2026-09-27T01:59:00Z',
  body: `<!-- codex-pull-request-review-summary -->\n| Review | Status | Commit | Review trigger |\n| --- | --- | --- | --- |\n| 📝 **Code Review** | ✅ **${status}** <relative-time datetime="${datetime}">done</relative-time> | \`${sha}\` | Manual request |\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="2026-09-27T01:55:00Z">done</relative-time> | \`${sha}\` | Manual request |`,
});
function mockResponse(response, args) {
  if (response === undefined) throw new Error(`unexpected gh call: ${args.join(' ')}`);
  return typeof response === 'function' ? response(args) : response;
}
function withServerDate(response, args, serverNow = now) {
  if (!args.includes('--include')) return response;
  return `HTTP/2.0 200 OK\r\nDate: ${new Date(serverNow).toUTCString()}\r\n\r\n${response}`;
}
function mockGh(routes) {
  return (args) => {
    if (args.includes('--method')) {
      routes.post?.(args);
      return '{}';
    }
    return withServerDate(mockResponse(routes[args.at(-1)], args), args);
  };
}
function emptyApiRoutes({
  pullResponse = pull(),
  commentsResponse = '',
  reviewsResponse = '',
} = {}) {
  return {
    'repos/example/repo/pulls/44': JSON.stringify(pullResponse),
    'repos/example/repo/issues/44/comments': commentsResponse,
    'repos/example/repo/pulls/44/reviews': reviewsResponse,
    'repos/example/repo/pulls/44/requested_reviewers': JSON.stringify({ users: [] }),
    'repos/example/repo/commits/84671de394': JSON.stringify({ sha: head }),
  };
}
test('parses bounded CLI arguments and rejects invalid wait durations', () => {
  assert.deepEqual(
    parseArgs([
      '944',
      '--repo',
      'tarkovtracker-org/TarkovTracker',
      '--request',
      '--wait-seconds',
      '600',
    ]),
    {
      pr: 944,
      repo: 'tarkovtracker-org/TarkovTracker',
      request: true,
      waitSeconds: 600,
      collapseRequests: false,
    }
  );
  assert.throws(() => parseArgs(['944', '--wait-seconds', '-1']));
  assert.equal(parseArgs(['944', '--collapse-requests']).collapseRequests, true);
});
test('plain observation stays read-only and authorized cleanup leaves guard completion unchanged', async () => {
  const command = {
    ...request('2026-09-27T01:00:00Z', head),
    id: 1,
    node_id: 'IC_command',
    user: { login: 'DysektAI', type: 'User' },
  };
  const completed = {
    ...cleanComment(),
    user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
  };
  const routes = emptyApiRoutes({
    commentsResponse: [command, completed].map(JSON.stringify).join('\n'),
  });
  const root = mkdtempSync(join(tmpdir(), 'codex-collapse-observe-'));
  let mutations = 0;
  const ordinaryGh = mockGh(routes);
  const runGh = (args) => {
    if (!args.includes('graphql')) return ordinaryGh(args);
    if (args.some((arg) => arg.includes('mutation'))) {
      mutations += 1;
      return JSON.stringify({
        data: { minimizeComment: { minimizedComment: { isMinimized: true } } },
      });
    }
    return JSON.stringify({ data: { node: { isMinimized: false } } });
  };
  const deps = { runGh, gitCommonDir: root, now: () => now };
  try {
    const options = { pr: 44, repo: 'example/repo', waitSeconds: 0 };
    const plain = await runGuard(options, deps);
    assert.equal(mutations, 0);
    const cleaned = await runGuard({ ...options, collapseRequests: true }, deps);
    assert.deepEqual(cleaned, plain);
    assert.equal(mutations, 1);
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('recognizes the Code Review summary row and ignores security completion', () => {
  const state = classifyState(
    emptyInputs({ comments: [summaryComment('84671de', 'Completed', '2026-09-27T01:12:55Z')] }),
    now
  );
  assert.equal(state.status, 'complete');
  assert.equal(state.result, 'unknown');
});
test('clean result comments count as completion while security reports do not', () => {
  const security = {
    user: { login: 'chatgpt-codex-connector[bot]' },
    created_at: '2026-09-27T01:13:00Z',
    body: '### 🛡️ Codex Security Review\n\nNo security issues found.\n\n**Reviewed commit:** `84671de394`',
  };
  const inputs = emptyInputs({ comments: [security] });
  assert.equal(classifyState(inputs, now).status, 'unreviewed');
  assert.deepEqual(classifyState(emptyInputs({ comments: [cleanComment()] }), now), {
    status: 'complete',
    headSha: head,
    result: 'clean',
  });
});
test('formal Codex reviews scope to commit id and record findings separately', () => {
  const review = {
    user: { login: 'chatgpt-codex-connector[bot]' },
    commit_id: head,
    submitted_at: '2026-09-27T01:30:00Z',
    body: '### 💡 Codex Review\n\nConsider handling this error path.',
    state: 'COMMENTED',
  };
  assert.equal(classifyState(emptyInputs({ reviews: [review] }), now).result, 'findings');
  assert.equal(
    classifyState(emptyInputs({ reviews: [{ ...review, commit_id: oldHead }] }), now).status,
    'unreviewed'
  );
  assert.equal(
    classifyState(
      emptyInputs({ reviews: [{ ...review, state: 'PENDING', submitted_at: null }] }),
      now
    ).status,
    'pending'
  );
  assert.equal(
    classifyState(emptyInputs({ reviews: [{ ...review, submitted_at: null }] }), now).status,
    'unknown'
  );
});
test('unresolved requests block, while a matching later completion clears stale eyes', () => {
  assert.equal(
    classifyState(emptyInputs({ comments: [request('2026-09-27T01:10:00Z', null, 1)] }), now)
      .status,
    'pending'
  );
  assert.equal(
    classifyState(emptyInputs({ comments: [request('2026-09-27T01:10:00Z')] }), now).status,
    'pending'
  );
  const completed = cleanComment();
  assert.equal(
    classifyState(
      emptyInputs({ comments: [request('2026-09-27T01:10:00Z', null, 1), completed] }),
      now
    ).status,
    'complete'
  );
});
test('older SHA completion cannot retire a later SHA-marked request', () => {
  const newerRequest = request('2026-09-27T01:30:00Z', head, 1);
  const oldCompletion = {
    ...cleanComment(oldHead.slice(0, 10)),
    created_at: '2026-09-27T01:40:00Z',
  };
  assert.equal(
    classifyState(emptyInputs({ comments: [newerRequest, oldCompletion] }), now).status,
    'pending'
  );
});
test('summary security-row edits cannot make an older code result clear a newer request', () => {
  const oldSummary = summaryComment('84671de', 'Completed', '2026-09-27T01:00:00Z');
  const newerRequest = request('2026-09-27T01:30:00Z', head, 1);
  assert.equal(
    classifyState(emptyInputs({ comments: [oldSummary, newerRequest] }), now).status,
    'pending'
  );
});
test('running summaries on any head remain pending', () => {
  const running = summaryComment(oldHead.slice(0, 7), 'Running', '2026-09-27T01:40:00Z');
  assert.equal(classifyState(emptyInputs({ comments: [running] }), now).status, 'pending');
});
test('unknown Codex activity and newly created PR grace fail closed', () => {
  const unknown = {
    user: { login: 'chatgpt-codex-connector[bot]' },
    body: 'Codex review is temporarily unavailable.',
  };
  assert.equal(classifyState(emptyInputs({ comments: [unknown] }), now).status, 'unknown');
  assert.equal(
    classifyState(
      emptyInputs({ pull: pull(head, { created_at: new Date(now - 60_000).toISOString() }) }),
      now
    ).status,
    'pending'
  );
});
test('mixed-case repo retries find an ambiguous post intent without posting again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-guard-'));
  const stateRoot = join(root, 'codex-review-guard');
  const lock = join(stateRoot, 'request.lock');
  mkdirSync(lock, { recursive: true });
  const baseDeps = {
    gitCommonDir: root,
    now: () => now,
    runGh: mockGh(emptyApiRoutes()),
  };
  try {
    const blocked = await runGuard(
      { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
      baseDeps
    );
    assert.equal(blocked.status, 'pending');
    rmSync(lock, { recursive: true });
    let posts = 0;
    const failingDeps = {
      ...baseDeps,
      runGh: mockGh({
        ...emptyApiRoutes(),
        post: () => {
          posts += 1;
          throw new Error('simulated ambiguous network failure');
        },
      }),
    };
    await assert.rejects(
      runGuard({ pr: 44, repo: 'Example/Repo', request: true, waitSeconds: 0 }, failingDeps)
    );
    assert.equal(posts, 1);
    const canonicalIntentPath = join(stateRoot, 'intents', `example_repo-44-${head}.json`);
    const mixedCaseIntentPath = join(stateRoot, 'intents', `Example_Repo-44-${head}.json`);
    renameSync(canonicalIntentPath, mixedCaseIntentPath);
    const retry = await runGuard(
      { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
      failingDeps
    );
    assert.equal(retry.status, 'pending');
    assert.equal(posts, 1);
    const intentText = readFileSync(mixedCaseIntentPath, 'utf8');
    assert.equal(JSON.parse(intentText).sha, head);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('read-only inspection writes nothing and request waits for observed completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-wait-'));
  const args = { pr: 44, repo: 'example/repo', waitSeconds: 600 };
  let mockNow = now;
  const commonDeps = {
    gitCommonDir: root,
    now: () => mockNow,
    sleep: async (ms) => {
      mockNow += ms;
    },
  };
  let pullReads = 0;
  const readOnlyGh = mockGh(emptyApiRoutes());
  try {
    const readOnly = await runGuard(
      { ...args, waitSeconds: 0 },
      { ...commonDeps, runGh: readOnlyGh }
    );
    assert.equal(readOnly.status, 'unreviewed');
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
    let posted = false;
    let commentReads = 0;
    const requestRoutes = emptyApiRoutes();
    requestRoutes['repos/example/repo/pulls/44'] = () => {
      pullReads += 1;
      return JSON.stringify(pull());
    };
    requestRoutes['repos/example/repo/issues/44/comments'] = () => {
      commentReads += 1;
      return posted && commentReads > 3
        ? `${JSON.stringify({ ...cleanComment(), created_at: new Date(now + 31_000).toISOString() })}\n`
        : '';
    };
    requestRoutes.post = () => {
      posted = true;
    };
    const requestGh = mockGh(requestRoutes);
    const result = await runGuard({ ...args, request: true }, { ...commonDeps, runGh: requestGh });
    assert.equal(posted, true);
    assert.equal(pullReads, 8);
    assert.equal(commentReads, 4);
    assert.equal(result.status, 'complete');
    assert.equal(result.result, 'clean');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('request stabilization detects a changed head before posting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-head-'));
  let pullReads = 0;
  let posts = 0;
  const routes = emptyApiRoutes();
  routes['repos/example/repo/pulls/44'] = () => {
    pullReads += 1;
    return JSON.stringify(pull(pullReads === 1 ? head : oldHead));
  };
  routes.post = () => {
    posts += 1;
  };
  const runGh = mockGh(routes);
  try {
    const result = await runGuard(
      { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
      {
        gitCommonDir: root,
        now: () => now,
        runGh,
      }
    );
    assert.equal(result.status, 'unknown');
    assert.equal(posts, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('request snapshots fail closed when the base ref or SHA changes', async () => {
  const cases = [
    {
      label: 'base ref retarget',
      initial: { ref: 'main', sha: oldHead },
      refreshed: { ref: 'release', sha: oldHead },
    },
    {
      label: 'base SHA advance',
      initial: { ref: 'main', sha: oldHead },
      refreshed: { ref: 'main', sha: '39ba60fa9c000000000000000000000000000000' },
    },
  ];
  for (const scenario of cases) {
    const root = mkdtempSync(join(tmpdir(), 'codex-review-base-race-'));
    let pullReads = 0;
    let posts = 0;
    const routes = emptyApiRoutes({ commentsResponse: JSON.stringify(cleanComment()) });
    routes['repos/example/repo/pulls/44'] = () => {
      pullReads += 1;
      const base = pullReads === 1 ? scenario.initial : scenario.refreshed;
      return JSON.stringify(pull(head, { base }));
    };
    routes.post = () => {
      posts += 1;
    };
    try {
      const result = await runGuard(
        { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
        {
          gitCommonDir: root,
          now: () => now,
          runGh: mockGh(routes),
        }
      );
      assert.equal(result.status, 'unknown', scenario.label);
      assert.match(result.reason, /base changed/, scenario.label);
      assert.equal(posts, 0, scenario.label);
      assert.equal(existsSync(join(root, 'codex-review-guard')), false, scenario.label);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
test('GitHub read failure never reaches the post endpoint', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-api-error-'));
  let posts = 0;
  try {
    await assert.rejects(
      runGuard(
        { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
        {
          gitCommonDir: root,
          now: () => now,
          runGh: mockGh({
            post: () => {
              posts += 1;
            },
            'repos/example/repo/pulls/44': () => {
              throw new Error('API unavailable');
            },
          }),
        }
      ),
      /API unavailable/
    );
    assert.equal(posts, 0);
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('older unmatched requests cannot hide newer current-head requests or intents', () => {
  const oldRequest = request('2026-09-27T01:00:00Z', oldHead);
  const newRequest = request('2026-09-27T01:30:00Z', head);
  const comments = [oldRequest, cleanComment(), newRequest];
  assert.equal(classifyState(emptyInputs({ comments }), now).status, 'pending');
  const intents = [
    {
      sha: head,
      createdAt: Date.parse('2026-09-27T01:30:00Z'),
      requestedAt: Date.parse('2026-09-27T01:30:00Z'),
    },
  ];
  assert.equal(
    classifyState(emptyInputs({ comments: [cleanComment()], intents }), now).status,
    'pending'
  );
});
test('recent updates allow automatic review startup on older PRs', () => {
  const updated_at = new Date(now - 60_000).toISOString();
  assert.equal(
    classifyState(emptyInputs({ pull: pull(head, { updated_at }) }), now).status,
    'pending'
  );
});
test('read-only completion fails closed when the head changes during evidence collection', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-read-race-'));
  const routes = emptyApiRoutes({ commentsResponse: JSON.stringify(cleanComment()) });
  let reads = 0;
  routes['repos/example/repo/pulls/44'] = () =>
    JSON.stringify(pull(++reads === 1 ? head : oldHead));
  try {
    const state = await runGuard(
      { pr: 44, repo: 'example/repo', request: false, waitSeconds: 0 },
      { gitCommonDir: root, now: () => now, runGh: mockGh(routes) }
    );
    assert.equal(state.status, 'unknown');
    assert.equal(state.headSha, oldHead);
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('abbreviated review commits require GitHub resolution and ambiguity never posts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-sha-'));
  const options = { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 };
  let posts = 0;
  const routes = emptyApiRoutes({ commentsResponse: JSON.stringify(cleanComment()) });
  routes.post = () => {
    posts += 1;
  };
  try {
    const state = await runGuard(options, {
      gitCommonDir: root,
      now: () => now,
      runGh: mockGh(routes),
    });
    assert.equal(state.status, 'complete');
    assert.equal(posts, 0);
    routes['repos/example/repo/commits/84671de394'] = () => {
      throw new Error('GitHub ambiguous commit abbreviation');
    };
    await assert.rejects(
      runGuard(options, {
        gitCommonDir: root,
        now: () => now,
        runGh: mockGh(routes),
      }),
      /ambiguous commit/
    );
    assert.equal(posts, 0);
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('posting saves GitHub time while preserving intent before delivery', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-server-time-'));
  const serverTime = '2026-09-27T02:01:00Z';
  const intentPath = join(root, 'codex-review-guard', 'intents', `example_repo-44-${head}.json`);
  const routes = emptyApiRoutes();
  const runGh = (args) => {
    if (!args.includes('--method'))
      return withServerDate(mockResponse(routes[args.at(-1)], args), args);
    const before = JSON.parse(readFileSync(intentPath, 'utf8'));
    assert.equal(before.requestedAt, null);
    assert.equal(before.sha, head);
    return JSON.stringify({ created_at: serverTime, id: 123 });
  };
  try {
    await runGuard(
      { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
      {
        gitCommonDir: root,
        now: () => now + 3600_000,
        runGh,
      }
    );
    const saved = JSON.parse(readFileSync(intentPath, 'utf8'));
    assert.equal(saved.requestedAt, Date.parse(serverTime));
    assert.equal(saved.createdAt, now + 3600_000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('a draft transition during evidence reads cannot return successful completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-draft-race-'));
  const routes = emptyApiRoutes({ commentsResponse: JSON.stringify(cleanComment()) });
  let reads = 0;
  routes['repos/example/repo/pulls/44'] = () => JSON.stringify(pull(head, { draft: ++reads > 1 }));
  try {
    const state = await runGuard(
      { pr: 44, repo: 'example/repo', waitSeconds: 0 },
      {
        gitCommonDir: root,
        now: () => now,
        runGh: mockGh(routes),
      }
    );
    assert.equal(state.status, 'unknown');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('startup grace uses GitHub Date even when the local clock is ahead', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-grace-skew-'));
  const recentPull = pull(head, { updated_at: new Date(now - 30_000).toISOString() });
  const routes = emptyApiRoutes({ pullResponse: recentPull });
  let posts = 0;
  routes.post = () => {
    posts += 1;
  };
  try {
    const state = await runGuard(
      { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
      {
        gitCommonDir: root,
        now: () => now + 3600_000,
        runGh: mockGh(routes),
      }
    );
    assert.equal(state.status, 'pending');
    assert.match(state.reason, /grace period/);
    assert.equal(posts, 0);
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('expired startup grace uses GitHub Date even when the local clock is behind', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-grace-behind-'));
  const expiredPull = pull(head, { updated_at: new Date(now - 600_000).toISOString() });
  try {
    const state = await runGuard(
      { pr: 44, repo: 'example/repo', request: false, waitSeconds: 0 },
      {
        gitCommonDir: root,
        now: () => now - 3600_000,
        runGh: mockGh(emptyApiRoutes({ pullResponse: expiredPull })),
      }
    );
    assert.equal(state.status, 'unreviewed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('missing or invalid GitHub Date fails closed before requesting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-review-no-server-time-'));
  let posts = 0;
  const routes = emptyApiRoutes();
  const runGh = (args) => {
    if (args.includes('--method')) {
      posts += 1;
      return '{}';
    }
    return mockResponse(routes[args.at(-1)], args);
  };
  try {
    await assert.rejects(
      runGuard(
        { pr: 44, repo: 'example/repo', request: true, waitSeconds: 0 },
        {
          gitCommonDir: root,
          now: () => now,
          runGh,
        }
      ),
      /no valid server Date/
    );
    assert.equal(posts, 0);
    assert.equal(existsSync(join(root, 'codex-review-guard')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
