import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveProfileOutputs } from '../preview/build-profile.mjs';
import { queueRevision, requireQueueCi, queueRequiresPreview } from '../preview/merge-queue.mjs';
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
test('queue workflow selects proven documentation and retains existing merge protections', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /merge_group:\n {4}types: \[checks_requested\]/);
  const classify = workflowStep(jobBlock(ci, 'changes'), 'Classify changes');
  assert.match(classify, /if \[ "\$EVENT_NAME" = "merge_group" \]; then\n\s+args\+=\(--queue\)/);
  assert.match(classify, /elif \[ "\$EVENT_NAME" != "pull_request" \]; then\n\s+args\+=\(--full\)/);
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
function comparison(files) {
  return {
    status: 'ahead',
    ahead_by: 1,
    behind_by: 0,
    total_commits: 1,
    base_commit: { sha: base },
    merge_base_commit: { sha: base },
    commits: [{ sha: head, parents: [{ sha: base }] }],
    files,
  };
}
test('trusted queue preview uses the full authenticated integration comparison, including renamed and deleted paths', async () => {
  const f = fixture();
  const revision = { baseSha: base, treeSha: tree };
  let data;
  f.github.rest.repos = {
    compareCommits: async (params) => {
      assert.deepEqual(params, {
        owner: 'example',
        repo: 'repo',
        base,
        head,
        per_page: 100,
        page: 1,
      });
      return { data };
    },
  };
  for (const files of [
    [{ filename: 'docs/a.md', status: 'added' }],
    [{ filename: 'docs/deleted.md', status: 'removed' }],
    [{ filename: 'docs/new.md', previous_filename: 'docs/old.md', status: 'renamed' }],
    [{ filename: '.github/workflows/crowdin.yml', status: 'modified' }],
    [{ filename: 'scripts/ci/review-admission.mjs', status: 'modified' }],
  ]) {
    data = comparison(files);
    assert.equal(await queueRequiresPreview(f.github, f.context, f.candidate, revision), false);
  }
  const docs = [{ filename: 'docs/a.md', status: 'modified' }];
  const invalid = [
    comparison([]),
    comparison([...docs, { filename: 'app/a.ts', status: 'modified' }]),
    comparison([{ filename: 'docs/a.md', previous_filename: 'app/a.ts', status: 'renamed' }]),
    comparison([
      { filename: 'docs/a.md', previous_filename: '.github/workflows/ci.yml', status: 'copied' },
    ]),
    comparison([
      {
        filename: '.github/workflows/crowdin.yml',
        previous_filename: '.github/workflows/preview.yml',
        status: 'renamed',
      },
    ]),
    comparison([{ filename: '.github/workflows/ci.yml', status: 'modified' }]),
    comparison([{ filename: 'docs/new.md', status: 'renamed' }]),
    comparison([{ filename: 'docs/a.md', status: 'unknown' }]),
    comparison(
      Array.from({ length: 300 }, (_, i) => ({ filename: `docs/${i}.md`, status: 'added' }))
    ),
    { ...comparison(docs), commits: [{ sha: tree, parents: [{ sha: base }] }] },
    { ...comparison(docs), base_commit: { sha: tree } },
    { ...comparison(docs), merge_base_commit: { sha: tree } },
    { ...comparison(docs), status: 'diverged' },
    { ...comparison(docs), ahead_by: 2 },
    { ...comparison(docs), behind_by: 1 },
    { ...comparison(docs), commits: [] },
    { ...comparison(docs), commits: [...comparison(docs).commits, ...comparison(docs).commits] },
    { ...comparison(docs), commits: [{ sha: head, parents: [] }] },
    { ...comparison(docs), commits: [{ sha: head, parents: [{ sha: tree }] }] },
    { ...comparison(docs), commits: [{ sha: head, parents: [{ sha: base }, { sha: tree }] }] },
    { ...comparison(docs), commits: [null] },
    comparison([null]),
    null,
    { ...comparison(docs), total_commits: 2 },
    { ...comparison(docs), files: undefined },
  ];
  for (data of invalid)
    assert.equal(await queueRequiresPreview(f.github, f.context, f.candidate, revision), true);
  f.github.rest.repos.compareCommits = async () => {
    throw new Error('comparison unavailable');
  };
  await assert.rejects(
    queueRequiresPreview(f.github, f.context, f.candidate, revision),
    /comparison unavailable/
  );
  for (const status of [404, 422]) {
    f.github.rest.repos.compareCommits = async () => {
      throw Object.assign(new Error('missing comparison'), { status });
    };
    await assert.rejects(
      queueRequiresPreview(f.github, f.context, f.candidate, revision),
      /Queue comparison is no longer available/
    );
  }
});
