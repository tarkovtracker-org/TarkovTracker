import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { previewBranchName, PAGES_DOMAIN } from '../preview/profile.mjs';
import { liveQueueAliases, pendingPreviews, retentionPages } from '../preview/retention-api.mjs';
import { retainQueuePreviews, requireRetentionLifecycle } from '../preview/retention.mjs';
import { jobBlock, workflowStep, workflowEvent } from './helpers/workflow-blocks.mjs';
const repo = { owner: 'example', repo: 'repo' };
const sha = 'a'.repeat(40);
const branch = 'gh-readonly-queue/main/pr-123-example';
const now = Date.parse('2026-10-14T12:00:00Z');
const lifecycle =
  'concurrency:\n  group: pages-preview-lifecycle\n  queue: max\n  cancel-in-progress: false\n';
function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'queue-retention-test-'));
  mkdirSync(join(workspace, '.github/workflows'), { recursive: true });
  for (const name of ['preview.yml', 'preview-retention.yml'])
    writeFileSync(join(workspace, '.github/workflows', name), lifecycle);
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const state = {
    run: {
      id: 10,
      path: '.github/workflows/ci.yml',
      event: 'merge_group',
      head_branch: branch,
      head_sha: sha,
      status: 'completed',
      created_at: '2026-10-10T00:00:00Z',
      repository: { full_name: 'example/repo' },
      head_repository: { full_name: 'example/repo' },
    },
    records: [],
    refs: [],
    active: [],
    refExists: false,
    removed: [],
    calls: [],
    controller: {
      id: 11,
      path: '.github/workflows/preview.yml',
      event: 'workflow_dispatch',
      head_branch: 'main',
      head_sha: 'b'.repeat(40),
      status: 'completed',
      created_at: '2026-10-10T00:30:00Z',
      display_title: 'Preview CI 10 request 0',
      repository: { full_name: 'example/repo' },
      head_repository: { full_name: 'example/repo' },
    },
    historicalWorkflow: lifecycle,
    status: {
      id: 12,
      context: 'Preview Result',
      state: 'success',
      creator: { login: 'github-actions[bot]' },
    },
    project: {
      name: 'tarkovtracker',
      production_branch: 'main',
      canonical_deployment: { id: 'production' },
    },
  };
  const alias = previewBranchName({ branch });
  state.records.push({
    id: '00000000-0000-0000-0000-000000000001',
    project_name: 'tarkovtracker',
    environment: 'preview',
    created_on: '2026-10-10T01:00:00Z',
    url: `https://abcdef.${PAGES_DOMAIN}`,
    deployment_trigger: {
      metadata: {
        branch: alias,
        commit_hash: sha,
        commit_message: `Actions preview for ${sha} CI 10 controller 11`,
      },
    },
  });
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async ({ run_id }) => ({
          data: run_id === 10 ? state.run : state.controller,
        }),
        listWorkflowRuns: async (params) => {
          state.calls.push(params);
          const records = params.workflow_id === 'ci.yml' ? [state.run] : state.active;
          return { data: { total_count: records.length, workflow_runs: records } };
        },
      },
      git: {
        listMatchingRefs: async () => ({ data: state.refs }),
        getRef: async () => {
          if (state.refExists) return { data: { object: { sha: 'b'.repeat(40) } } };
          throw Object.assign(new Error('Missing'), { status: 404 });
        },
      },
      repos: {
        getContent: async ({ ref }) => {
          assert.equal(ref, state.controller.head_sha);
          return {
            data: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(state.historicalWorkflow).toString('base64'),
            },
          };
        },
        listCommitStatusesForRef: async () => ({ data: state.status ? [state.status] : [] }),
      },
    },
  };
  const pages = {
    project: async () => state.project,
    discover: async () => ({ records: state.records, discovery: { cycle: 0, partial: false } }),
    deployment: async (id) => state.records.find((record) => record.id === id),
    remove: async (id) => {
      state.removed.push(id);
    },
  };
  return { state, options: { github, repo, pages, workspace, now } };
}
test('retention defaults to dry-run and binds candidates to exact queue CI provenance', async (t) => {
  const f = fixture(t);
  const report = await retainQueuePreviews(f.options);
  assert.deepEqual(report.eligible, [f.state.records[0].id]);
  assert.deepEqual(report.deleted, []);
  assert.deepEqual(f.state.removed, []);
  assert.equal(report.mode, 'dry-run');
  assert.ok(f.state.calls.every((call) => call.workflow_id === 'preview.yml'));
  await retainQueuePreviews({ ...f.options, apply: true });
  assert.deepEqual(f.state.removed, report.eligible);
});
test('production, PR previews, wrong projects/commits and unknown provenance are retained', async (t) => {
  for (const patch of [
    { environment: 'production' },
    { project_name: 'other' },
    { deployment_trigger: { metadata: { branch: 'preview-pr-123', commit_hash: sha } } },
    {
      deployment_trigger: {
        metadata: { branch: previewBranchName({ branch }), commit_hash: 'b'.repeat(40) },
      },
    },
    { url: 'https://evil.example' },
    { id: 'malformed' },
  ]) {
    const f = fixture(t);
    Object.assign(f.state.records[0], patch);
    const report = await retainQueuePreviews({ ...f.options, apply: true });
    assert.deepEqual(report.deleted, []);
  }
  for (const patch of [
    { event: 'pull_request' },
    { path: '.github/workflows/other.yml' },
    { head_repository: { full_name: 'fork/repo' } },
    { repository: { full_name: 'other/repo' } },
    { head_branch: 'gh-readonly-queue/other/pr-1' },
    { status: 'in_progress' },
    { created_at: '2026-10-14T00:00:00Z' },
  ]) {
    const f = fixture(t);
    Object.assign(f.state.run, patch);
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
});
test('live refs including a reformed SHA and live alias collisions remain protected', async (t) => {
  const f = fixture(t);
  f.state.refExists = true;
  assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  f.state.refExists = false;
  f.state.refs = [{ ref: `refs/heads/${branch}`, object: { sha: 'b'.repeat(40) } }];
  assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
});
test('removed queue refs cannot invalidate in-flight smoke/result protection', async (t) => {
  const f = fixture(t);
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    f.state.active = [{ id: 99, status }];
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
  f.state.active = [];
  for (const status of [
    null,
    { state: 'pending' },
    { state: 'success', creator: { login: 'other' } },
  ]) {
    f.state.status = status;
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
});
test('canonical and latest project deployments survive even when they otherwise qualify', async (t) => {
  for (const field of ['canonical_deployment', 'latest_deployment']) {
    const f = fixture(t);
    f.state.project[field] = { id: f.state.records[0].id };
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
});
test('age, scan and deletion budgets are fixed; malformed time fails closed', async (t) => {
  const f = fixture(t);
  for (const created_on of ['invalid', '2026-10-14T00:00:00Z', '2026-10-15T00:00:00Z']) {
    f.state.records[0].created_on = created_on;
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
  f.state.records[0].created_on = '2026-10-10T01:00:00Z';
  const source = f.state.records[0];
  f.state.records = Array.from({ length: 60 }, (_, index) => ({
    ...structuredClone(source),
    id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
  }));
  const report = await retainQueuePreviews({ ...f.options, apply: true });
  assert.equal(report.deleted.length, 10);
  assert.equal(report.scanBudget, 50);
  f.state.active = [{ id: 99, status: 'in_progress' }];
  const blocked = await retainQueuePreviews({ ...f.options, apply: true });
  assert.equal(blocked.examined, 50);
  assert.equal(blocked.retained.length, 50);
  assert.deepEqual(blocked.deleted, []);
  f.options.pages.discover = async () => ({
    records: f.state.records,
    discovery: { cycle: 1, partial: true },
  });
  const rotated = await retainQueuePreviews({ ...f.options, apply: true });
  assert.equal(rotated.examined, 10);
  assert.deepEqual(
    rotated.retained.map(({ id }) => id),
    f.state.records.slice(50).map(({ id }) => id)
  );
  await assert.rejects(retainQueuePreviews({ ...f.options, now: NaN }));
});
test('deployment identity, project identity and pending state are reread before DELETE', async (t) => {
  for (const change of ['deployment', 'project', 'pending', 'ref', 'status']) {
    const f = fixture(t);
    const changes = {
      deployment: () => {
        f.state.records[0].environment = 'production';
      },
      pending: () => {
        f.state.active = [{ id: 99, status: 'in_progress' }];
      },
      ref: () => {
        f.state.refExists = true;
      },
      status: () => {
        f.state.status.state = 'pending';
      },
      project: () => {},
    };
    f.options.pages.deployment = async () => {
      changes[change]();
      return f.state.records[0];
    };
    let projectReads = 0;
    const original = f.options.pages.project;
    f.options.pages.project = async () => {
      const project = await original();
      if (++projectReads > 1 && change === 'project')
        return { ...project, latest_deployment: { id: f.state.records[0].id } };
      return project;
    };
    assert.deepEqual(
      (await retainQueuePreviews({ ...f.options, apply: true })).deleted,
      [],
      change
    );
  }
});
test('API failures, malformed inventories, unknown project and duplicate records cannot delete', async (t) => {
  for (const operation of ['project', 'discover', 'deployment']) {
    const f = fixture(t);
    f.options.pages[operation] = async () => {
      throw new Error('API unavailable');
    };
    await assert.rejects(retainQueuePreviews({ ...f.options, apply: true }));
    assert.deepEqual(f.state.removed, []);
  }
  const f = fixture(t);
  f.options.github.rest.git.getRef = async () => {
    throw Object.assign(new Error('Denied'), { status: 403 });
  };
  await assert.rejects(retainQueuePreviews({ ...f.options, apply: true }));
  const duplicated = fixture(t);
  duplicated.state.records.push(duplicated.state.records[0]);
  await assert.rejects(retainQueuePreviews({ ...duplicated.options, apply: true }));
  const unknown = fixture(t);
  delete unknown.state.project.canonical_deployment;
  await assert.rejects(retainQueuePreviews({ ...unknown.options, apply: true }));
});
test('shared lifecycle lock requires max queue capacity and cannot cancel preview pipelines', (t) => {
  const f = fixture(t);
  requireRetentionLifecycle(f.options.workspace);
  for (const changed of [
    lifecycle.replace('queue: max', 'queue: single'),
    lifecycle.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    lifecycle.replace('pages-preview-lifecycle', 'other'),
  ]) {
    writeFileSync(join(f.options.workspace, '.github/workflows/preview.yml'), changed);
    assert.throws(() => requireRetentionLifecycle(f.options.workspace));
  }
});
test('GitHub pending-run pagination is complete and refuses search truncation or lost pages', async () => {
  const calls = [];
  const github = {
    rest: {
      actions: {
        listWorkflowRuns: async ({ page }) => {
          calls.push(page);
          return {
            data: {
              total_count: 101,
              workflow_runs: Array(page === 1 ? 100 : 1).fill({ id: page }),
            },
          };
        },
      },
    },
  };
  assert.equal((await pendingPreviews(github, repo)).length, 505);
  assert.equal(calls.filter((page) => page === 2).length, 5);
  for (const total_count of [1000, undefined, -1, 1]) {
    github.rest.actions.listWorkflowRuns = async () => ({
      data: { total_count, workflow_runs: [] },
    });
    await assert.rejects(pendingPreviews(github, repo));
  }
});
test('controller provenance binds both run identities and immutable main workflow content', async (t) => {
  for (const patch of [
    { id: 12 },
    { path: '.github/workflows/other.yml' },
    { event: 'pull_request' },
    { head_branch: branch },
    { head_sha: 'invalid' },
    { status: 'in_progress' },
    { repository: { full_name: 'other/repo' } },
    { head_repository: { full_name: 'fork/repo' } },
    { display_title: 'Preview CI 99 request 0' },
    { created_at: '2026-10-12T00:00:00Z' },
  ]) {
    const f = fixture(t);
    Object.assign(f.state.controller, patch);
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
  const f = fixture(t);
  f.state.run.id = 12;
  assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
});
test('pre-lock historical controller reruns and unbound deployment provenance cannot be deleted', async (t) => {
  const f = fixture(t);
  f.state.historicalWorkflow = lifecycle.replace('queue: max', 'queue: single');
  assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  assert.deepEqual(f.state.removed, []);
  f.state.historicalWorkflow = lifecycle;
  for (const commit_message of [
    '',
    `Actions preview for ${sha}`,
    `Actions preview for ${'b'.repeat(40)} CI 10 controller 11`,
  ]) {
    f.state.records[0].deployment_trigger.metadata.commit_message = commit_message;
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
});
function apiFixture(body) {
  const requests = [];
  const pages = retentionPages({
    accountId: 'account',
    token: 'synthetic-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method });
      const page = Number(new URL(url).searchParams.get('page') || 1);
      return { ok: true, json: async () => (typeof body === 'function' ? body(page) : body) };
    },
  });
  return { pages, requests };
}
function pagesBody(page, totalCount) {
  const totalPages = Math.ceil(totalCount / 25);
  const size = Math.min(25, Math.max(0, totalCount - (page - 1) * 25));
  return {
    success: true,
    result: Array.from({ length: size }, (_, index) => ({ id: `${page}-${index}` })),
    result_info: {
      page,
      per_page: 25,
      count: size,
      total_count: totalCount,
      total_pages: totalPages,
    },
  };
}
test('Pages bounded discovery uses supported pages and never infers absence from partial history', async () => {
  const f = apiFixture((page) => pagesBody(page, 26));
  const discovered = await f.pages.discover(0);
  assert.equal(discovered.records.length, 26);
  assert.equal(discovered.discovery.partial, false);
  assert.ok(f.requests.every(({ url }) => new URL(url).searchParams.get('per_page') === '25'));
  await f.pages.remove('00000000-0000-0000-0000-000000000001');
  assert.match(
    f.requests.at(-1).url,
    /accounts\/account\/pages\/projects\/tarkovtracker\/deployments\/00000000-0000-0000-0000-000000000001\?force=true$/
  );
  assert.equal(f.requests.at(-1).method, 'DELETE');
  for (const body of [
    { success: false },
    { success: true, result: [] },
    { ...pagesBody(1, 26), result: [] },
    { ...pagesBody(1, 26), result_info: { ...pagesBody(1, 26).result_info, page: 2 } },
    { ...pagesBody(1, 26), result_info: { ...pagesBody(1, 26).result_info, total_pages: -1 } },
  ])
    await assert.rejects(apiFixture(body).pages.discover(0));
});
test('rotating hourly windows cover real 6161-deployment history within fixed read budgets', async () => {
  const visited = new Set();
  for (let hour = 0; hour < 7; hour++) {
    const f = apiFixture((page) => pagesBody(page, 6161));
    const result = await f.pages.discover(hour * 60 * 60 * 1000);
    assert.equal(result.discovery.totalPages, 247);
    assert.equal(result.discovery.partial, true);
    assert.ok(result.records.length <= 1000);
    assert.ok(f.requests.length <= 41);
    for (const record of result.records) visited.add(record.id);
  }
  assert.equal(visited.size, 6161);
});
test('discovery pagination changes or incomplete pages abort before any deletion', async () => {
  const changed = apiFixture((page) => pagesBody(page, page === 1 ? 6161 : 6162));
  await assert.rejects(changed.pages.discover(0), /changed during discovery/);
  const incomplete = apiFixture((page) => ({ ...pagesBody(page, 6161), result: [] }));
  await assert.rejects(incomplete.pages.discover(0), /Incomplete/);
});
test('Pages transport or envelope failures cannot report successful deletion', async () => {
  const failed = apiFixture({ success: false });
  await assert.rejects(failed.pages.remove('00000000-0000-0000-0000-000000000001'));
  const pages = retentionPages({
    accountId: 'account',
    token: 'synthetic',
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(pages.remove('00000000-0000-0000-0000-000000000001'));
});
function assertRetentionBoundary(workflow) {
  const retention = jobBlock(workflow, 'retention');
  const checkout = workflowStep(retention, 'Checkout trusted retention tooling');
  const apply = workflowStep(retention, 'Plan or apply bounded retention');
  assert.match(retention, /^ {4}if: github.ref == 'refs\/heads\/main'$/m);
  assert.match(retention, /^ {4}environment: preview$/m);
  assert.match(checkout, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.doesNotMatch(checkout, /persist-credentials: true/);
  assert.match(apply, /CLOUDFLARE_PAGES_API_TOKEN: \$\{\{ secrets.CLOUDFLARE_PAGES_API_TOKEN \}\}/);
  assert.match(apply, /RETENTION_ENABLED: \$\{\{ vars.PREVIEW_QUEUE_RETENTION_ENABLED \}\}/);
  assert.match(apply, /process.env.RETENTION_ENABLED === 'true'/);
  assert.match(apply, /getCollaboratorPermissionLevel/);
  assert.match(
    workflowEvent(workflow, 'workflow_dispatch'),
    /^ {6}apply:\n(?: {8}[^\n]*\n)* {8}default: false$/m
  );
}
test('retention workflow remains main-only, credential isolated, and disabled until approval', () => {
  const workflow = readFileSync('.github/workflows/preview-retention.yml', 'utf8');
  assertRetentionBoundary(workflow);
  const decoy =
    "  unrelated:\n    if: github.ref == 'refs/heads/main'\n    environment: preview\n    steps:\n      - name: Decoy\n        env:\n          CLOUDFLARE_PAGES_API_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_API_TOKEN }}\n          RETENTION_ENABLED: ${{ vars.PREVIEW_QUEUE_RETENTION_ENABLED }}\n";
  for (const changed of [
    workflow.replace("    if: github.ref == 'refs/heads/main'\n", ''),
    workflow.replace('    environment: preview\n', ''),
    workflow.replace(
      'CLOUDFLARE_PAGES_API_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_API_TOKEN }}',
      'CLOUDFLARE_PAGES_API_TOKEN: missing'
    ),
    workflow.replace(
      'RETENTION_ENABLED: ${{ vars.PREVIEW_QUEUE_RETENTION_ENABLED }}',
      'RETENTION_ENABLED: missing'
    ),
  ])
    assert.throws(() => assertRetentionBoundary(changed + decoy), assert.AssertionError);
});
test('manual retention accepts maintain role despite legacy write permission and rejects ordinary write', async () => {
  const workflow = readFileSync('.github/workflows/preview-retention.yml', 'utf8');
  const step = workflowStep(jobBlock(workflow, 'retention'), 'Plan or apply bounded retention');
  const guard = step.slice(step.indexOf('const requested ='), step.indexOf('const pages ='));
  const run = new (Object.getPrototypeOf(async function () {}).constructor)(
    'context',
    'process',
    'github',
    guard + 'return apply;'
  );
  const context = {
    eventName: 'workflow_dispatch',
    actor: 'maintainer',
    repo: { owner: 'owner', repo: 'repo' },
  };
  const process = { env: { APPLY_INPUT: 'true', RETENTION_ENABLED: 'true' } };
  const github = (data) => ({
    rest: { repos: { getCollaboratorPermissionLevel: async () => ({ data }) } },
  });
  assert.equal(
    await run(context, process, github({ permission: 'write', role_name: 'maintain' })),
    true
  );
  assert.equal(
    await run(context, process, github({ permission: 'admin', role_name: 'admin' })),
    true
  );
  for (const data of [
    { permission: 'write', role_name: 'write' },
    { permission: 'write' },
    { permission: 'read', role_name: 'triage' },
  ])
    await assert.rejects(run(context, process, github(data)), /current maintainer/);
});
function ordinaryWaiting(f) {
  const source = {
    ...f.state.run,
    id: 30,
    event: 'pull_request',
    head_branch: 'fork-feature',
    conclusion: 'success',
    head_repository: { full_name: 'fork/repo' },
  };
  f.state.active = [
    { ...f.state.controller, id: 20, status: 'waiting', display_title: 'Preview CI 30 request 0' },
  ];
  const get = f.options.github.rest.actions.getWorkflowRun;
  f.options.github.rest.actions.getWorkflowRun = async (params) =>
    params.run_id === 30 ? { data: source } : get(params);
  return source;
}
test('authenticated ordinary fork approval waits do not block queue retention; unknown pending evidence does', async (t) => {
  const f = fixture(t);
  ordinaryWaiting(f);
  assert.equal((await retainQueuePreviews({ ...f.options, apply: true })).deleted.length, 1);
  for (const change of [
    (f, source) => {
      source.event = 'merge_group';
      source.head_branch = branch;
    },
    (f, source) => {
      source.path = '.github/workflows/forged.yml';
    },
    (f, source) => {
      source.repository = { full_name: 'foreign/repo' };
    },
    (f) => {
      f.state.active[0].head_repository = { full_name: 'fork/repo' };
    },
    (f) => {
      f.state.active[0].head_branch = 'candidate';
    },
    (f) => {
      f.state.active[0].display_title = 'unclassified';
    },
  ]) {
    const f = fixture(t);
    change(f, ordinaryWaiting(f));
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
  const missing = fixture(t);
  ordinaryWaiting(missing);
  const get = missing.options.github.rest.actions.getWorkflowRun;
  missing.options.github.rest.actions.getWorkflowRun = async (params) => {
    if (params.run_id === 30) throw new Error('API unavailable');
    return get(params);
  };
  await assert.rejects(retainQueuePreviews({ ...missing.options, apply: true }));
  assert.deepEqual(missing.state.removed, []);
});
test('current conditional lock requires both authenticated profile bindings; historical global locks remain supported', async (t) => {
  const f = fixture(t);
  const current = readFileSync('.github/workflows/preview.yml', 'utf8');
  f.state.historicalWorkflow = current;
  writeFileSync(join(f.options.workspace, '.github/workflows/preview.yml'), current);
  requireRetentionLifecycle(f.options.workspace);
  assert.equal((await retainQueuePreviews(f.options)).eligible.length, 1);
  for (const changed of [
    current.replace("inputs.queue && 'pages-preview-lifecycle'", "inputs.queue && 'wrong'"),
    current.replace('queue: process.env.QUEUE_INPUT,', 'queue: false,'),
    current.replace('QUEUE_INPUT: ${{ inputs.queue }}', 'QUEUE_INPUT: false'),
    current.replace('type: boolean', 'type: string'),
  ]) {
    f.state.historicalWorkflow = changed;
    assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  }
});
async function retentionMutation(before, after) {
  const filename = join(process.cwd(), 'scripts/preview/retention.mjs');
  const source = readFileSync(filename, 'utf8');
  assert.ok(source.includes(before));
  const changed = source
    .replace(before, after)
    .replace(
      /from ['"](\.[^'"]+)['"]/g,
      (_, specifier) => `from '${new URL(specifier, pathToFileURL(filename)).href}'`
    );
  return import(`data:text/javascript;base64,${Buffer.from(changed).toString('base64')}`);
}
test('retention mutations expose forged source classification and unknown pending evidence bypasses', async (t) => {
  const f = fixture(t);
  ordinaryWaiting(f).path = '.github/workflows/forged.yml';
  assert.deepEqual((await retainQueuePreviews({ ...f.options, apply: true })).deleted, []);
  const sourceBypass = await retentionMutation(
    'source.id === id && ordinarySource(source, repository)',
    'source.id === id'
  );
  assert.equal(
    (await sourceBypass.retainQueuePreviews({ ...f.options, apply: true })).deleted.length,
    1
  );
  const unknown = fixture(t);
  unknown.state.active = [{ id: 20 }];
  assert.deepEqual((await retainQueuePreviews({ ...unknown.options, apply: true })).deleted, []);
  const pendingBypass = await retentionMutation(
    'if (!(await ordinaryPending(options, run, repository))) return true;',
    'if (false) return true;'
  );
  assert.equal(
    (await pendingBypass.retainQueuePreviews({ ...unknown.options, apply: true })).deleted.length,
    1
  );
});
test('matching references include every queue alias beyond thirty without assumed REST pagination', async () => {
  const refs = Array.from({ length: 35 }, (_, index) => ({
    ref: `refs/heads/gh-readonly-queue/main/pr-${index}-candidate`,
    object: { sha: 'a'.repeat(40) },
  }));
  const github = { rest: { git: { listMatchingRefs: async () => ({ data: refs, headers: {} }) } } };
  assert.equal(
    (await liveQueueAliases(github, { owner: 'owner', repo: 'repo' }, previewBranchName)).length,
    35
  );
});
