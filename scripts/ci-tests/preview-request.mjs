import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requestPreviewFromComment } from '../preview/comment-request.mjs';
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
    head: { sha: HEAD, repo: { full_name: 'example/tracker' } },
    base: { sha: BASE, ref: 'main' },
    merge_commit_sha: MERGE,
    ...options.pull,
  };
  const run = {
    id: RUN_ID,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    head_sha: HEAD,
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
        listWorkflowRuns: async () => ({ data: { workflow_runs: [run] } }),
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
      comment: { body: '/preview', user: { login: 'maintainer' } },
      issue: { number: 42, pull_request: { url: 'https://api.github.com/pulls/42' } },
      ...options.payload,
    },
  };
  return { github, context, calls };
}
test('maintainer command dispatches the current successful PR CI run without an id', async () => {
  const f = fixture();
  assert.deepEqual(await requestPreviewFromComment(f), {
    pullRequest: 42,
    headSha: HEAD,
    ciRunId: RUN_ID,
  });
  assert.deepEqual(f.calls, [
    {
      ...REPO,
      workflow_id: 'preview.yml',
      ref: 'main',
      inputs: { run_id: String(RUN_ID) },
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
test('non-maintainers, forks, and PRs without a deployable change cannot dispatch', async () => {
  for (const options of [
    { role: 'write' },
    { pull: { head: { sha: HEAD, repo: { full_name: 'someone/tracker' } } } },
    { pull: { draft: true } },
    { files: [{ filename: 'docs/guide.md' }] },
  ]) {
    const f = fixture(options);
    await assert.rejects(requestPreviewFromComment(f));
    assert.deepEqual(f.calls, []);
  }
});
test('a stale CI run, changed base, or unrelated CI Result cannot dispatch', async () => {
  for (const options of [
    { run: { conclusion: 'failure' } },
    { run: { pull_requests: [{ number: 42, head: { sha: HEAD }, base: { sha: MERGE } }] } },
    { check: { details_url: 'https://github.com/example/tracker/actions/runs/999/job/789' } },
    { check: { conclusion: 'failure' } },
  ]) {
    const f = fixture(options);
    await assert.rejects(requestPreviewFromComment(f), /successful, matching CI Result/);
    assert.deepEqual(f.calls, []);
  }
});
test('request workflow loads trusted code and does not trigger on edited comments', () => {
  const workflow = readFileSync('.github/workflows/preview-request.yml', 'utf8');
  assert.match(workflow, /issue_comment:\n\s+types: \[created\]/);
  assert.match(workflow, /github\.event\.comment\.body == '\/preview'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /github\.rest\.issues\.createComment/);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|head\.sha/);
});
