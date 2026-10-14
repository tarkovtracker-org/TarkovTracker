import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveProfileOutputs } from '../preview/build-profile.mjs';
import { queueRevision, requireQueueCi } from '../preview/merge-queue.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const branch = 'gh-readonly-queue/main/pr-1-example';
function fixture() {
  const state = {
    head,
    base,
    parent: base,
    tree,
    jobs: [
      {
        name: 'CI Result',
        run_id: 1,
        run_attempt: 2,
        head_sha: head,
        status: 'completed',
        conclusion: 'success',
      },
    ],
  };
  return {
    state,
    context: { repo: { owner: 'example', repo: 'repo' } },
    candidate: { headRepo: 'example/repo', headBranch: branch, headSha: head },
    github: {
      rest: {
        actions: { listJobsForWorkflowRunAttempt: 'jobs' },
        git: {
          getRef: async ({ owner, repo, ref }) => {
            assert.deepEqual({ owner, repo }, { owner: 'example', repo: 'repo' });
            assert.ok([`heads/${branch}`, 'heads/main'].includes(ref), ref);
            return { data: { object: { sha: ref === 'heads/main' ? state.base : state.head } } };
          },
          getCommit: async ({ owner, repo, commit_sha }) => {
            assert.deepEqual({ owner, repo }, { owner: 'example', repo: 'repo' });
            assert.equal(commit_sha, head);
            return { data: { tree: { sha: state.tree }, parents: [{ sha: state.parent }] } };
          },
        },
      },
      paginate: async (endpoint, params) => {
        assert.equal(endpoint, 'jobs');
        assert.deepEqual(params, {
          owner: 'example',
          repo: 'repo',
          run_id: 1,
          attempt_number: 2,
          per_page: 100,
        });
        return state.jobs;
      },
    },
  };
}
test('queue revisions bind repository, live queue ref, current main and tree', async () => {
  const f = fixture();
  assert.deepEqual(await queueRevision(f.github, f.context, f.candidate), {
    baseSha: base,
    treeSha: tree,
  });
  for (const change of [{ head: tree }, { parent: tree }, { base: tree }, { tree: '' }]) {
    const changed = fixture();
    Object.assign(changed.state, change);
    await assert.rejects(queueRevision(changed.github, changed.context, changed.candidate));
  }
  for (const change of [
    { headRepo: 'fork/repo' },
    { headBranch: 'main' },
    { headBranch: 'gh-readonly-queue/other/pr-1' },
  ])
    await assert.rejects(queueRevision(f.github, f.context, { ...f.candidate, ...change }));
});
test('queue CI requires exactly one successful job from the selected head and attempt', async () => {
  const f = fixture();
  const run = { id: 1, run_attempt: 2, head_sha: head };
  await requireQueueCi(f.github, f.context, run);
  for (const change of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { conclusion: 'skipped' },
    { status: 'in_progress' },
    { head_sha: tree },
    { run_attempt: 1 },
    { run_id: 2 },
  ]) {
    f.state.jobs = [{ ...fixture().state.jobs[0], ...change }];
    await assert.rejects(requireQueueCi(f.github, f.context, run));
  }
  for (const jobs of [[], [fixture().state.jobs[0], fixture().state.jobs[0]]]) {
    f.state.jobs = jobs;
    await assert.rejects(requireQueueCi(f.github, f.context, run));
  }
});
test('queue builds use anonymous preview settings, not production identifiers', () => {
  const result = resolveProfileOutputs({
    EVENT_NAME: 'merge_group',
    REF_NAME: branch,
    SUPABASE_URL: 'production',
    CODECOV_TOKEN: 'production',
  });
  assert.equal(result.decision.profile, 'preview');
  assert.equal(result.buildEnv.SUPABASE_URL, '');
  assert.equal(result.buildEnv.CODECOV_TOKEN, '');
});
test('queue workflow runs full validation and retains existing merge protections during rollout', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /merge_group:\n {4}types: \[checks_requested\]/);
  const classify = workflowStep(jobBlock(ci, 'changes'), 'Classify changes');
  assert.match(classify, /if \[ "\$EVENT_NAME" != "pull_request" \]; then args\+=\(--full\); fi/);
  assert.match(classify, /BASE_SHA:.*github.event.merge_group.base_sha/);
  assert.match(
    readFileSync('.github/workflows/preview-state.yml', 'utf8'),
    /github.event.workflow_run.event == 'merge_group'/
  );
  const staged = JSON.parse(readFileSync('.github/main-merge-queue-ruleset.json', 'utf8'));
  assert.equal(staged.enforcement, 'disabled');
  assert.deepEqual(staged.bypass_actors, []);
  assert.equal(staged.rules[1].parameters.grouping_strategy, 'ALLGREEN');
  assert.equal(staged.rules[1].parameters.max_entries_to_build, 1);
  assert.equal(staged.rules[2].type, 'pull_request');
  assert.equal(staged.rules[2].parameters.required_review_thread_resolution, true);
  assert.equal(staged.rules[2].parameters.required_approving_review_count, 0);
  assert.deepEqual(staged.rules[0].parameters.required_status_checks, [
    ...JSON.parse(readFileSync('.github/main-ci-ruleset.json', 'utf8')).rules[0].parameters
      .required_status_checks,
    { context: 'Review Admission', integration_id: 0 },
  ]);
});
