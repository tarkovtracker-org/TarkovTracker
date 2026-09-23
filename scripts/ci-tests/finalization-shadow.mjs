import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  authorizeShadowRequester,
  planShadow,
  recheckShadow,
  sealShadowArtifact,
  validateShadowOutput,
  validateShadowEvidence,
} from '../preview/finalization-shadow.mjs';
import { digestDirectory } from '../preview/manifest.mjs';
import { previewBuildEnv } from '../preview/profile.mjs';
import { jobBlock, permissionsBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const SHA = {
  head: 'a'.repeat(40),
  base: 'b'.repeat(40),
  merge: 'c'.repeat(40),
  tree: 'd'.repeat(40),
};
const repoName = 'tarkovtracker-org/TarkovTracker';
function evidence(paths = ['app/components/Task.vue']) {
  const pull = {
    number: 42,
    state: 'open',
    draft: false,
    base: { ref: 'main', sha: SHA.base, repo: { full_name: repoName } },
    head: { ref: 'change', sha: SHA.head, repo: { full_name: repoName } },
    merge_commit_sha: SHA.merge,
  };
  const run = {
    id: 123,
    run_attempt: 2,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: repoName },
    head_repository: { full_name: repoName },
    head_sha: SHA.head,
    head_branch: 'change',
    pull_requests: [
      { number: 42, base: { ref: 'main', sha: SHA.base }, head: { ref: 'change', sha: SHA.head } },
    ],
  };
  return {
    pull,
    run,
    commit: {
      sha: SHA.merge,
      commit: { tree: { sha: SHA.tree } },
      parents: [{ sha: SHA.base }, { sha: SHA.head }],
    },
    jobs: [
      {
        name: 'CI Result',
        run_id: 123,
        run_attempt: 2,
        head_sha: SHA.head,
        status: 'completed',
        conclusion: 'success',
      },
    ],
    paths,
    latestRuns: [run],
    repoName,
    number: 42,
    runId: 123,
  };
}
test('opt-in finalization selects only deployable revisions', () => {
  for (const paths of [
    ['app/components/Task.vue'],
    ['app/locales/fr.json'],
    ['supabase/migrations/example.sql'],
    ['workers/api-gateway/src/index.ts'],
    ['.github/workflows/ci.yml'],
    ['pnpm-lock.yaml'],
    ['README.md', 'app/components/Task.vue'],
    [],
  ]) {
    const decision = validateShadowEvidence(evidence(paths));
    assert.equal(decision.previewRequired, true, paths.join(','));
    assert.equal(decision.mergeSha, SHA.merge);
    assert.equal(decision.ciRunAttempt, 2);
  }
  assert.equal(
    validateShadowEvidence(evidence(['README.md', 'docs/guide.md'])).previewRequired,
    false
  );
});
test('draft, stale head/base/merge, rerun, and newer CI attempt fail closed', () => {
  const mutations = [
    (state) => {
      state.pull.draft = true;
    },
    (state) => {
      state.pull.state = 'closed';
    },
    (state) => {
      state.pull.base.sha = 'e'.repeat(40);
    },
    (state) => {
      state.pull.head.sha = 'e'.repeat(40);
    },
    (state) => {
      state.pull.merge_commit_sha = 'e'.repeat(40);
    },
    (state) => {
      state.run.run_attempt = 3;
    },
    (state) => {
      state.jobs[0].conclusion = 'failure';
    },
    (state) => {
      state.jobs[0].run_id = 122;
    },
    (state) => {
      state.jobs[0].head_sha = 'e'.repeat(40);
    },
    (state) => {
      state.run.path = '.github/workflows/forged.yml';
    },
    (state) => {
      state.run.pull_requests = [{ number: 99 }];
    },
    (state) => {
      state.run.pull_requests = [];
    },
    (state) => {
      state.run.pull_requests[0].base.sha = 'e'.repeat(40);
    },
    (state) => {
      state.latestRuns.push({ ...state.run, id: 124 });
    },
    (state) => {
      state.latestRuns.push({ ...state.run, id: 124, pull_requests: [] });
    },
  ];
  for (const mutate of mutations) {
    const state = evidence();
    mutate(state);
    assert.throws(() => validateShadowEvidence(state), /Finalization shadow refused/);
  }
});
test('fork identities are accepted without changing the build credential boundary', () => {
  const state = evidence(['app/locales/fr.json']);
  state.pull.head.repo.full_name = 'contributor/TarkovTracker';
  state.run.head_repository.full_name = 'contributor/TarkovTracker';
  assert.equal(validateShadowEvidence(state).fork, true);
  state.run.head_repository.full_name = 'other/TarkovTracker';
  assert.throws(() => validateShadowEvidence(state), /current head/);
});
test('only a maintain or admin actor can deliberately request shadow finalization', async () => {
  const context = {
    actor: 'maintainer',
    triggeringActor: 'maintainer',
    repo: { owner: 'tarkovtracker-org', repo: 'TarkovTracker' },
  };
  let role_name = 'maintain';
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({ username }) => ({
          data: { role_name: username === 'writer' ? 'write' : role_name },
        }),
      },
    },
  };
  await authorizeShadowRequester(github, context);
  role_name = 'admin';
  await authorizeShadowRequester(github, context);
  role_name = 'write';
  await assert.rejects(authorizeShadowRequester(github, context), /maintain or admin/);
  role_name = 'admin';
  context.triggeringActor = 'writer';
  await assert.rejects(authorizeShadowRequester(github, context), /maintain or admin/);
  context.triggeringActor = 'github-actions[bot]';
  await assert.rejects(authorizeShadowRequester(github, context), /maintainer must request/);
  context.triggeringActor = 'maintainer';
  context.actor = 'github-actions[bot]';
  await assert.rejects(authorizeShadowRequester(github, context), /maintainer must request/);
});
test('API planner and post-build recheck bind the same live revision', async () => {
  const state = evidence(['app/components/Task.vue']);
  const listJobsForWorkflowRunAttempt = () => {};
  const listFiles = () => {};
  const github = {
    rest: {
      pulls: { get: async () => ({ data: state.pull }), listFiles },
      actions: {
        getWorkflowRun: async () => ({ data: state.run }),
        listWorkflowRuns: async () => ({ data: { workflow_runs: state.latestRuns } }),
        listJobsForWorkflowRunAttempt,
      },
      repos: {
        getCommit: async () => ({ data: state.commit }),
        getCollaboratorPermissionLevel: async () => ({ data: { role_name: 'admin' } }),
      },
    },
    paginate: async (method) =>
      method === listFiles ? state.paths.map((filename) => ({ filename })) : state.jobs,
  };
  const context = {
    actor: 'maintainer',
    triggeringActor: 'maintainer',
    ref: 'refs/heads/main',
    repo: { owner: 'tarkovtracker-org', repo: 'TarkovTracker' },
  };
  const decision = await planShadow({
    github,
    context,
    inputs: { pull_request: '42', ci_run_id: '123' },
  });
  assert.equal(decision.mergeSha, SHA.merge);
  assert.deepEqual(await recheckShadow({ github, context, expected: decision }), decision);
  state.pull.base.sha = 'e'.repeat(40);
  await assert.rejects(recheckShadow({ github, context, expected: decision }), /base and head/);
});
test('a clean runner seals the exact shadow artifact and detects later content changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tt-shadow-manifest-'));
  try {
    writeFileSync(join(directory, 'index.html'), '<html>preview</html>');
    mkdirSync(join(directory, '_worker.js'));
    writeFileSync(join(directory, '_worker.js/index.js'), 'export default {};');
    const decision = validateShadowEvidence(evidence());
    const expected = {
      repository: repoName,
      pullRequest: 42,
      headSha: decision.headSha,
      baseSha: decision.baseSha,
      checkedOutSha: decision.mergeSha,
      treeSha: decision.treeSha,
      runId: 456,
      runAttempt: 1,
      previewBranch: decision.previewBranch,
      appUrl: decision.appUrl,
    };
    const manifest = sealShadowArtifact(directory, expected);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'preview-manifest.json'))), manifest);
    assert.equal(manifest.digest, digestDirectory(directory));
    writeFileSync(join(directory, 'index.html'), '<html>tampered</html>');
    assert.notEqual(manifest.digest, digestDirectory(directory));
    rmSync(join(directory, '_worker.js/index.js'));
    assert.throws(() => sealShadowArtifact(directory, expected), /missing Pages output/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('the host rejects hostile output before the upload action can read it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tt-shadow-raw-'));
  try {
    writeFileSync(join(directory, 'index.html'), '<html>preview</html>');
    assert.deepEqual(validateShadowOutput(directory), { entries: 1, bytes: 20 });
    symlinkSync('/etc/passwd', join(directory, 'leak'));
    assert.throws(() => validateShadowOutput(directory), /unsupported Pages output entry/);
    rmSync(join(directory, 'leak'));
    symlinkSync(directory, join(directory, 'dist-link'));
    assert.throws(() => validateShadowOutput(join(directory, 'dist-link')), /not a directory/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
function assertAnonymousBuildProfile(build, container) {
  for (const [key, value] of Object.entries(previewBuildEnv('preview-pr-42'))) {
    if (value === '') assert.match(container, new RegExp(`--env ${key}=`), key);
  }
  assert.match(build, /APP_URL: \$\{\{ fromJSON\(needs\.plan\.outputs\.decision\)\.appUrl \}\}/);
  assert.match(container, /--env "APP_URL=\$app_url"/);
  assert.match(container, /NODE_ENV=production corepack pnpm run build/);
  assert.match(container, /corepack pnpm install --frozen-lockfile/);
}
test('shadow workflow cannot deploy, publish statuses, or pass secrets to candidate code', () => {
  const workflow = readFileSync('.github/workflows/finalization-shadow.yml', 'utf8');
  const container = readFileSync('scripts/preview/shadow-container.sh', 'utf8');
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /group: finalization-shadow-pr-\$\{\{ inputs\.pull_request \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.equal(
    (workflow.match(/TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/g) ?? []).length,
    2
  );
  assert.match(
    workflow,
    /needs\.plan\.result == 'success' && fromJSON\(needs\.plan\.outputs\.decision\)\.previewRequired/
  );
  assert.match(workflow, /ref: \$\{\{ fromJSON\(needs\.plan\.outputs\.decision\)\.mergeSha \}\}/);
  assert.equal((workflow.match(/ref: \$\{\{ github\.sha \}\}/g) ?? []).length, 3);
  const build = workflowStep(jobBlock(workflow, 'build'), 'Build candidate in isolated container');
  assert.match(build, /shadow-container\.sh/);
  assert.match(build, /run: \|\n\s+bash .+\\\n\s+"\$GITHUB_WORKSPACE\/candidate"/);
  assert.match(jobBlock(workflow, 'build'), /Reject unsafe candidate output before host upload/);
  assert.match(jobBlock(workflow, 'build'), /validateShadowOutput\(process\.env\.DIST_DIR\)/);
  assertAnonymousBuildProfile(build, container);
  assert.match(container, /--mount "type=bind,source=\$candidate_dir,target=\/workspace"/);
  assert.match(container, /--read-only --tmpfs \/tmp/);
  assert.match(container, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(container, /node:24\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(container, /ACTIONS_RUNTIME_TOKEN|ACTIONS_CACHE_URL|docker\.sock/);
  assert.match(
    workflowStep(
      jobBlock(workflow, 'verify'),
      'Recheck revision and seal artifact in a separate trusted runner'
    ),
    /recheckShadow/
  );
  for (const job of ['plan', 'build', 'verify']) {
    assert.doesNotMatch(
      permissionsBlock(jobBlock(workflow, job), '    '),
      /statuses: write|contents: write|id-token: write/
    );
  }
  assert.doesNotMatch(
    workflow,
    /\$\{\{ secrets\.|wrangler pages deploy|createCommitStatus|publishStatus/
  );
  assert.match(workflow, /name: pages-preview-shadow/);
  assert.match(workflow, /name: pages-preview-shadow-output/);
  assert.doesNotMatch(workflow, /name: pages-preview\n/);
  assert.doesNotMatch(jobBlock(workflow, 'build'), /write-manifest|buildManifest/);
  assert.match(jobBlock(workflow, 'verify'), /sealShadowArtifact/);
  assert.match(jobBlock(workflow, 'verify'), /extractZip\(await downloadArtifact/);
  assert.match(jobBlock(workflow, 'verify'), /raw\.length !== 1 \|\| raw\[0\]\.expired/);
});
