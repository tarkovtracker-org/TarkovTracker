import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { aggregateResults, fullJobs, reusedQueuePlan } from '../ci/validation-plan.mjs';
import {
  FULL_VALIDATION_JOBS,
  findQueueReuse,
  findQueueReuseOrFull,
  queuePullNumber,
  reportQueueReuse,
} from '../preview/queue-reuse.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
import { buildZip } from './helpers/zip.mjs';
const queueSha = 'a'.repeat(40);
const mainSha = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const prHead = 'd'.repeat(40);
const branch = `gh-readonly-queue/main/pr-7-${mainSha}`;
const repository = 'example/repo';
const server = 'https://github.com';
function runJobs(state, params) {
  assert.equal(params.attempt_number, state.runs[params.run_id].run_attempt);
  return state.jobs[params.run_id] ?? [];
}
function fixture() {
  const state = {
    queueRef: queueSha,
    main: mainSha,
    parent: mainSha,
    tree,
    pull: {
      number: 7,
      state: 'open',
      base: { ref: 'main' },
      head: { sha: prHead, ref: 'feature/example', repo: { full_name: repository } },
    },
    status: {
      context: 'Preview Result',
      state: 'success',
      target_url: `${server}/${repository}/actions/runs/500`,
    },
    runs: {
      500: {
        id: 500,
        run_attempt: 1,
        path: '.github/workflows/preview.yml',
        event: 'workflow_dispatch',
        head_branch: 'main',
        repository: { full_name: repository },
        head_repository: { full_name: repository },
        status: 'completed',
        conclusion: 'success',
      },
      400: {
        id: 400,
        run_attempt: 2,
        path: '.github/workflows/ci.yml',
        event: 'pull_request',
        head_sha: prHead,
        repository: { full_name: repository },
        head_repository: { full_name: repository },
        status: 'completed',
        conclusion: 'success',
      },
    },
    jobs: {
      500: [{ name: 'Publish preview result', conclusion: 'success' }],
      400: FULL_VALIDATION_JOBS.map((name) => ({ name, conclusion: 'success' })),
    },
    artifacts: [{ id: 9, name: `preview-deployment-${prHead}`, expired: false }],
    evidence: {
      headSha: prHead,
      treeSha: tree,
      pullRequest: 7,
      sourceCiRunId: 400,
      sourceCiAttempt: 2,
      url: 'https://example.pages.dev',
    },
    calls: [],
  };
  state.latestRuns = [state.runs[400]];
  const github = {
    rest: {
      git: {
        getRef: async ({ ref }) => ({
          data: { object: { sha: ref === 'heads/main' ? state.main : state.queueRef } },
        }),
        getCommit: async () => ({
          data: { tree: { sha: state.tree }, parents: [{ sha: state.parent }] },
        }),
      },
      pulls: {
        get: async ({ pull_number }) => {
          state.calls.push(['pull', pull_number]);
          return { data: state.pull };
        },
      },
      repos: { listCommitStatusesForRef: 'statuses' },
      actions: {
        getWorkflowRun: async ({ run_id }) => {
          const run = state.runs[run_id];
          if (!run) throw Object.assign(new Error('Not Found'), { status: 404 });
          return { data: run };
        },
        listJobsForWorkflowRunAttempt: 'jobs',
        listWorkflowRuns: async (params) => {
          assert.equal(params.workflow_id, 'ci.yml');
          assert.equal(params.head_sha, prHead);
          return { data: { workflow_runs: state.latestRuns } };
        },
        listWorkflowRunArtifacts: 'artifacts',
        downloadArtifact: async () => ({
          data: buildZip([
            { name: 'deployment-evidence.json', data: JSON.stringify(state.evidence) },
          ]),
        }),
      },
    },
    paginate: async (endpoint, params) => {
      const pages = {
        statuses: () => (state.status ? [{ id: 1, ...state.status }] : []),
        jobs: () => runJobs(state, params),
        artifacts: () => state.artifacts,
      };
      return pages[endpoint]();
    },
  };
  return {
    state,
    github,
    context: { serverUrl: server, repo: { owner: 'example', repo: 'repo' } },
    candidate: { headRepo: repository, headBranch: branch, headSha: queueSha },
  };
}
async function decide(f) {
  return findQueueReuse({ github: f.github, context: f.context, candidate: f.candidate });
}
test('an identical tree with full PR CI and a trusted deployed preview is reused', async () => {
  const f = fixture();
  assert.deepEqual(await decide(f), {
    reused: true,
    pullRequest: 7,
    headSha: prHead,
    treeSha: tree,
    baseSha: mainSha,
    ciRunId: 400,
    previewRunId: 500,
    previewUrl: 'https://example.pages.dev',
  });
});
test('queue branch names identify only canonical main queue members', () => {
  assert.equal(queuePullNumber(branch), 7);
  for (const name of [
    'gh-readonly-queue/main/pr-7-short',
    `gh-readonly-queue/other/pr-7-${mainSha}`,
    `gh-readonly-queue/main/pr-0-${mainSha}`,
    'main',
    undefined,
  ])
    assert.equal(queuePullNumber(name), null, String(name));
});
const rejected = {
  'queue tree differs from the preview tree': [
    /Queue tree differs/,
    (s) => (s.evidence.treeSha = 'e'.repeat(40)),
  ],
  'preview evidence predates tree recording': [
    /Queue tree differs/,
    (s) => delete s.evidence.treeSha,
  ],
  'evidence names another head': [
    /Queue tree differs/,
    (s) => (s.evidence.headSha = 'e'.repeat(40)),
  ],
  'evidence names another PR': [/Queue tree differs/, (s) => (s.evidence.pullRequest = 8)],
  'queue base is no longer main': [/no longer current main/, (s) => (s.main = 'e'.repeat(40))],
  'queue ref moved': [/Queue revision moved/, (s) => (s.queueRef = 'e'.repeat(40))],
  'PR is closed': [/ordinary PR/, (s) => (s.pull.state = 'closed')],
  'PR comes from a fork': [/ordinary PR/, (s) => (s.pull.head.repo.full_name = 'fork/repo')],
  'release version PRs keep their queue preview': [
    /ordinary PR/,
    (s) => (s.pull.head.ref = 'wip/release-1.2.3-9-1'),
  ],
  'newest preview failed': [/no current successful preview/, (s) => (s.status.state = 'failure')],
  'preview not applicable from another workflow': [
    /trusted preview workflow/,
    (s) => (s.status.target_url = `${server}/${repository}/actions/runs/400`),
  ],
  'status points outside this repository': [
    /does not point at a preview run/,
    (s) => (s.status.target_url = `${server}/other/repo/actions/runs/500`),
  ],
  'no preview status': [/no current successful preview/, (s) => (s.status = null)],
  'preview run unfinished': [
    /trusted preview workflow/,
    (s) => (s.runs[500].status = 'in_progress'),
  ],
  'preview result job missing': [/did not publish/, (s) => (s.jobs[500] = [])],
  'deployment evidence expired': [/evidence is missing/, (s) => (s.artifacts[0].expired = true)],
  'deployment evidence missing': [/evidence is missing/, (s) => (s.artifacts = [])],
  'source CI was reduced': [
    /did not run full validation: Type Check/,
    (s) => (s.jobs[400] = s.jobs[400].filter((job) => job.name !== 'Type Check')),
  ],
  'a source CI job failed': [
    /did not run full validation: Fallow audit/,
    (s) => (s.jobs[400][0].conclusion = 'failure'),
  ],
  'source CI was rerun after the preview': [
    /not the PR head run/,
    (s) => (s.runs[400].run_attempt = 3),
  ],
  'source CI is for another head': [
    /not the PR head run/,
    (s) => (s.runs[400].head_sha = 'e'.repeat(40)),
  ],
  'source CI is not PR CI': [
    /not the PR head run/,
    (s) => (s.runs[400].event = 'workflow_dispatch'),
  ],
  'a newer PR CI run exists for the head': [
    /newer PR CI run/,
    (s) => s.latestRuns.push({ ...s.runs[400], id: 401 }),
  ],
  'source CI run is gone': [/GitHub returned 404/, (s) => (s.evidence.sourceCiRunId = 401)],
};
for (const [name, [reason, mutate]] of Object.entries(rejected)) {
  test(`queue validates in full when ${name}`, async () => {
    const f = fixture();
    mutate(f.state);
    const result = await decide(f);
    assert.equal(result.reused, false);
    assert.match(result.reason, reason);
  });
}
test('unexpected API failures fail closed to full validation in the safe entry points', async () => {
  const f = fixture();
  f.github.rest.pulls.get = async () => {
    throw Object.assign(new Error('Server Error'), { status: 500 });
  };
  await assert.rejects(decide(f), /Server Error/);
  const warnings = [];
  const result = await findQueueReuseOrFull({
    github: f.github,
    context: f.context,
    candidate: f.candidate,
    warn: (message) => warnings.push(message),
  });
  assert.equal(result.reused, false);
  assert.match(warnings[0], /validating in full/);
});
test('the CI entry point reads the merge_group payload and reports a step output', async () => {
  const f = fixture();
  const outputs = {};
  const core = {
    setOutput: (key, value) => (outputs[key] = value),
    notice: () => {},
    info: () => {},
    warning: () => {},
  };
  const context = {
    ...f.context,
    payload: { merge_group: { head_ref: `refs/heads/${branch}`, head_sha: queueSha } },
  };
  await reportQueueReuse({ github: f.github, context, core });
  assert.equal(outputs.reused, 'true');
  f.state.evidence.treeSha = 'e'.repeat(40);
  await reportQueueReuse({ github: f.github, context, core });
  assert.equal(outputs.reused, 'false');
});
test('a reused queue plan runs only the always-selected jobs and still aggregates strictly', () => {
  const plan = reusedQueuePlan(['app/components/Example.vue']);
  assert.deepEqual(plan.jobs, ['lint-format', 'systems-drift', 'security']);
  assert.equal(plan.previewRequired, false);
  assert.equal(plan.reused, true);
  const needs = {
    changes: { result: 'success' },
    ...Object.fromEntries(
      fullJobs.map((job) => [job, { result: plan.jobs.includes(job) ? 'success' : 'skipped' }])
    ),
  };
  assert.deepEqual(aggregateResults(plan, needs), []);
  assert.notDeepEqual(aggregateResults(plan, { ...needs, security: { result: 'failure' } }), []);
});
test('full-validation job names match the CI workflow job names', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const jobs = {
    'Fallow audit': 'fallow',
    'Lint & Format': 'lint-format',
    'Type Check': 'typecheck',
    'Coverage thresholds': 'coverage',
    Validate: 'validate',
    'Supabase DB': 'supabase-db',
    'Systems drift check': 'systems-drift',
    Workers: 'workers',
    'CI Result': 'ci-result',
  };
  for (const name of FULL_VALIDATION_JOBS) {
    if (name.startsWith('Test (shard ')) continue;
    assert.match(jobBlock(ci, jobs[name]), new RegExp(`^ {4}name: ${name}$`, 'm'), name);
  }
  const test = jobBlock(ci, 'test');
  assert.match(
    test,
    /^ {4}name: Test \(shard \$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.total \}\}\)$/m
  );
  assert.match(test, /^ {8}shard: \[1, 2, 3, 4\]$/m);
  assert.match(test, /^ {8}total: \[4\]$/m);
  for (const shard of [1, 2, 3, 4])
    assert.ok(FULL_VALIDATION_JOBS.includes(`Test (shard ${shard}/4)`));
});
test('CI decides queue reuse with main code before the candidate classifier', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const changes = jobBlock(ci, 'changes');
  const checkout = workflowStep(changes, 'Checkout trusted queue reuse policy');
  assert.match(checkout, /if: github\.event_name == 'merge_group'/);
  assert.match(checkout, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(checkout, /path: \.trusted-main/);
  assert.match(checkout, /persist-credentials: false/);
  const reuse = workflowStep(changes, 'Reuse an identical validated PR tree');
  assert.match(reuse, /\.trusted-main\/scripts\/preview\/queue-reuse\.mjs/);
  const classify = workflowStep(changes, 'Classify changes');
  assert.match(classify, /QUEUE_REUSED: \$\{\{ steps\.reuse\.outputs\.reused \}\}/);
  assert.match(
    classify,
    /args\+=\(--queue\)\n\s+if \[ "\$QUEUE_REUSED" = "true" \]; then\n\s+args\+=\(--reused\)/
  );
  assert.doesNotMatch(changes, /: write/);
  assert.ok(changes.indexOf('Reuse an identical') < changes.indexOf('Classify changes'));
});
test('preview deployment evidence records the verified build identity', () => {
  const preview = readFileSync('.github/workflows/preview.yml', 'utf8');
  for (const output of ['tree_sha', 'source_ci_attempt', 'pull_request'])
    assert.match(preview, new RegExp(`core\\.setOutput\\('${output}', manifest\\.`));
  const verifier = readFileSync('scripts/preview/verify-deployment.mjs', 'utf8');
  for (const field of ['headSha', 'treeSha', 'pullRequest', 'sourceCiRunId', 'sourceCiAttempt'])
    assert.match(verifier, new RegExp(`\\b${field}:`));
});
