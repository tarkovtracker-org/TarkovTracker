import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PreviewRequestDenied, requestPreviewFromComment } from '../preview/comment-request.mjs';
import { PREVIEW_OPT_IN_START, readPreviewRequest } from '../preview/request-authorization.mjs';
const REPO = { owner: 'example', repo: 'tracker' };
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const RUN_ID = 123;
function fixture(options = {}) {
  const pull = {
    number: 42,
    state: 'open',
    draft: false,
    head: { sha: HEAD, ref: 'feature', repo: { full_name: 'example/tracker' } },
    base: { sha: BASE, ref: 'main' },
    merge_commit_sha: MERGE,
    ...options.pull,
  };
  const run = {
    id: RUN_ID,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    head_sha: HEAD,
    head_branch: 'feature',
    head_repository: { full_name: 'example/tracker' },
    status: 'completed',
    conclusion: 'success',
    pull_requests: [{ number: 42, head: { sha: HEAD }, base: { sha: BASE } }],
    ...options.run,
  };
  const check = {
    id: 789,
    app: { id: 15368 },
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    details_url: `https://github.com/example/tracker/actions/runs/${RUN_ID}/job/789`,
    ...options.check,
  };
  const calls = [];
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { role_name: options.role ?? 'maintain' },
        }),
      },
      pulls: {
        get: async () => ({ data: pull }),
        listFiles: 'files',
      },
      actions: {
        listWorkflowRuns: async () => ({
          data: { workflow_runs: [...(options.additionalRuns ?? []), run] },
        }),
        createWorkflowDispatch: async (input) => calls.push(input),
      },
      checks: { listForRef: 'checks' },
    },
    paginate: async (endpoint) => {
      if (endpoint === 'files') return options.files ?? [{ filename: 'app/a.ts' }];
      if (endpoint === 'checks') return [check];
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
  };
  const context = {
    eventName: 'issue_comment',
    actor: 'maintainer',
    repo: REPO,
    payload: {
      action: 'created',
      sender: { login: 'maintainer' },
      comment: comment(1),
      issue: { number: 42, pull_request: { url: 'https://api.github.com/pulls/42' } },
      ...options.payload,
    },
  };
  github.rest.issues = { listComments: 'comments' };
  const originalPaginate = github.paginate;
  github.paginate = async (endpoint, params) => {
    if (endpoint === 'comments') return options.comments ?? [context.payload.comment];
    return originalPaginate(endpoint, params);
  };
  return { github, context, calls };
}
test('maintainer command dispatches the current successful PR CI run without an id', async () => {
  const f = fixture();
  assert.deepEqual(await requestPreviewFromComment(f), {
    pullRequest: 42,
    headSha: HEAD,
    enabled: true,
    ciRunId: RUN_ID,
  });
  assert.deepEqual(f.calls, [
    {
      ...REPO,
      workflow_id: 'preview.yml',
      ref: 'main',
      inputs: { run_id: String(RUN_ID), request_comment_id: '1' },
    },
  ]);
});
test('only exact new PR comments from the actor may request a preview', async () => {
  for (const payload of [
    { action: 'edited' },
    { comment: { body: '/preview now' } },
    { issue: { number: 42 } },
  ]) {
    const f = fixture({ payload });
    assert.equal(await requestPreviewFromComment(f), null);
    assert.deepEqual(f.calls, []);
  }
  const forged = fixture({ payload: { sender: { login: 'someone-else' } } });
  await assert.rejects(requestPreviewFromComment(forged), /actor could not be authenticated/);
  assert.deepEqual(forged.calls, []);
});
test('non-maintainers, closed PRs and PRs without a deployable change cannot dispatch', async () => {
  for (const options of [
    { role: 'write' },
    { pull: { state: 'closed' } },
    { files: [{ filename: 'docs/guide.md' }] },
  ]) {
    const f = fixture(options);
    await assert.rejects(requestPreviewFromComment(f));
    assert.deepEqual(f.calls, []);
  }
});
test('unauthorized requests have a distinct denial for silent bot handling', async () => {
  const f = fixture({ role: 'write' });
  await assert.rejects(requestPreviewFromComment(f), PreviewRequestDenied);
  assert.deepEqual(f.calls, []);
});
test("same-head CI runs from another PR do not hide this PR's successful run", async () => {
  const f = fixture({
    additionalRuns: [
      {
        id: RUN_ID + 1,
        pull_requests: [{ number: 43, head: { sha: HEAD }, base: { sha: BASE } }],
      },
    ],
  });
  const request = await requestPreviewFromComment(f);
  assert.equal(request.ciRunId, RUN_ID);
  assert.equal(f.calls[0].inputs.run_id, String(RUN_ID));
});
test('a stale CI run, changed base, or unrelated CI Result waits for matching CI', async () => {
  for (const options of [
    { run: { conclusion: 'failure' } },
    { run: { pull_requests: [{ number: 42, head: { sha: HEAD }, base: { sha: MERGE } }] } },
    { check: { details_url: 'https://github.com/example/tracker/actions/runs/999/job/789' } },
    { check: { conclusion: 'failure' } },
  ]) {
    const f = fixture(options);
    assert.equal((await requestPreviewFromComment(f)).ciRunId, null);
    assert.deepEqual(f.calls, []);
  }
});
test('request workflow loads trusted code and does not trigger on edited comments', () => {
  const workflow = readFileSync('.github/workflows/preview-request.yml', 'utf8');
  assert.match(workflow, /issue_comment:\n\s+types: \[created\]/);
  assert.match(
    workflow,
    /contains\(fromJSON\('\["\/preview", "\/preview stop"\]'\), github\.event\.comment\.body\)/
  );
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /github\.rest\.issues\.createComment/);
  assert.match(workflow, /error instanceof PreviewRequestDenied/);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|head\.sha/);
});
test('fork commands select matching branch CI even when GitHub omits PR snapshots', async () => {
  const fork = { full_name: 'someone/tracker' };
  const f = fixture({
    pull: { head: { sha: HEAD, ref: 'fork-feature', repo: fork } },
    run: { head_repository: fork, head_branch: 'fork-feature', pull_requests: [] },
  });
  assert.equal((await requestPreviewFromComment(f)).ciRunId, RUN_ID);
  assert.equal(f.calls.length, 1);
  for (const mismatch of [
    { head_branch: 'other' },
    { head_repository: { full_name: 'another/tracker' } },
  ]) {
    const wrong = fixture({
      pull: { head: { sha: HEAD, ref: 'fork-feature', repo: fork } },
      run: { head_repository: fork, head_branch: 'fork-feature', pull_requests: [], ...mismatch },
    });
    assert.equal((await requestPreviewFromComment(wrong)).ciRunId, null);
    assert.deepEqual(wrong.calls, []);
  }
});
test('commands can opt in before CI completes and pause while the PR is a draft', async () => {
  for (const options of [
    { run: { status: 'in_progress', conclusion: null } },
    { pull: { draft: true } },
    { pull: { merge_commit_sha: null } },
  ]) {
    const f = fixture(options);
    const result = await requestPreviewFromComment(f);
    assert.equal(result.enabled, true);
    assert.equal(result.ciRunId, null);
    assert.deepEqual(f.calls, []);
  }
});
test('a maintainer can stop automatic previews without successful CI', async () => {
  const f = fixture({
    run: { status: 'in_progress', conclusion: null },
    payload: { comment: comment(1, '/preview stop') },
  });
  assert.equal((await requestPreviewFromComment(f)).enabled, false);
  assert.deepEqual(f.calls, []);
});
function comment(id, body = '/preview', overrides = {}) {
  return {
    id,
    body,
    user: { type: 'User', login: 'maintainer' },
    created_at: PREVIEW_OPT_IN_START,
    updated_at: PREVIEW_OPT_IN_START,
    ...overrides,
  };
}
function authorizationFixture(comments, role = 'maintain') {
  return {
    rest: {
      issues: { listComments: 'comments' },
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { role_name: role } }) },
    },
    paginate: async (endpoint, params) => {
      assert.equal(endpoint, 'comments');
      assert.equal(params.issue_number, 42);
      assert.equal(params.per_page, 100);
      return comments;
    },
  };
}
test('the latest authorized command controls persistent PR preview intent', async () => {
  const commands = [comment(1), comment(2, '/preview stop')];
  const github = authorizationFixture(commands);
  assert.deepEqual(await readPreviewRequest(github, REPO, 42), {
    commentId: 2,
    enabled: false,
    requestedBy: 'maintainer',
  });
  commands.push(comment(3));
  assert.equal((await readPreviewRequest(github, REPO, 42)).enabled, true);
});
test('edited, forged, bot and no-longer-authorized commands cannot grant access', async () => {
  const invalid = [
    comment(1, '/preview', { updated_at: '2026-09-26T00:01:00Z' }),
    comment(2, '/preview', { user: { login: 'bot', type: 'Bot' } }),
    comment(3, '/preview', { user: { login: 'ghost', type: 'User' } }),
    comment(4, '/preview please'),
    comment(5, '/preview', { created_at: 'invalid', updated_at: 'invalid' }),
    comment(6, '/preview', {
      created_at: '2026-09-25T00:00:00Z',
      updated_at: '2026-09-25T00:00:00Z',
    }),
  ];
  assert.equal(await readPreviewRequest(authorizationFixture(invalid), REPO, 42), null);
  for (const role of ['write', 'read', 'triage']) {
    assert.equal(
      await readPreviewRequest(authorizationFixture([comment(1)], role), REPO, 42),
      null
    );
  }
  const missing = authorizationFixture([comment(1)]);
  missing.rest.repos.getCollaboratorPermissionLevel = async () => {
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  assert.equal(await readPreviewRequest(missing, REPO, 42), null);
  missing.rest.repos.getCollaboratorPermissionLevel = async () => {
    throw Object.assign(new Error('API unavailable'), { status: 500 });
  };
  await assert.rejects(readPreviewRequest(missing, REPO, 42), /API unavailable/);
});
test('all comment pages are considered so a later stop revokes an older grant', async () => {
  const comments = [comment(1), ...Array.from({ length: 101 }, (_, i) => comment(i + 2, 'hello'))];
  comments.push(comment(104, '/preview stop'));
  assert.equal((await readPreviewRequest(authorizationFixture(comments), REPO, 42)).enabled, false);
});
test('a delayed request cannot dispatch after a newer stop command', async () => {
  const f = fixture({ comments: [comment(1), comment(2, '/preview stop')] });
  await assert.rejects(requestPreviewFromComment(f), /superseded/);
  assert.deepEqual(f.calls, []);
});
test('permission lookups are cached per author for one scan and refreshed on the next scan', async () => {
  const github = authorizationFixture(
    Array.from({ length: 150 }, (_, i) => comment(i + 1)),
    'write'
  );
  let calls = 0;
  github.rest.repos.getCollaboratorPermissionLevel = async () => {
    calls += 1;
    return { data: { role_name: 'write' } };
  };
  assert.equal(await readPreviewRequest(github, REPO, 42), null);
  assert.equal(calls, 1);
  assert.equal(await readPreviewRequest(github, REPO, 42), null);
  assert.equal(calls, 2);
});
