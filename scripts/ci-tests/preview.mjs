import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { extractZip, listZipEntries, zipEntryErrors } from '../preview/archive.mjs';
import {
  ENVIRONMENTS,
  fallbackHead,
  planPreview,
  publishControllerFailure,
  publishResult,
  successMarker,
  verifyForDeploy,
  verifyManifest,
} from '../preview/controller.mjs';
import { resolveProfileOutputs } from '../preview/build-profile.mjs';
import { deploymentRecordErrors, parseWranglerOutput } from '../preview/deployment.mjs';
import { buildManifest, digestDirectory, manifestShapeErrors } from '../preview/manifest.mjs';
import {
  ARTIFACT_NAME,
  MANIFEST_FILE,
  PAGES_DOMAIN,
  PREVIEW_PROFILE_VERSION,
  isValidPreviewBranch,
  previewAppUrl,
  previewBranchName,
  previewBuildEnv,
  resolveBuildProfile,
} from '../preview/profile.mjs';
import { isForbiddenRequest, waitForDeployment } from '../preview/smoke/readiness.mjs';
import { buildZip } from './helpers/zip.mjs';
const sha = (letter) => letter.repeat(40);
const HEAD = sha('a');
const BASE = sha('b');
const MERGE = sha('c');
const TREE = sha('d');
const REPO = { owner: 'tarkovtracker-org', repo: 'TarkovTracker' };
const REPO_NAME = 'tarkovtracker-org/TarkovTracker';
const FORK_NAME = 'someone/TarkovTracker';
function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'preview-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
/* ------------------------------------------------------------------------------------------ */
/* Profile                                                                                     */
/* ------------------------------------------------------------------------------------------ */
test('preview branch names are deterministic, alias-safe and never the production branch', () => {
  assert.equal(previewBranchName({ pullRequest: 123 }), 'preview-pr-123');
  const staging = previewBranchName({ branch: 'wip/release-1.80.2-1234567890-1' });
  assert.ok(isValidPreviewBranch(staging), staging);
  assert.ok(staging.length <= 28);
  assert.equal(staging, previewBranchName({ branch: 'wip/release-1.80.2-1234567890-1' }));
  assert.notEqual(staging, previewBranchName({ branch: 'wip/release-1.80.2-1234567890-2' }));
  assert.equal(previewBranchName({ branch: 'locales' }), previewBranchName({ branch: 'locales' }));
  assert.throws(() => previewBranchName({ branch: 'main' }), /non-production/);
  assert.throws(() => previewBranchName({}), /non-production/);
  for (const bad of ['main', 'preview-', 'Preview-PR-1', 'pr-1', 'preview-' + 'x'.repeat(30), ''])
    assert.equal(isValidPreviewBranch(bad), false, bad);
  assert.equal(previewAppUrl('preview-pr-7'), `https://preview-pr-7.${PAGES_DOMAIN}`);
  assert.throws(() => previewAppUrl('main'));
});
test('build profiles keep production for main and use anonymous settings elsewhere', () => {
  assert.deepEqual(resolveBuildProfile({ eventName: 'push', refName: 'main' }), {
    profile: 'production',
  });
  assert.deepEqual(resolveBuildProfile({ eventName: 'workflow_dispatch', refName: 'main' }), {
    profile: 'production',
  });
  const pr = resolveBuildProfile({ eventName: 'pull_request', pullRequest: '42' });
  assert.equal(pr.profile, 'preview');
  assert.equal(pr.previewBranch, 'preview-pr-42');
  assert.equal(pr.appUrl, `https://preview-pr-42.${PAGES_DOMAIN}`);
  const staging = resolveBuildProfile({
    eventName: 'workflow_dispatch',
    refName: 'wip/release-1.2.3-1-1',
  });
  assert.equal(staging.profile, 'preview');
  assert.ok(staging.previewBranch.startsWith('preview-wip-release'));
  const env = previewBuildEnv('preview-pr-42');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.CI, 'true');
  assert.equal(env.APP_URL, `https://preview-pr-42.${PAGES_DOMAIN}`);
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'NUXT_SUPABASE_SERVICE_KEY',
    'GA_MEASUREMENT_ID',
    'CLARITY_PROJECT_ID',
    'NUXT_PUBLIC_CLIENT_LOG_SINK_URL',
    'NUXT_LOG_SINK_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_SCAV_MONTHLY',
    'STRIPE_PRICE_CHAD_YEARLY',
    'NUXT_PUBLIC_TURNSTILE_SITE_KEY',
    'NUXT_TURNSTILE_SECRET_KEY',
  ])
    assert.equal(env[key], '', key);
  assert.throws(() => previewBuildEnv('main'));
});
test('the Validate profile step passes production inputs through and clears them for previews', () => {
  const inputs = {
    CLARITY_PROJECT_ID: 'clarity',
    GA_MEASUREMENT_ID: 'G-TEST',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    CODECOV_TOKEN: 'codecov',
  };
  const production = resolveProfileOutputs({ ...inputs, EVENT_NAME: 'push', REF_NAME: 'main' });
  assert.equal(production.decision.profile, 'production');
  assert.equal(production.buildEnv.APP_URL, 'https://tarkovtracker.org');
  assert.equal(production.buildEnv.SUPABASE_URL, inputs.SUPABASE_URL);
  assert.equal(production.buildEnv.GA_MEASUREMENT_ID, 'G-TEST');
  const preview = resolveProfileOutputs({ ...inputs, EVENT_NAME: 'pull_request', PR_NUMBER: '7' });
  assert.equal(preview.decision.profile, 'preview');
  assert.equal(preview.buildEnv.APP_URL, `https://preview-pr-7.${PAGES_DOMAIN}`);
  for (const key of Object.keys(inputs)) assert.equal(preview.buildEnv[key], '', key);
  const staging = resolveProfileOutputs({
    ...inputs,
    EVENT_NAME: 'workflow_dispatch',
    REF_NAME: 'wip/release-1.2.3-1-1',
  });
  assert.equal(staging.decision.profile, 'preview');
  assert.equal(staging.buildEnv.SUPABASE_ANON_KEY, '');
  assert.throws(() => resolveProfileOutputs({ EVENT_NAME: 'pull_request', PR_NUMBER: '' }));
});
/* ------------------------------------------------------------------------------------------ */
/* Archive                                                                                     */
/* ------------------------------------------------------------------------------------------ */
test('archive extraction accepts regular files and rejects every unsafe entry shape', (t) => {
  const dir = tempDir(t);
  const good = buildZip([
    { name: 'dist/' },
    { name: 'dist/index.html', data: '<html></html>', method: 8 },
    { name: 'dist/_nuxt/app.js', data: 'console.log(1)' },
  ]);
  assert.equal(extractZip(good, dir), 3);
  assert.equal(readFileSync(join(dir, 'dist/index.html'), 'utf8'), '<html></html>');
  const cases = [
    [{ name: 'link', data: 'target', mode: 0o120777 }, /symbolic link/],
    [{ name: '../escape.txt', data: 'x' }, /traversal/],
    [{ name: 'dist/../../escape.txt', data: 'x' }, /traversal/],
    [{ name: '/abs.txt', data: 'x' }, /absolute/],
    [{ name: 'dist\\win.txt', data: 'x' }, /malformed/],
    [{ name: 'dist/./dot.txt', data: 'x' }, /traversal/],
    [{ name: 'dist/fifo', data: '', mode: 0o010644 }, /special file/],
    [{ name: 'dist/enc.txt', data: 'x', flags: 1 }, /encrypted/],
    [{ name: 'dist/bad.txt', data: 'x', method: 12 }, /unsupported compression/],
  ];
  for (const [entry, pattern] of cases) {
    const archive = buildZip([entry]);
    assert.ok(zipEntryErrors(listZipEntries(archive)).length, entry.name);
    assert.throws(() => extractZip(archive, tempDir(t)), pattern, entry.name);
  }
  const duplicate = buildZip([
    { name: 'a.txt', data: '1' },
    { name: 'a.txt', data: '2' },
  ]);
  assert.throws(() => extractZip(duplicate, tempDir(t)), /duplicate/);
  const corrupt = buildZip([{ name: 'a.txt', data: 'payload', crc: 1 }]);
  assert.throws(() => extractZip(corrupt, tempDir(t)), /checksum/);
  assert.throws(() => extractZip(Buffer.from('not a zip'), tempDir(t)), /central directory/);
});
/* ------------------------------------------------------------------------------------------ */
/* Manifest                                                                                    */
/* ------------------------------------------------------------------------------------------ */
function writeDist(dir, files = { 'index.html': '<html>ok</html>', '_nuxt/app.js': 'x' }) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}
function manifestFor(dir, overrides = {}) {
  return buildManifest({
    repository: REPO_NAME,
    pullRequest: 42,
    headSha: HEAD,
    baseSha: BASE,
    checkedOutSha: MERGE,
    treeSha: TREE,
    runId: 900,
    runAttempt: 1,
    previewBranch: 'preview-pr-42',
    appUrl: previewAppUrl('preview-pr-42'),
    digest: digestDirectory(dir),
    ...overrides,
  });
}
test('digest excludes the manifest, rejects symlinks and the manifest shape is validated', (t) => {
  const dir = tempDir(t);
  writeDist(dir);
  const digest = digestDirectory(dir);
  writeFileSync(join(dir, MANIFEST_FILE), '{}');
  assert.equal(digestDirectory(dir), digest);
  writeFileSync(join(dir, '_nuxt/app.js'), 'changed');
  assert.notEqual(digestDirectory(dir), digest);
  symlinkSync('index.html', join(dir, 'link.html'));
  assert.throws(() => digestDirectory(dir), /Symbolic link/);
  rmSync(join(dir, 'link.html'));
  const manifest = manifestFor(dir);
  assert.deepEqual(manifestShapeErrors(manifest), []);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.buildProfileVersion, PREVIEW_PROFILE_VERSION);
  for (const [field, value, pattern] of [
    ['version', 2, /version/],
    ['profile', 'production', /not a preview/],
    ['buildProfileVersion', 99, /profile version/],
    ['headSha', 'short', /headSha/],
    ['baseSha', 'nope', /baseSha/],
    ['digest', 'abc', /digest/],
    ['previewBranch', 'main', /preview branch/],
    ['appUrl', 'https://tarkovtracker.org', /appUrl/],
    ['pullRequest', 'x', /pullRequest/],
    ['runAttempt', '1', /run identity/],
  ]) {
    assert.ok(
      manifestShapeErrors({ ...manifest, [field]: value }).some((error) => pattern.test(error)),
      field
    );
  }
  assert.deepEqual(manifestShapeErrors({ ...manifest, pullRequest: null, baseSha: null }), []);
});
/* ------------------------------------------------------------------------------------------ */
/* Fake GitHub                                                                                 */
/* ------------------------------------------------------------------------------------------ */
function pullFixture(overrides = {}) {
  return {
    number: 42,
    state: 'open',
    draft: false,
    head: { sha: HEAD, ref: 'feature', repo: { full_name: REPO_NAME } },
    base: { sha: BASE, ref: 'main' },
    merge_commit_sha: MERGE,
    ...overrides,
  };
}
function runFixture(overrides = {}) {
  return {
    id: 900,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: HEAD,
    head_branch: 'feature',
    head_repository: { full_name: REPO_NAME },
    head_tree_id: TREE,
    run_attempt: 1,
    updated_at: new Date(Date.now() - 120000).toISOString(),
    pull_requests: [{ number: 42 }],
    ...overrides,
  };
}
function fakeCheck() {
  return {
    id: 1,
    app: { id: 15368 },
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
  };
}
function fakeState(options) {
  const state = fakeMutableState(options);
  state.check = fakeCheck();
  state.dispatchStatus = { id: 5, context: 'CI Result', state: 'success' };
  state.archive = null;
  state.statuses = [];
  return state;
}
function firstOption(value, fallback) {
  return value !== undefined ? value : fallback;
}
function fakeMutableState(options) {
  return {
    pull: pullFixture(options.pull),
    run: runFixture(options.run),
    previewStatuses: firstOption(options.previewStatuses, []),
    files: firstOption(options.files, [{ filename: 'app/a.ts' }]),
    artifacts: firstOption(options.artifacts, [{ id: 77, name: ARTIFACT_NAME, expired: false }]),
    failPublish: firstOption(options.failPublish, false),
  };
}
/** In-memory GitHub API with recorded status writes and mutable evidence. */
function fakeGithub(t, options = {}) {
  const dir = tempDir(t);
  writeDist(dir);
  const manifest = manifestFor(dir, options.manifest);
  const state = fakeState(options);
  const zipEntries = () => [
    { name: 'index.html', data: readFileSync(join(dir, 'index.html')) },
    { name: '_nuxt/app.js', data: readFileSync(join(dir, '_nuxt/app.js')), method: 8 },
    { name: MANIFEST_FILE, data: JSON.stringify(options.rawManifest ?? manifest) },
  ];
  const rest = {
    pulls: pullEndpoints(state),
    ...repoEndpoints(state),
    ...actionEndpoints(state, zipEntries, options),
  };
  const paginate = (endpoint, params) => paginatedEndpoints(state, endpoint, params, options);
  return { github: { rest, paginate }, state, manifest, dir };
}
function pullEndpoints(state) {
  return {
    get: async () => ({ data: state.pull }),
    listFiles: 'listFiles',
  };
}
function repoEndpoints(state) {
  return {
    repos: {
      listPullRequestsAssociatedWithCommit: 'associated',
      listCommitStatusesForRef: 'statuses',
      createCommitStatus: async (input) => {
        if (state.failPublish) throw new Error('status API unavailable');
        state.statuses.push(input);
        return { data: {} };
      },
    },
    checks: { listForRef: 'checks' },
  };
}
function actionEndpoints(state, zipEntries, options) {
  return {
    actions: {
      getWorkflowRun: async ({ run_id }) => {
        if (run_id !== state.run.id) throw Object.assign(new Error('Not found'), { status: 404 });
        return { data: state.run };
      },
      listWorkflowRuns: async () => ({
        data: { workflow_runs: options.noRuns ? [] : [state.run] },
      }),
      listWorkflowRunArtifacts: 'artifacts',
      downloadArtifact: async () => {
        const zip = state.archive ?? buildZip(zipEntries());
        // Octokit returns an exact ArrayBuffer, not Node's pooled backing store.
        return { data: zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) };
      },
    },
  };
}
function dispatchStatuses(state, params) {
  const active = params.ref === HEAD && state.run.event === 'workflow_dispatch';
  return active ? [state.dispatchStatus] : [];
}
async function paginatedEndpoints(state, endpoint, params, options) {
  const paged = {
    associated: () => options.associated ?? [state.pull],
    checks: () => [state.check],
    statuses: () => [...dispatchStatuses(state, params), ...state.previewStatuses],
    artifacts: () => state.artifacts,
    listFiles: () => state.files,
  };
  if (!paged[endpoint]) throw new Error(`unexpected endpoint ${endpoint}`);
  return paged[endpoint]();
}
function fakeCore() {
  const core = {
    infos: [],
    warnings: [],
    failed: null,
    info: (message) => core.infos.push(message),
    warning: (message) => core.warnings.push(message),
    setFailed: (message) => (core.failed = message),
    summary: {
      addHeading: () => core.summary,
      addTable: () => core.summary,
      addRaw: () => core.summary,
      write: async () => {},
    },
  };
  return core;
}
function workflowRunContext(run = runFixture(), action = 'completed') {
  return {
    eventName: 'workflow_run',
    ref: 'refs/heads/main',
    repo: REPO,
    payload: { action, workflow_run: run, repository: { id: 1, full_name: REPO_NAME } },
    serverUrl: 'https://github.com',
    runId: 555,
  };
}
function pullTargetContext(pull, action) {
  return {
    eventName: 'pull_request_target',
    ref: 'refs/heads/main',
    repo: REPO,
    payload: { action, pull_request: pull, repository: { id: 1, full_name: REPO_NAME } },
    serverUrl: 'https://github.com',
    runId: 555,
  };
}
async function plan(t, context, options = {}) {
  const fake = fakeGithub(t, options);
  const core = fakeCore();
  const decision = await planPreview({
    github: fake.github,
    context,
    core,
    inputs: options.inputs,
    workspace: tempDir(t),
  });
  return { ...fake, core, decision };
}
const statusStates = (statuses) =>
  statuses.map((status) => `${status.sha.slice(0, 1)}:${status.state}`);
/* ------------------------------------------------------------------------------------------ */
/* Controller: planning                                                                        */
/* ------------------------------------------------------------------------------------------ */
test('a validated same-repository pull request plans an automatic deployment', async (t) => {
  const { decision, state, manifest } = await plan(t, workflowRunContext());
  assert.equal(decision.action, 'deploy');
  assert.equal(decision.environment, ENVIRONMENTS.internal);
  assert.equal(decision.fork, false);
  assert.equal(decision.digest, manifest.digest);
  assert.equal(decision.previewBranch, 'preview-pr-42');
  assert.equal(decision.runAttempt, 1);
  assert.equal(decision.mergeSha, MERGE);
  // Pending is reported on the candidate head and the verified test-merge commit.
  assert.deepEqual(statusStates(state.statuses), ['a:pending', 'c:pending']);
  assert.ok(state.statuses.every((status) => status.context === 'Preview Result'));
  assert.match(state.statuses[0].target_url, /actions\/runs\/555$/);
});
test('fork candidates route to the protected environment and show the exact revision', async (t) => {
  const run = runFixture({ head_repository: { full_name: FORK_NAME }, pull_requests: [] });
  const pull = pullFixture({ head: { sha: HEAD, ref: 'feature', repo: { full_name: FORK_NAME } } });
  const { decision, state } = await plan(t, workflowRunContext(run), {
    pull,
    associated: [pull],
    run: { head_repository: { full_name: FORK_NAME }, pull_requests: [] },
  });
  assert.equal(decision.action, 'deploy', decision.description);
  assert.equal(decision.environment, ENVIRONMENTS.fork);
  assert.equal(decision.fork, true);
  assert.match(state.statuses[0].description, /maintainer approval/);
  assert.ok(state.statuses[0].description.includes(HEAD.slice(0, 12)));
});
test('drafts, documentation-only scope and production runs never deploy', async (t) => {
  const draft = await plan(t, workflowRunContext(), { pull: pullFixture({ draft: true }) });
  assert.equal(draft.decision.action, 'skip');
  assert.equal(draft.decision.state, 'pending');
  assert.match(draft.decision.description, /Draft/);
  assert.deepEqual(statusStates(draft.state.statuses), ['a:pending', 'c:pending']);
  const docs = await plan(t, workflowRunContext(), {
    files: [{ filename: 'docs/a.md', previous_filename: 'docs/b.md' }, { filename: 'README.md' }],
  });
  assert.equal(docs.decision.action, 'skip');
  assert.equal(docs.decision.state, 'success');
  assert.match(docs.decision.description, /Not applicable/);
  // A rename out of the documentation set requires a preview even when the new path is Markdown.
  const renamed = await plan(t, workflowRunContext(), {
    files: [{ filename: 'docs/a.md', previous_filename: 'app/a.ts' }],
  });
  assert.equal(renamed.decision.action, 'deploy');
  const main = await plan(
    t,
    workflowRunContext(runFixture({ head_branch: 'main', event: 'push' }))
  );
  assert.equal(main.decision.action, 'ignore');
  assert.deepEqual(main.state.statuses, []);
  const other = await plan(t, workflowRunContext(runFixture({ path: '.github/workflows/x.yml' })));
  assert.equal(other.decision.action, 'ignore');
});
test('running, failed and unsuccessful CI evidence map to pending or failure', async (t) => {
  const running = await plan(
    t,
    workflowRunContext(runFixture({ status: 'in_progress', conclusion: null })),
    {
      run: { status: 'in_progress', conclusion: null },
    }
  );
  assert.equal(running.decision.action, 'wait');
  assert.deepEqual(statusStates(running.state.statuses), ['a:pending', 'c:pending']);
  const failed = await plan(t, workflowRunContext(), { run: { conclusion: 'failure' } });
  assert.equal(failed.decision.action, 'fail');
  assert.deepEqual(statusStates(failed.state.statuses), ['a:failure', 'c:failure']);
  const cancelled = await plan(t, workflowRunContext(), { run: { conclusion: 'cancelled' } });
  assert.equal(cancelled.decision.state, 'failure');
  const fake = fakeGithub(t);
  fake.state.check.conclusion = 'failure';
  const decision = await planPreview({
    github: fake.github,
    context: workflowRunContext(),
    core: fakeCore(),
    workspace: tempDir(t),
  });
  assert.equal(decision.action, 'fail');
  assert.match(decision.description, /CI Result concluded failure/);
});
test('head movement, base movement, stale attempts and superseded runs cannot deploy', async (t) => {
  const moved = await plan(t, workflowRunContext(), {
    pull: pullFixture({ head: { sha: sha('e'), ref: 'feature', repo: { full_name: REPO_NAME } } }),
  });
  assert.equal(moved.decision.action, 'ignore');
  assert.deepEqual(moved.state.statuses, []);
  const baseMoved = await plan(t, workflowRunContext(), {
    pull: pullFixture({ merge_commit_sha: sha('f') }),
  });
  assert.equal(baseMoved.decision.action, 'fail');
  assert.match(baseMoved.decision.description, /checkedOutSha/);
  const baseShaMoved = await plan(t, workflowRunContext(), {
    pull: pullFixture({ base: { sha: sha('f'), ref: 'main' } }),
  });
  assert.equal(baseShaMoved.decision.action, 'fail');
  assert.match(baseShaMoved.decision.description, /baseSha/);
  const recomputing = await plan(t, workflowRunContext(), {
    pull: pullFixture({ merge_commit_sha: null }),
  });
  assert.equal(recomputing.decision.action, 'wait');
  const staleAttempt = await plan(t, workflowRunContext(runFixture({ run_attempt: 2 })), {
    run: { run_attempt: 2 },
  });
  assert.equal(staleAttempt.decision.action, 'fail');
  assert.match(staleAttempt.decision.description, /runAttempt/);
  const closed = await plan(t, workflowRunContext(), { pull: pullFixture({ state: 'closed' }) });
  assert.equal(closed.decision.action, 'ignore');
  const retargeted = await plan(t, workflowRunContext(), {
    pull: pullFixture({ base: { sha: BASE, ref: 'develop' } }),
  });
  assert.equal(retargeted.decision.action, 'ignore');
});
test('tampered manifests, missing or expired artifacts and malicious archives fail closed', async (t) => {
  for (const [name, manifest, pattern] of [
    ['digest', { digest: 'e'.repeat(64) }, /digest/],
    ['repository', { repository: FORK_NAME }, /repository/],
    ['pull request', { pullRequest: 43 }, /pullRequest/],
    ['run id', { runId: 901 }, /runId/],
    [
      'branch',
      { previewBranch: 'preview-pr-43', appUrl: previewAppUrl('preview-pr-43') },
      /previewBranch/,
    ],
  ]) {
    const { decision } = await plan(t, workflowRunContext(), { manifest });
    assert.equal(decision.action, 'fail', name);
    assert.match(decision.description, pattern, name);
  }
  const base = await plan(t, workflowRunContext());
  for (const [name, rawManifest, pattern] of [
    ['profile version', { ...base.manifest, buildProfileVersion: 99 }, /profile version/],
    ['production profile', { ...base.manifest, profile: 'production' }, /not a preview/],
    ['manifest version', { ...base.manifest, version: 2 }, /manifest version/],
  ]) {
    const { decision } = await plan(t, workflowRunContext(), { rawManifest });
    assert.equal(decision.action, 'fail', name);
    assert.match(decision.description, pattern, name);
  }
  const missing = await plan(t, workflowRunContext(), { artifacts: [] });
  assert.match(missing.decision.description, /missing or expired/);
  const expired = await plan(t, workflowRunContext(), {
    artifacts: [{ id: 77, name: ARTIFACT_NAME, expired: true }],
  });
  assert.match(expired.decision.description, /missing or expired/);
  const duplicate = await plan(t, workflowRunContext(), {
    artifacts: [
      { id: 77, name: ARTIFACT_NAME, expired: false },
      { id: 78, name: ARTIFACT_NAME, expired: false },
    ],
  });
  assert.match(duplicate.decision.description, /missing or expired/);
  const unreadable = await plan(t, workflowRunContext(), { rawManifest: 'not json' });
  assert.match(unreadable.decision.description, /verification failed|no readable manifest/);
  const fake = fakeGithub(t);
  fake.state.archive = buildZip([{ name: '../../etc/passwd', data: 'x' }]);
  await assert.rejects(
    planPreview({
      github: fake.github,
      context: workflowRunContext(),
      core: fakeCore(),
      workspace: tempDir(t),
    }),
    /traversal/
  );
  assert.deepEqual(fake.state.statuses, []);
});
test('a matching earlier success is reused instead of redeploying', async (t) => {
  const first = await plan(t, workflowRunContext());
  const marker = successMarker(first.manifest.digest);
  const reused = await plan(t, workflowRunContext(), {
    previewStatuses: [
      {
        id: 9,
        context: 'Preview Result',
        state: 'success',
        description: `Preview deployed ${marker}`,
      },
      { id: 10, context: 'Preview Result', state: 'pending', description: 'Draft' },
    ],
  });
  assert.equal(reused.decision.action, 'reuse');
  assert.deepEqual(statusStates(reused.state.statuses), ['a:success', 'c:success']);
  const otherProfile = await plan(t, workflowRunContext(), {
    previewStatuses: [
      {
        id: 9,
        context: 'Preview Result',
        state: 'success',
        description: `Preview deployed ${marker.replace(/v\d+\]$/, 'v0]')}`,
      },
    ],
  });
  assert.equal(otherProfile.decision.action, 'deploy');
  const otherDigest = await plan(t, workflowRunContext(), {
    previewStatuses: [
      {
        id: 9,
        context: 'Preview Result',
        state: 'success',
        description: `Preview deployed ${successMarker('f'.repeat(64))}`,
      },
    ],
  });
  assert.equal(otherDigest.decision.action, 'deploy');
});
test('metadata events: ready-for-review reuses CI, draft conversion pends, close is ignored', async (t) => {
  const ready = await plan(t, pullTargetContext(pullFixture(), 'ready_for_review'));
  assert.equal(ready.decision.action, 'deploy');
  assert.equal(ready.decision.runId, 900);
  const noRun = await plan(t, pullTargetContext(pullFixture(), 'opened'), { noRuns: true });
  assert.equal(noRun.decision.action, 'wait');
  assert.match(noRun.decision.description, /Waiting for CI/);
  const draft = await plan(
    t,
    pullTargetContext(pullFixture({ draft: true }), 'converted_to_draft'),
    {
      pull: pullFixture({ draft: true }),
    }
  );
  assert.equal(draft.decision.action, 'skip');
  assert.equal(draft.decision.state, 'pending');
  const closed = await plan(t, pullTargetContext(pullFixture({ state: 'closed' }), 'closed'), {
    pull: pullFixture({ state: 'closed' }),
  });
  assert.equal(closed.decision.action, 'ignore');
  assert.deepEqual(closed.state.statuses, []);
  const duplicate = await plan(t, pullTargetContext(pullFixture(), 'synchronize'));
  assert.equal(duplicate.decision.action, 'deploy');
});
test('branch dispatches deploy without a pull request and reject the production branch', async (t) => {
  const run = runFixture({
    event: 'workflow_dispatch',
    head_branch: 'wip/release-1.2.3-1-1',
    pull_requests: [],
  });
  const previewBranch = previewBranchName({ branch: 'wip/release-1.2.3-1-1' });
  const staged = await plan(t, workflowRunContext(run), {
    associated: [],
    run: { event: 'workflow_dispatch', head_branch: 'wip/release-1.2.3-1-1', pull_requests: [] },
    manifest: {
      pullRequest: null,
      baseSha: null,
      checkedOutSha: HEAD,
      previewBranch,
      appUrl: previewAppUrl(previewBranch),
    },
  });
  assert.equal(staged.decision.action, 'deploy');
  assert.equal(staged.decision.pullRequest, null);
  assert.equal(staged.decision.previewBranch, previewBranch);
  assert.deepEqual(statusStates(staged.state.statuses), ['a:pending']);
  // The Crowdin `locales` dispatch resolves its open pull request through the validated head, but
  // the dispatch build itself carries branch-derived manifest claims (no PR, head checkout).
  const locales = runFixture({
    event: 'workflow_dispatch',
    head_branch: 'locales',
    pull_requests: [],
  });
  const localesPull = pullFixture({
    head: { sha: HEAD, ref: 'locales', repo: { full_name: REPO_NAME } },
  });
  const localesBranch = previewBranchName({ branch: 'locales' });
  const crowdin = await plan(t, workflowRunContext(locales), {
    pull: localesPull,
    associated: [localesPull],
    run: { event: 'workflow_dispatch', head_branch: 'locales', pull_requests: [] },
    manifest: {
      pullRequest: null,
      baseSha: null,
      checkedOutSha: HEAD,
      previewBranch: localesBranch,
      appUrl: previewAppUrl(localesBranch),
    },
  });
  assert.equal(crowdin.decision.action, 'deploy');
  assert.equal(crowdin.decision.pullRequest, 42);
  assert.equal(crowdin.decision.runEvent, 'workflow_dispatch');
  assert.equal(crowdin.decision.previewBranch, localesBranch);
  const production = await plan(
    t,
    workflowRunContext(runFixture({ event: 'workflow_dispatch', head_branch: 'main' }))
  );
  assert.equal(production.decision.action, 'ignore');
});
test('the maintainer rerun path repeats every check and only runs from the default branch', async (t) => {
  const context = {
    ...workflowRunContext(),
    eventName: 'workflow_dispatch',
    payload: { repository: { id: 1, full_name: REPO_NAME } },
  };
  const rerun = await plan(t, context, { inputs: { run_id: '900' } });
  assert.equal(rerun.decision.action, 'deploy');
  const badInput = await plan(t, context, { inputs: { run_id: 'abc' } });
  assert.equal(badInput.decision.action, 'fail');
  assert.deepEqual(badInput.state.statuses, []);
  const wrongRef = await plan(
    t,
    { ...context, ref: 'refs/heads/feature' },
    { inputs: { run_id: '900' } }
  );
  assert.equal(wrongRef.decision.action, 'ignore');
  const failedRerun = await plan(t, context, {
    inputs: { run_id: '900' },
    run: { conclusion: 'failure' },
  });
  assert.equal(failedRerun.decision.action, 'fail');
});
test('status publication failures propagate so the gate cannot pass silently', async (t) => {
  const fake = fakeGithub(t, { failPublish: true });
  await assert.rejects(
    planPreview({
      github: fake.github,
      context: workflowRunContext(),
      core: fakeCore(),
      workspace: tempDir(t),
    }),
    /status API unavailable/
  );
});
/* ------------------------------------------------------------------------------------------ */
/* Controller: deployment verification and results                                            */
/* ------------------------------------------------------------------------------------------ */
test('deployment verification repeats freshness checks and re-verifies the artifact', async (t) => {
  const { decision, github, state } = await plan(t, workflowRunContext());
  const core = fakeCore();
  const destination = join(tempDir(t), 'dist');
  const manifest = await verifyForDeploy({
    github,
    context: workflowRunContext(),
    core,
    decision,
    destination,
  });
  assert.equal(manifest.digest, decision.digest);
  assert.equal(readFileSync(join(destination, 'index.html'), 'utf8'), '<html>ok</html>');
  await assert.rejects(
    verifyForDeploy({
      github,
      context: workflowRunContext(),
      core,
      decision: { ...decision, action: 'skip' },
      destination,
    }),
    /not planned/
  );
  for (const previewBranch of ['main', 'feature', undefined])
    await assert.rejects(
      verifyForDeploy({
        github,
        context: workflowRunContext(),
        core,
        decision: { ...decision, previewBranch },
        destination,
      }),
      /non-preview branch/
    );
  state.pull = pullFixture({
    head: { sha: sha('e'), ref: 'feature', repo: { full_name: REPO_NAME } },
  });
  await assert.rejects(
    verifyForDeploy({
      github,
      context: workflowRunContext(),
      core,
      decision,
      destination: join(tempDir(t), 'x'),
    }),
    /head moved/
  );
  state.pull = pullFixture({ draft: true });
  await assert.rejects(
    verifyForDeploy({
      github,
      context: workflowRunContext(),
      core,
      decision,
      destination: join(tempDir(t), 'y'),
    }),
    /not open and ready/
  );
  state.pull = pullFixture();
  state.run = runFixture({ run_attempt: 2 });
  await assert.rejects(
    verifyForDeploy({
      github,
      context: workflowRunContext(),
      core,
      decision,
      destination: join(tempDir(t), 'z'),
    }),
    /attempt superseded/
  );
  // Approval for a fork cannot carry forward: the same decision is refused once the head moves.
  state.run = runFixture();
  state.pull = pullFixture({
    head: { sha: sha('e'), ref: 'feature', repo: { full_name: FORK_NAME } },
  });
  await assert.rejects(
    verifyForDeploy({
      github,
      context: workflowRunContext(),
      core,
      decision: { ...decision, fork: true, environment: ENVIRONMENTS.fork },
      destination: join(tempDir(t), 'w'),
    }),
    /head moved/
  );
});
test('results publish success only for a current candidate and failure for failed stages', async (t) => {
  const { decision, github, state } = await plan(t, workflowRunContext());
  state.statuses.length = 0;
  const core = fakeCore();
  const outcome = await publishResult({
    github,
    context: workflowRunContext(),
    core,
    decision,
    outcomes: { deploy: 'success', smoke: 'success' },
    evidence: { url: `https://abc.${PAGES_DOMAIN}` },
  });
  assert.equal(outcome, 'success');
  assert.deepEqual(statusStates(state.statuses), ['a:success', 'c:success']);
  assert.ok(state.statuses[0].description.includes(successMarker(decision.digest)));
  state.statuses.length = 0;
  for (const outcomes of [
    { deploy: 'failure', smoke: 'skipped' },
    { deploy: 'cancelled', smoke: 'skipped' },
    { deploy: 'success', smoke: 'failure' },
    { deploy: 'success', smoke: 'cancelled' },
  ]) {
    const failedCore = fakeCore();
    const result = await publishResult({
      github,
      context: workflowRunContext(),
      core: failedCore,
      decision,
      outcomes,
      evidence: {},
    });
    assert.equal(result, 'failure', JSON.stringify(outcomes));
    assert.ok(failedCore.failed);
  }
  assert.ok(state.statuses.every((status) => status.state === 'failure'));
  // Late completion: the head moved while smoke tests ran, so success is not published.
  state.statuses.length = 0;
  state.pull = pullFixture({
    head: { sha: sha('e'), ref: 'feature', repo: { full_name: REPO_NAME } },
  });
  const late = await publishResult({
    github,
    context: workflowRunContext(),
    core,
    decision,
    outcomes: { deploy: 'success', smoke: 'success' },
    evidence: {},
  });
  assert.equal(late, 'obsolete');
  assert.deepEqual(state.statuses, []);
  assert.match(core.warnings.at(-1), /obsolete/);
  state.pull = pullFixture();
  state.run = runFixture({ run_attempt: 2 });
  const superseded = await publishResult({
    github,
    context: workflowRunContext(),
    core,
    decision,
    outcomes: { deploy: 'success', smoke: 'success' },
    evidence: {},
  });
  assert.equal(superseded, 'obsolete');
  assert.deepEqual(state.statuses, []);
  // Non-deploy plans were already reported during planning; results only summarize them.
  const skipCore = fakeCore();
  const skip = await publishResult({
    github,
    context: workflowRunContext(),
    core: skipCore,
    decision: { ...decision, action: 'skip', state: 'success' },
    outcomes: {},
    evidence: {},
  });
  assert.equal(skip, 'success');
  assert.deepEqual(state.statuses, []);
  // Reporting failures propagate.
  state.run = runFixture();
  state.failPublish = true;
  await assert.rejects(
    publishResult({
      github,
      context: workflowRunContext(),
      core,
      decision,
      outcomes: { deploy: 'success', smoke: 'success' },
      evidence: {},
    }),
    /status API unavailable/
  );
});
test('controller crashes report failure on the candidate revision and never on main', async (t) => {
  const fake = fakeGithub(t);
  const core = fakeCore();
  await publishControllerFailure({
    github: fake.github,
    context: workflowRunContext(),
    core,
    decision: null,
  });
  assert.deepEqual(statusStates(fake.state.statuses), ['a:failure']);
  assert.equal(
    fallbackHead(workflowRunContext(runFixture({ head_branch: 'main', event: 'push' }))),
    null
  );
  assert.equal(fallbackHead(pullTargetContext(pullFixture(), 'opened')), HEAD);
  fake.state.statuses.length = 0;
  await publishControllerFailure({
    github: fake.github,
    context: workflowRunContext(runFixture({ head_branch: 'main', event: 'push' })),
    core,
    decision: null,
  });
  assert.deepEqual(fake.state.statuses, []);
  await publishControllerFailure({
    github: fake.github,
    context: workflowRunContext(),
    core,
    decision: { headSha: HEAD, mergeSha: MERGE },
  });
  assert.deepEqual(statusStates(fake.state.statuses), ['a:failure', 'c:failure']);
});
test('verifyManifest reports every mismatched claim', (t) => {
  const dir = tempDir(t);
  writeDist(dir);
  const manifest = manifestFor(dir);
  const expected = {
    repository: REPO_NAME,
    pullRequest: 42,
    headSha: HEAD,
    baseSha: BASE,
    checkedOutSha: MERGE,
    runId: 900,
    runAttempt: 1,
    previewBranch: 'preview-pr-42',
    appUrl: previewAppUrl('preview-pr-42'),
  };
  assert.deepEqual(verifyManifest(manifest, expected, manifest.digest), []);
  assert.deepEqual(
    verifyManifest(manifest, { ...expected, checkedOutSha: null }, manifest.digest),
    ['GitHub has not finished computing the test merge for this revision.']
  );
  const errors = verifyManifest(
    manifest,
    { ...expected, headSha: sha('e'), runAttempt: 2 },
    'f'.repeat(64)
  );
  assert.equal(errors.length, 3);
});
/* ------------------------------------------------------------------------------------------ */
/* Deployment evidence and readiness                                                           */
/* ------------------------------------------------------------------------------------------ */
test('deployment records must match project, environment, branch, commit and URL', () => {
  const ndjson = [
    JSON.stringify({ type: 'pages-deploy', deployment_id: '0b7e1d3c-5f2a-4c8e-9d1b-2a3c4d5e6f70' }),
    JSON.stringify({
      type: 'pages-deploy-detailed',
      deployment_id: '0b7e1d3c-5f2a-4c8e-9d1b-2a3c4d5e6f70',
      url: `https://abc.${PAGES_DOMAIN}`,
      alias: `https://preview-pr-42.${PAGES_DOMAIN}`,
    }),
  ].join('\n');
  assert.equal(parseWranglerOutput(ndjson).deployment_id, '0b7e1d3c-5f2a-4c8e-9d1b-2a3c4d5e6f70');
  assert.throws(() => parseWranglerOutput(''), /exactly one/);
  const record = {
    id: '0b7e1d3c-5f2a-4c8e-9d1b-2a3c4d5e6f70',
    project_name: 'tarkovtracker',
    environment: 'preview',
    url: `https://abc.${PAGES_DOMAIN}`,
    deployment_trigger: { metadata: { branch: 'preview-pr-42', commit_hash: HEAD } },
  };
  const expected = {
    deploymentId: '0b7e1d3c-5f2a-4c8e-9d1b-2a3c4d5e6f70',
    previewBranch: 'preview-pr-42',
    headSha: HEAD,
  };
  assert.deepEqual(deploymentRecordErrors(record, expected), []);
  assert.ok(deploymentRecordErrors({ ...record, environment: 'production' }, expected).length);
  assert.ok(deploymentRecordErrors({ ...record, project_name: 'other' }, expected).length);
  assert.ok(
    deploymentRecordErrors({ ...record, id: '0b7e1d3c-5f2a-4c8e-9d1b-2a3c4d5e6f71' }, expected)
      .length
  );
  assert.ok(
    deploymentRecordErrors({ ...record, url: 'https://tarkovtracker.org' }, expected).length
  );
  assert.ok(
    deploymentRecordErrors({ ...record, url: `http://abc.${PAGES_DOMAIN}` }, expected).length
  );
  const production = deploymentRecordErrors(
    { ...record, deployment_trigger: { metadata: { branch: 'main', commit_hash: HEAD } } },
    { ...expected, previewBranch: 'main' }
  );
  assert.ok(production.includes('deployment targets production branch'));
  assert.ok(
    deploymentRecordErrors(
      {
        ...record,
        deployment_trigger: { metadata: { branch: 'preview-pr-42', commit_hash: sha('e') } },
      },
      expected
    ).length
  );
});
test('readiness polling is bounded and production hosts are recognised', async () => {
  let now = 0;
  const responses = [500, 404, 200];
  const fetchImpl = async () => {
    const status = responses.shift() ?? 200;
    return { status, headers: new Map([['content-type', 'text/html; charset=utf-8']]) };
  };
  const sleep = async (ms) => {
    now += ms;
  };
  const attempts = await waitForDeployment('https://x.example', {
    fetchImpl,
    now: () => now,
    sleep,
  });
  assert.equal(attempts, 3);
  now = 0;
  await assert.rejects(
    waitForDeployment('https://x.example', {
      fetchImpl: async () => {
        throw new Error('down');
      },
      now: () => now,
      sleep,
      windowMs: 20000,
    }),
    /within 20s/
  );
  assert.ok(now <= 20000);
  for (const url of [
    'https://knptqelvsodccnoehmbj.supabase.co/rest/v1/x',
    'https://js.stripe.com/v3',
    'https://www.googletagmanager.com/gtag/js',
    'https://www.clarity.ms/tag/x',
    'https://region1.google-analytics.com/g/collect',
  ])
    assert.equal(isForbiddenRequest(url), true, url);
  for (const url of [
    `https://abc.${PAGES_DOMAIN}/api/tarkov/bootstrap`,
    'https://assets.tarkov.dev/x.png',
    'not a url',
  ])
    assert.equal(isForbiddenRequest(url), false, url);
});
