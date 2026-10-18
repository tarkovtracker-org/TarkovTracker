import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobBlock, permissionsBlock } from './helpers/workflow-blocks.mjs';
import { readAdmissionArchive } from '../ci/review-admission-archive.mjs';
import { after, test } from 'node:test';
import { requireReviewAdmission } from '../ci/review-admission-binding.mjs';
import { admissionDecision } from '../ci/review-admission-policy.mjs';
import { currentAdminAttestation, currentControlState } from '../ci/pr-control-state.mjs';
import {
  CONTROL_ACTIONS,
  CONTROL_ANCHOR,
  CONTROL_WORKFLOW,
  controlContext,
  controlEdit,
  renderControlPanel,
  requireControlActor,
  requireControlOperation,
} from '../ci/pr-control-policy.mjs';
import { readPreviewRequest } from '../preview/request-authorization.mjs';
import { comparePreviewIntents, selectPreviewAuthorization } from '../preview/intent-policy.mjs';
import { previewBindingError } from '../preview/binding-policy.mjs';
import {
  controlTargets,
  publicationTargets,
  prepareControls,
  publishControls,
} from '../ci/pr-controls.mjs';
const EVIDENCE_DIRECTORY = mkdtempSync(join(tmpdir(), 'tt-pr-controls-test-'));
const repo = { owner: 'example', repo: 'repo' };
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const actor = { id: 22, login: 'owner', type: 'User' };
const issuer = { appId: 5328610, botId: 342940170, installationId: 171673328, queueAllowed: true };
const names = [
  'REVIEW_ADMISSION_APP_ID',
  'REVIEW_ADMISSION_BOT_ID',
  'REVIEW_ADMISSION_INSTALLATION_ID',
];
const originalEnv = names.map((name) => process.env[name]);
[issuer.appId, issuer.botId, issuer.installationId].forEach((id, index) => {
  process.env[names[index]] = String(id);
});
after(() => {
  names.forEach((name, i) => {
    if (originalEnv[i] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[i];
  });
  rmSync(EVIDENCE_DIRECTORY, { recursive: true, force: true });
});
function zip(receipt, filename = 'state.json') {
  return execFileSync(
    'python3',
    [
      '-c',
      'import io,json,sys,zipfile; d=json.load(sys.stdin); b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr(d["filename"],json.dumps(d["receipt"])); z.close(); sys.stdout.buffer.write(b.getvalue())',
    ],
    {
      input: JSON.stringify({ receipt, filename }),
      maxBuffer: 100000,
    }
  );
}
function fixture(operation = 'approve-review') {
  const run = {
    created_at: '2026-10-15T16:00:00Z',
    id: 800,
    run_attempt: 1,
    run_number: 10,
    actor,
    triggering_actor: actor,
    path: CONTROL_WORKFLOW,
    event: 'workflow_dispatch',
    head_sha: base,
    head_branch: 'main',
    repository: { full_name: 'example/repo' },
  };
  const pull = {
    number: 1,
    state: 'open',
    draft: false,
    user: actor,
    changed_files: 1,
    head: { sha: head, ref: 'fix', repo: { full_name: 'example/repo' } },
    base: { sha: base, ref: 'main', repo: { full_name: 'example/repo' } },
    merge_commit_sha: 'c'.repeat(40),
  };
  const presentation = {
    headSha: head,
    grant: null,
    checks: {},
    previewUrl: null,
    result: 'Ready.',
    state: 'open',
  };
  const previous = {
    schema: 1,
    kind: 'pr-controls',
    issuer,
    repository: 'example/repo',
    number: 1,
    headSha: head,
    commentId: 55,
    lastIntentRunNumber: 5,
    runId: 700,
    runNumber: 6,
    counter: 1,
    runAttempt: 1,
    workflowSourceSha: base,
    grant: null,
    presentation,
    result: 'Ready.',
    body: renderControlPanel({ ...presentation, revision: 'original' }),
  };
  const pointer = {
    id: 90,
    context: controlContext(1),
    creator: { id: issuer.botId },
    state: 'success',
    description: 'Control panel 55 revision 1',
    createdAt: '2026-10-15T15:00:00Z',
    target_url: 'https://github.com/example/repo/actions/runs/700#artifacts/77',
  };
  const comment = {
    id: 55,
    node_id: 'IC_55',
    user: { id: 41898282, type: 'Bot' },
    body: previous.body,
  };
  const context = {
    repo,
    ref: 'refs/heads/main',
    runId: 800,
    actor: actor.login,
    workflow: 'PR Controls',
    eventName: 'workflow_dispatch',
    payload: { sender: actor, inputs: { pull_request: '1', operation, expected_head: head } },
  };
  const f = {
    run,
    pull,
    previous,
    pointer,
    comment,
    context,
    role: 'admin',
    editor: actor,
    outputs: {},
    stateAvailable: true,
    pointers: [],
    comments: [],
    dispatches: [],
    statuses: [],
    artifacts: new Map(),
    archiveBytes: new Map(),
    runs: new Map(),
    intentComments: [],
  };
  const reply = (data) => Promise.resolve({ data });
  const rest = {
    repos: {
      compareCommits: async () => ({ data: { status: 'ahead' } }),
      listCommitStatusesForRef: (params) =>
        reply(params.ref === CONTROL_ANCHOR ? [f.pointer] : f.statuses),
      getCollaboratorPermissionLevel: () => reply({ role_name: f.role, user: f.editor }),
      createCommitStatus: (params) => {
        f.pointers.push(params);
        const status = {
          ...params,
          id: 90 + f.pointers.length,
          createdAt: f.run.created_at,
          creator: { id: issuer.botId },
        };
        if (params.context === controlContext(1)) f.pointer = status;
        else f.statuses.unshift(status);
        return reply(status);
      },
    },
    pulls: {
      get: () => reply(f.pull),
      list: () => reply([f.pull]),
      listFiles: () => reply([{ filename: 'app/components/Button.vue' }]),
    },
    issues: {
      getComment: () => reply(f.comment),
      listComments: () => reply([f.comment, ...f.intentComments]),
      updateComment: (params) => {
        f.comments.push(params);
        f.comment.body = params.body;
        return reply(f.comment);
      },
    },
    git: { listMatchingRefs: () => reply([]) },
    checks: { listForRef: () => reply([]) },
    actions: {
      getWorkflowRun: ({ run_id }) => reply(fixtureRun(f, Number(run_id))),
      getWorkflowRunAttempt: ({ run_id, attempt_number }) => {
        assert.equal(attempt_number, 1);
        return reply(fixtureRun(f, Number(run_id)));
      },
      listWorkflowRunArtifacts: ({ run_id }) =>
        reply({
          artifacts:
            Number(run_id) === f.previous.runId && f.stateAvailable
              ? [{ id: 77, name: 'pr-controls-1', expired: false, size_in_bytes: 5000 }]
              : (f.artifacts.get(Number(run_id)) ?? []),
        }),
      downloadArtifact: ({ artifact_id }) =>
        reply(f.archiveBytes.get(artifact_id) ?? zip(f.previous)),
      createWorkflowDispatch: (params) => {
        f.dispatches.push(params);
        return reply({});
      },
    },
  };
  f.github = {
    reviewAdmissionIssuer: issuer,
    rest,
    paginate: async (endpoint, params) => {
      const { data } = await endpoint(params);
      return data.artifacts ?? data;
    },
    graphql: async (query) => {
      if (query.includes('query ControlPointer'))
        return {
          repository: {
            object: {
              status: {
                context: f.pointer
                  ? {
                      ...f.pointer,
                      state: f.pointer.state.toUpperCase(),
                      targetUrl: f.pointer.target_url,
                      creator: { databaseId: f.pointer.creator.id },
                    }
                  : null,
              },
            },
          },
        };
      if (query.includes('PullRequestCommentEdits'))
        return {
          repository: {
            pullRequest: {
              comments: {
                nodes: [f.comment, ...f.intentComments].map((c) => ({
                  fullDatabaseId: String(c.id),
                  lastEditedAt: c.lastEditedAt ?? null,
                })),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        };
      return {
        node: {
          fullDatabaseId: '55',
          body: f.comment.body,
          lastEditedAt: '2026-10-15T16:00:00Z',
          editor: { databaseId: f.editor.id, login: f.editor.login },
        },
      };
    },
  };
  f.core = {
    notice: () => {},
    setOutput: (key, value) => {
      f.outputs[key] = value;
    },
  };
  f.edit = (op) => {
    context.eventName = 'issue_comment';
    comment.body = previous.body.replace(
      `- [ ] ${CONTROL_ACTIONS[op]}`,
      `- [x] ${CONTROL_ACTIONS[op]}`
    );
    context.payload = {
      action: 'edited',
      sender: actor,
      issue: { number: 1, pull_request: {} },
      changes: { body: { from: previous.body } },
      comment: { ...comment, updated_at: '2026-10-15T16:00:00Z' },
    };
  };
  return f;
}
function fixtureRun(f, id) {
  if (id === f.previous.runId)
    return { ...f.run, id, run_number: f.previous.runNumber, run_attempt: 1 };
  if (id === f.run.id) return f.run;
  return f.runs.get(id);
}
function uploaded(f, id) {
  const state = prepared();
  f.artifacts.set(state.runId, [
    { id, name: 'pr-controls-1', expired: false, size_in_bytes: 8000 },
  ]);
  f.archiveBytes.set(id, zip(state));
}
const prepare = (f) =>
  prepareControls({
    github: f.github,
    context: f.context,
    core: f.core,
    number: 1,
    evidenceDirectory: EVIDENCE_DIRECTORY,
  });
const prepared = () => JSON.parse(readFileSync(join(EVIDENCE_DIRECTORY, 'state.json'), 'utf8'));
function policyInput() {
  return {
    pr: { state: 'open', draft: false, user: actor, head: { sha: head } },
    files: [{ filename: 'docs/example.md', changes: 1, patch: '+doc' }],
    reviews: [],
    comments: [],
    checks: [],
    threads: [],
    trusted: new Set(),
    adminAttestation: {
      provider: 'admin-attestation',
      reviewId: 800,
      commit: head,
      actorId: actor.id,
    },
  };
}
test('official panel accepts exactly one checkbox and rejects all other text changes', () => {
  const f = fixture();
  for (const [operation, label] of Object.entries(CONTROL_ACTIONS)) {
    assert.equal(
      controlEdit(
        f.previous.body,
        f.previous.body.replace(`- [ ] ${label}`, `- [x] ${label}`),
        f.previous.body
      ),
      operation
    );
  }
  for (const body of [
    f.previous.body,
    f.previous.body.replace(head, base),
    f.previous.body.replaceAll('- [ ]', '- [x]'),
    `${f.previous.body}\nextra`,
  ]) {
    assert.throws(() => controlEdit(f.previous.body, body, f.previous.body));
  }
  assert.throws(
    () => controlEdit(`${f.previous.body}altered`, f.previous.body, f.previous.body),
    /stale or altered/
  );
});
test('shared authorization uses the live role of the event sender, never the bot author or association', () => {
  assert.doesNotThrow(() =>
    requireControlActor(actor, { user: actor, role_name: 'admin' }, 'approve-review')
  );
  for (const role of ['write', 'maintain', 'read'])
    assert.throws(() =>
      requireControlActor(actor, { user: actor, role_name: role }, 'approve-review')
    );
  assert.throws(() =>
    requireControlActor(
      { ...actor, type: 'Bot' },
      { user: actor, role_name: 'admin' },
      'approve-review'
    )
  );
  assert.throws(() =>
    requireControlActor(actor, { user: { id: 999 }, role_name: 'admin' }, 'preview')
  );
  assert.doesNotThrow(() =>
    requireControlActor(actor, { user: actor, role_name: 'maintain' }, 'preview')
  );
});
test('shared operations reject stale heads, drafts, reruns, different triggering actors, and superseded runs', () => {
  const f = fixture();
  const input = () => ({
    operation: 'approve-review',
    expectedHead: head,
    pull: f.pull,
    run: f.run,
    previous: f.previous,
  });
  assert.doesNotThrow(() => requireControlOperation(input()));
  for (const change of [
    () => {
      f.pull.head.sha = base;
    },
    () => {
      f.pull.draft = true;
    },
    () => {
      f.run.run_attempt = 2;
    },
    () => {
      f.run.triggering_actor = { id: 99 };
    },
    () => {
      f.previous.lastIntentRunNumber = 11;
    },
  ]) {
    const snapshot = structuredClone([f.pull, f.run, f.previous]);
    change();
    assert.throws(() => requireControlOperation(input()));
    [f.pull, f.run, f.previous] = snapshot;
  }
});
test('exact-head admin attestation is explicit and does not satisfy findings or sensitive approval', () => {
  const input = policyInput();
  assert.equal(admissionDecision(input).review.provider, 'admin-attestation');
  input.files = [{ filename: '.github/workflows/ci.yml', changes: 1, patch: '+guard' }];
  assert.throws(() => admissionDecision(input), /collaborator approval/);
  input.comments = [{ id: 9, user: actor, body: `/approve-sensitive ${head}` }];
  input.trusted.add(actor.login);
  assert.equal(admissionDecision(input).sensitiveApprovalId, 9);
  input.threads = [{ isResolved: false, isOutdated: false }];
  assert.throws(() => admissionDecision(input), /Unresolved/);
  input.threads = [];
  input.reviews = [{ id: 8, state: 'CHANGES_REQUESTED', user: actor }];
  assert.throws(() => admissionDecision(input), /Changes requested/);
});
test('unbound or malformed admin attestations cannot satisfy review', () => {
  for (const patch of [
    { commit: base },
    { actorId: null },
    { reviewId: -1 },
    { provider: 'human' },
  ]) {
    const input = policyInput();
    Object.assign(input.adminAttestation, patch);
    assert.throws(() => admissionDecision(input), /independent review/);
  }
});
test('durable state pins issuer, workflow, artifact, head, and current admin identity', async () => {
  const f = fixture();
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  assert.equal((await currentControlState(f.github, repo, 1)).commentId, 55);
  assert.equal((await currentAdminAttestation(f.github, repo, 1, head)).reviewId, 600);
  assert.equal(await currentAdminAttestation(f.github, repo, 1, base), null);
  f.role = 'maintain';
  assert.equal(await currentAdminAttestation(f.github, repo, 1, head), null);
  f.role = 'admin';
  f.editor = { ...actor, id: 99 };
  assert.equal(await currentAdminAttestation(f.github, repo, 1, head), null);
  f.pointer.creator.id = 41898282;
  await assert.rejects(currentControlState(f.github, repo, 1), /issuer/);
});
test('missing newest artifact never falls back to an earlier grant; recovery clears approval and preserves official ID', async () => {
  const f = fixture();
  f.stateAvailable = false;
  await assert.rejects(currentControlState(f.github, repo, 1), /missing/);
  const recovered = await currentControlState(f.github, repo, 1, { recover: true });
  assert.equal(recovered.grant, null);
  assert.equal(recovered.commentId, 55);
  assert.equal(recovered.lastIntentRunNumber, 6);
});
test('structured admin attestation and bot-comment checkbox produce the same exact-head grant', async () => {
  for (const edited of [false, true]) {
    const f = fixture();
    if (edited) f.edit('approve-review');
    await prepare(f);
    const state = prepared();
    assert.deepEqual(state.grant, { actor, headSha: head, runId: 800, runNumber: 10 });
    assert.equal(state.commentId, 55);
    assert.ok(state.body.includes(head));
    assert.ok(!state.body.includes('- [x]'));
    assert.equal(f.outputs.changed, 'true');
  }
});
test('copied comments and bot self-updates never execute or loop', async () => {
  const f = fixture();
  f.edit('approve-review');
  f.context.payload.comment.id = 999;
  await prepare(f);
  assert.equal(f.outputs.changed, undefined);
  f.context.payload.sender = { ...actor, type: 'Bot' };
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), []);
});
test('tampered text, stale event bodies, wrong live editors and forged associations never approve', async () => {
  for (const change of [
    (f) => {
      f.comment.body += '\nchanged';
      f.context.payload.comment.body = f.comment.body;
    },
    (f) => {
      f.context.payload.comment.updated_at = '2026-10-14T16:00:00Z';
    },
    (f) => {
      f.editor = { id: 99, login: 'intruder', type: 'User' };
    },
    (f) => {
      f.role = 'read';
      f.context.payload.comment.author_association = 'OWNER';
    },
    (f) => {
      f.context.payload.changes.body.from = f.previous.body.replace(head, base);
    },
  ]) {
    const f = fixture();
    f.edit('approve-review');
    change(f);
    await prepare(f);
    assert.equal(prepared().grant, null);
    assert.match(prepared().result, /rejected/);
  }
});
test('revocation clears the grant and older queued intent cannot resurrect it', async () => {
  const f = fixture('revoke-review');
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  await prepare(f);
  const revoked = prepared();
  assert.equal(revoked.grant, null);
  f.previous = { ...revoked, runId: 700 };
  f.pointer.description = `Control panel 55 revision ${f.previous.counter}`;
  f.run.run_number = 9;
  f.context.payload.inputs.operation = 'approve-review';
  await prepare(f);
  assert.equal(prepared().grant, null);
  assert.match(prepared().result, /superseded/);
});
test('new head or loss of admin role invalidates the old grant during passive refresh', async () => {
  for (const change of [
    (f) => {
      f.pull.head.sha = base;
    },
    (f) => {
      f.role = 'maintain';
    },
  ]) {
    const f = fixture();
    f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
    f.context.eventName = 'pull_request_target';
    change(f);
    await prepare(f);
    assert.equal(prepared().grant, null);
  }
});
test('reruns are rejected before any state or comment mutation', async () => {
  const f = fixture();
  f.run.run_attempt = 2;
  await assert.rejects(prepare(f), /Reruns/);
  assert.deepEqual(f.comments, []);
  assert.deepEqual(f.pointers, []);
});
test('publication rechecks actor and head, pins immutable artifact, and requests the existing admission gate', async () => {
  const f = fixture();
  await prepare(f);
  await publishControls({
    evidenceDirectory: EVIDENCE_DIRECTORY,
    github: f.github,
    context: f.context,
    number: 1,
    artifactId: 88,
  });
  assert.equal(f.pointers[0].sha, CONTROL_ANCHOR);
  assert.match(f.pointers[0].target_url, /800#artifacts\/88$/);
  assert.equal(f.comments[0].comment_id, 55);
  assert.equal(f.dispatches[0].workflow_id, 'review-admission.yml');
  assert.deepEqual(f.dispatches[0].inputs, { pull_request: '1' });
});
test('head/role changes during upload prevent pointer and comment publication', async () => {
  for (const change of [
    (f) => {
      f.pull.head.sha = base;
    },
    (f) => {
      f.role = 'maintain';
    },
  ]) {
    const f = fixture();
    await prepare(f);
    change(f);
    await assert.rejects(
      publishControls({
        evidenceDirectory: EVIDENCE_DIRECTORY,
        github: f.github,
        context: f.context,
        number: 1,
        artifactId: 88,
      })
    );
    assert.equal(f.pointers.length, 0);
    assert.equal(f.comments.length, 0);
  }
});
test('successful revocation fails head/queue admission before updating durable control state', async () => {
  const f = fixture('revoke-review');
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  f.github.rest.git.listMatchingRefs = async () => ({
    data: [{ ref: 'refs/heads/gh-readonly-queue/main/pr-1-aabb', object: { sha: 'd'.repeat(40) } }],
  });
  await prepare(f);
  await publishControls({
    evidenceDirectory: EVIDENCE_DIRECTORY,
    github: f.github,
    context: f.context,
    number: 1,
    artifactId: 88,
  });
  assert.deepEqual(
    f.pointers.map((item) => [item.context, item.state, item.sha]),
    [
      ['Review Admission', 'failure', head],
      ['Review Admission', 'failure', 'd'.repeat(40)],
      [controlContext(1), 'success', CONTROL_ANCHOR],
    ]
  );
});
test('controls fail closed without dedicated App configuration instead of accepting an Actions-bot forgery', async () => {
  const f = fixture();
  const values = names.map((name) => process.env[name]);
  try {
    names.forEach((name) => {
      delete process.env[name];
    });
    await assert.rejects(currentControlState(f.github, repo, 1), /dedicated App/);
  } finally {
    names.forEach((name, index) => {
      process.env[name] = values[index];
    });
  }
});
test('rendering unchanged passive state does not create another comment or receipt', async () => {
  const f = fixture();
  f.context.eventName = 'pull_request_target';
  await prepare(f);
  f.previous = { ...prepared(), runId: 700 };
  f.pointer.description = `Control panel 55 revision ${f.previous.counter}`;
  f.comment.body = f.previous.body;
  f.outputs = {};
  f.core.setOutput = (key, value) => {
    f.outputs[key] = value;
  };
  await prepare(f);
  assert.equal(f.outputs.changed, undefined);
  assert.equal(f.comments.length, 0);
});
test('a rerun cannot change the immutable first-attempt source receipt', async () => {
  const f = fixture();
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  f.github.rest.actions.getWorkflowRun = async () => ({ data: { ...f.run, run_attempt: 2 } });
  assert.equal((await currentAdminAttestation(f.github, repo, 1, head)).reviewId, 600);
  assert.equal(f.pointers.length, 0);
});
test('privileged controls workflow is main-only, serialized, artifact-first, and never executes candidate code', () => {
  const caller = readFileSync('.github/workflows/pr-controls.yml', 'utf8');
  const source = readFileSync('.github/workflows/pr-controls-publish.yml', 'utf8');
  assert.match(caller, /permissions: \{\}/);
  assert.match(source, /permissions: \{\}/);
  assert.match(source, /environment:\n      name: review-admission\n      deployment: false/);
  assert.match(
    source,
    /group: review-admission-publication\n      queue: max\n      cancel-in-progress: false/
  );
  const controls = jobBlock(source, 'controls');
  const invocation = jobBlock(caller, 'controls');
  const targets = jobBlock(caller, 'targets');
  for (const job of [targets, controls]) {
    assert.equal([...job.matchAll(/^          ref: main$/gm)].length, 1);
    assert.equal([...job.matchAll(/^          persist-credentials: false$/gm)].length, 1);
  }
  assert.match(invocation, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(controls, /github.ref == 'refs\/heads\/main'/);
  assert.match(invocation, /uses: \.\/\.github\/workflows\/pr-controls-publish.yml/);
  assert.match(invocation, /pull_request: \$\{\{ matrix.number \}\}/);
  assert.match(controls, /CONTROL_PR: \$\{\{ inputs.pull_request \}\}/);
  assert.equal(
    permissionsBlock(invocation, '    ').trim(),
    permissionsBlock(controls, '    ').trim()
  );
  assert.equal(
    permissionsBlock(controls, '    ').trim(),
    'actions: write\n      checks: read\n      contents: read\n      issues: read\n      pull-requests: write\n      statuses: read'
  );
  assert.equal(
    permissionsBlock(targets, '    ').trim(),
    'actions: read\n      checks: read\n      contents: read\n      issues: read\n      pull-requests: read\n      statuses: read'
  );
  assert.match(targets, /pull-requests: read/);
  assert.match(source, /scope: 'controls'/);
  assert.ok(
    source.indexOf('Save immutable control receipt') < source.indexOf('Commit App-pinned state')
  );
  for (const unsafe of [
    'head.sha',
    'pnpm install',
    'download-artifact@',
    'Deploy production',
    'secrets: inherit',
    'overwrite: true',
  ])
    assert.ok(!`${caller}${source}`.includes(unsafe));
});
test('enqueue consumer rejects an old green admission receipt after explicit revocation', async () => {
  const f = fixture();
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  const admissionRun = {
    id: 9,
    run_attempt: 1,
    path: '.github/workflows/review-admission.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    repository: { full_name: 'example/repo' },
    status: 'completed',
    conclusion: 'success',
  };
  const receipt = {
    schema: 1,
    issuer,
    repository: 'example/repo',
    number: 1,
    headSha: head,
    statusSha: head,
    approved: true,
    workflowSourceSha: base,
    runId: 9,
    runAttempt: 1,
    review: { provider: 'admin-attestation', reviewId: 600, commit: head, actorId: actor.id },
  };
  f.statuses = [
    {
      context: 'Review Admission',
      state: 'success',
      creator: { id: issuer.botId, type: 'Bot' },
      target_url: 'https://github.com/example/repo/actions/runs/9',
    },
  ];
  const originalRun = f.github.rest.actions.getWorkflowRun;
  const originalArtifacts = f.github.rest.actions.listWorkflowRunArtifacts;
  f.github.rest.actions.getWorkflowRun = (params) =>
    Number(params.run_id) === 9 ? Promise.resolve({ data: admissionRun }) : originalRun(params);
  f.github.rest.actions.listWorkflowRunArtifacts = (params) =>
    Number(params.run_id) === 9
      ? Promise.resolve({
          data: {
            artifacts: [
              { id: 99, name: `review-admission-${head}`, expired: false, size_in_bytes: 5000 },
            ],
          },
        })
      : originalArtifacts(params);
  f.github.rest.actions.downloadArtifact = async ({ artifact_id }) => ({
    data: artifact_id === 99 ? zip(receipt, `${head}.json`) : zip(f.previous),
  });
  assert.equal(
    (await requireReviewAdmission({ github: f.github, repo, head, number: 1 })).approved,
    true
  );
  f.previous = { ...f.previous, grant: null, runId: 701, runNumber: 7, lastIntentRunNumber: 7 };
  f.pointer = {
    ...f.pointer,
    id: 91,
    target_url: 'https://github.com/example/repo/actions/runs/701#artifacts/77',
  };
  await assert.rejects(
    requireReviewAdmission({ github: f.github, repo, head, number: 1 }),
    /revoked/
  );
  receipt.review = { provider: 'Cubic', reviewId: 23, commit: head };
  assert.equal(
    (await requireReviewAdmission({ github: f.github, repo, head, number: 1 })).review.provider,
    'Cubic'
  );
});
test('pull_request_target receipt trusts the protected main policy source, not REST candidate head_sha', async () => {
  const f = fixture();
  const original = f.github.rest.actions.getWorkflowRunAttempt;
  f.github.rest.actions.getWorkflowRunAttempt = async (params) => {
    const { data } = await original(params);
    return {
      data: {
        ...data,
        event: 'pull_request_target',
        head_sha: 'f'.repeat(40),
        head_branch: 'feature',
      },
    };
  };
  f.github.rest.repos.compareCommits = async ({ base: candidate }) => {
    assert.notEqual(candidate, 'f'.repeat(40));
    return { data: { status: 'ahead' } };
  };
  assert.equal((await currentControlState(f.github, repo, 1)).commentId, 55);
});
test('a push away and back to the reviewed SHA still invalidates the previous attestation', async () => {
  const f = fixture();
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  f.context.eventName = 'pull_request_target';
  f.context.payload.action = 'synchronize';
  await prepare(f);
  assert.equal(prepared().grant, null);
});
test('an older queued run keeps a rejection receipt but cannot overwrite newer durable state', async () => {
  const f = fixture();
  f.previous.runNumber = 11;
  f.previous.lastIntentRunNumber = 11;
  await prepare(f);
  assert.equal(prepared().operationResult.status, 'rejected');
  await assert.rejects(
    publishControls({
      evidenceDirectory: EVIDENCE_DIRECTORY,
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 88,
    }),
    /newer control run/
  );
  assert.equal(f.pointers.length, 0);
  assert.equal(f.comments.length, 0);
});
test('confirmed missing state invalidates native admission before publishing the recovered empty grant', async () => {
  const f = fixture();
  f.stateAvailable = false;
  f.context.eventName = 'pull_request_target';
  await prepare(f);
  assert.equal(prepared().grant, null);
  await publishControls({
    evidenceDirectory: EVIDENCE_DIRECTORY,
    github: f.github,
    context: f.context,
    number: 1,
    artifactId: 88,
  });
  assert.equal(f.pointers[0].context, 'Review Admission');
  assert.equal(f.pointers[0].state, 'failure');
  assert.equal(f.pointers.at(-1).context, controlContext(1));
});
test('transient artifact API failures do not recover, clear a grant, or mutate the panel', async () => {
  for (const endpoint of ['listWorkflowRunArtifacts', 'downloadArtifact']) {
    const f = fixture();
    f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
    f.github.rest.actions[endpoint] = async () => {
      throw Object.assign(new Error('Transient API failure'), { status: 503 });
    };
    await assert.rejects(prepare(f), /Transient API failure/);
    assert.equal(f.previous.grant.runId, 600);
    assert.equal(f.pointers.length, 0);
    assert.equal(f.outputs.changed, undefined);
  }
});
test('archive validation rejects extra whitespace-named members', async () => {
  const bytes = execFileSync('python3', [
    '-c',
    'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("state.json","{}"); z.writestr(" ","extra"); z.close(); sys.stdout.buffer.write(b.getvalue())',
  ]);
  await assert.rejects(readAdmissionArchive(bytes, 'state'), /exactly the expected receipt/);
});
test('completed CI refreshes only its associated PR and main push refreshes none', async () => {
  const f = fixture();
  f.context.eventName = 'workflow_run';
  f.context.payload = { workflow_run: { id: 800, run_attempt: 1 } };
  Object.assign(f.run, {
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    pull_requests: [{ number: 1 }],
  });
  f.github.rest.pulls.list = async () =>
    assert.fail('A source run must not enumerate every open PR.');
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), [1]);
  f.run.event = 'push';
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), []);
});
test('completed preview resolves its source CI and admission resolves only its bounded locator', async () => {
  const f = fixture();
  f.context.eventName = 'workflow_run';
  f.context.payload = { workflow_run: { id: 800, run_attempt: 1 } };
  Object.assign(f.run, {
    path: '.github/workflows/preview.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    display_title: 'Preview CI 40 request 55',
  });
  f.github.rest.actions.getWorkflowRun = async () => ({
    data: {
      id: 40,
      path: '.github/workflows/ci.yml',
      event: 'pull_request',
      repository: { full_name: 'example/repo' },
      pull_requests: [{ number: 1 }],
    },
  });
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), [1]);
  f.run.path = '.github/workflows/review-admission.yml';
  f.github.rest.actions.listWorkflowRunArtifacts = async () => ({
    data: {
      artifacts: [
        { id: 51, name: 'review-admission-target-1', expired: false, size_in_bytes: 1000 },
      ],
    },
  });
  f.github.rest.actions.downloadArtifact = async () => ({
    data: zip({ repository: 'example/repo', number: 1, runId: 800, runAttempt: 1 }, 'target.json'),
  });
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), [1]);
});
test('a failed journal publication after revocation cannot revive the old grant on a fresh admission decision', async () => {
  const f = fixture('revoke-review');
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  await prepare(f);
  const original = f.github.rest.repos.createCommitStatus;
  f.github.rest.repos.createCommitStatus = (params) => {
    if (params.context === controlContext(1))
      throw new Error('Injected journal publication failure');
    return original(params);
  };
  await assert.rejects(
    publishControls({
      evidenceDirectory: EVIDENCE_DIRECTORY,
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 88,
    }),
    /Injected/
  );
  assert.equal(f.pointer.id, 90);
  assert.equal(f.previous.grant.runId, 600);
  f.statuses.unshift({
    context: 'Review Admission',
    state: 'pending',
    creator: { id: issuer.botId },
    target_url: 'https://github.com/example/repo/actions/runs/999',
  });
  const input = policyInput();
  input.adminAttestation = await currentAdminAttestation(f.github, repo, 1, head);
  assert.equal(input.adminAttestation, null);
  assert.throws(() => admissionDecision(input), /independent review/);
});
test('journal lookup uses one named context and never scans every PR history', async () => {
  const f = fixture();
  f.github.rest.repos.listCommitStatusesForRef = async () =>
    assert.fail('Journal reads must use the exact GraphQL context.');
  assert.equal((await currentControlState(f.github, repo, 1)).counter, 1);
});
test('the reserved final journal revision disables attestations before GitHub status exhaustion', async () => {
  const f = fixture();
  f.previous.counter = 899;
  f.pointer.description = 'Control panel 55 revision 899';
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  await prepare(f);
  const state = prepared();
  assert.equal(state.counter, 900);
  assert.equal(state.grant, null);
  assert.ok(!state.body.includes('- [ ]'));
  assert.match(state.result, /900-update limit/);
  await assert.rejects(
    publishControls({
      evidenceDirectory: EVIDENCE_DIRECTORY,
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 88,
    }),
    /900-update limit/
  );
  assert.equal(f.pointers[0].context, 'Review Admission');
  assert.equal(f.pointers.at(-1).description, 'Control panel 55 revision 900');
});
test('head or actor changes after upload prevent preview dispatch, including after the state pointer step', async () => {
  for (const change of [
    (f) => {
      f.pull.head.sha = base;
    },
    (f) => {
      f.role = 'read';
    },
  ]) {
    const f = fixture('preview-enable');
    await prepare(f);
    assert.equal(f.dispatches.length, 0);
    const original = f.github.rest.issues.updateComment;
    f.github.rest.issues.updateComment = (params) => {
      const result = original(params);
      change(f);
      return result;
    };
    await assert.rejects(
      publishControls({
        evidenceDirectory: EVIDENCE_DIRECTORY,
        github: f.github,
        context: f.context,
        number: 1,
        artifactId: 88,
      })
    );
    assert.equal(f.dispatches.length, 0);
  }
});
test('new-head refresh preserves independently valid admission instead of revoking another revision', async () => {
  const f = fixture();
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  f.pull.head.sha = base;
  f.context.eventName = 'pull_request_target';
  await prepare(f);
  await publishControls({
    evidenceDirectory: EVIDENCE_DIRECTORY,
    github: f.github,
    context: f.context,
    number: 1,
    artifactId: 88,
  });
  assert.ok(f.pointers.every((status) => status.context !== 'Review Admission'));
});
test('a newer rejected request also prevents an older accepted intent from committing state', async () => {
  const f = fixture();
  f.previous.runNumber = 11;
  f.previous.lastIntentRunNumber = 5;
  await prepare(f);
  assert.equal(prepared().operationResult.status, 'accepted');
  await assert.rejects(
    publishControls({
      evidenceDirectory: EVIDENCE_DIRECTORY,
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 88,
    }),
    /newer control run/
  );
  assert.equal(f.pointers.length, 0);
  assert.equal(f.dispatches.length, 0);
});
test('the actual first-attempt endpoint rejects a mismatched rerun receipt while a grant exists', async () => {
  const f = fixture();
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  const original = f.github.rest.actions.getWorkflowRunAttempt;
  f.github.rest.actions.getWorkflowRunAttempt = async (params) => {
    assert.equal(params.attempt_number, 1);
    const { data } = await original(params);
    return { data: { ...data, run_attempt: 2 } };
  };
  await assert.rejects(currentControlState(f.github, repo, 1), /first attempt/);
  assert.equal(f.previous.grant.runId, 600);
  assert.equal(f.pointers.length, 0);
});
async function commitPreviewIntent(f, operation, id, timestamp) {
  f.runs.set(f.run.id, structuredClone(f.run));
  Object.assign(f.run, { id, run_number: id - 790, created_at: timestamp });
  f.context.runId = id;
  f.context.eventName = 'workflow_dispatch';
  f.context.payload = {
    sender: actor,
    inputs: { pull_request: '1', operation, expected_head: f.pull.head.sha },
  };
  await prepare(f);
  assert.equal(prepared().operationResult.status, 'accepted');
  uploaded(f, id + 1000);
  await publishControls({
    github: f.github,
    context: f.context,
    number: 1,
    artifactId: id + 1000,
    evidenceDirectory: EVIDENCE_DIRECTORY,
  });
  return prepared();
}
function legacyPreview(id, enabled, at) {
  return {
    id,
    body: enabled ? '/preview' : '/preview stop',
    created_at: at,
    user: actor,
    author_association: 'OWNER',
  };
}
test('Enable and Stop persist across commits; stop/re-enable cannot revive an earlier deployment binding', async () => {
  const f = fixture('preview-enable');
  const enabled = await commitPreviewIntent(f, 'preview-enable', 800, '2026-10-15T16:00:00Z');
  assert.equal(enabled.previewGrant.request.controlRunId, 800);
  assert.equal(f.dispatches.at(-1).workflow_id, 'preview-state.yml');
  assert.deepEqual(f.dispatches.at(-1).inputs, { pull_request: '1' });
  let request = await readPreviewRequest(f.github, repo, 1);
  assert.equal(request.enabled, true);
  assert.equal(request.controlRunId, 800);
  f.pull.head.sha = base;
  request = await readPreviewRequest(f.github, repo, 1);
  assert.equal(request.controlRunId, 800);
  const stopped = await commitPreviewIntent(f, 'preview-stop', 801, '2026-10-15T16:01:00Z');
  assert.equal(stopped.previewGrant, null);
  assert.equal((await readPreviewRequest(f.github, repo, 1)).enabled, false);
  await commitPreviewIntent(f, 'preview-enable', 802, '2026-10-15T16:02:00Z');
  request = await readPreviewRequest(f.github, repo, 1, 55);
  assert.equal(request.controlRunId, 802);
  assert.match(
    previewBindingError({ request_comment_id: '55', request_control_run_id: '800' }, request),
    /superseded/
  );
  assert.equal(
    previewBindingError({ request_comment_id: '55', request_control_run_id: '802' }, request),
    null
  );
});
test('repeated Enable preserves the oldest continuous grant and a legacy Stop revokes it', async () => {
  const f = fixture('preview-enable');
  await commitPreviewIntent(f, 'preview-enable', 800, '2026-10-15T16:00:00Z');
  await commitPreviewIntent(f, 'preview-enable', 801, '2026-10-15T16:01:00Z');
  assert.equal((await readPreviewRequest(f.github, repo, 1, 55)).controlRunId, 800);
  f.intentComments.push(legacyPreview(99, false, '2026-10-15T16:02:00Z'));
  assert.equal((await readPreviewRequest(f.github, repo, 1, 55)).enabled, false);
  await commitPreviewIntent(f, 'preview-enable', 802, '2026-10-15T16:03:00Z');
  assert.equal((await readPreviewRequest(f.github, repo, 1, 55)).controlRunId, 802);
});
test('newer legacy Enable wins over a control Stop, but an older queued control cannot override it', async () => {
  const f = fixture('preview-stop');
  await commitPreviewIntent(f, 'preview-stop', 800, '2026-10-15T16:00:00Z');
  f.intentComments.push(legacyPreview(99, true, '2026-10-15T16:02:00Z'));
  assert.equal((await readPreviewRequest(f.github, repo, 1)).commentId, 99);
  f.runs.set(f.run.id, structuredClone(f.run));
  Object.assign(f.run, { id: 801, run_number: 11, created_at: '2026-10-15T16:01:00Z' });
  f.context.runId = 801;
  f.context.payload.inputs.operation = 'preview-stop';
  await prepare(f);
  assert.equal(prepared().operationResult.status, 'rejected');
  assert.match(prepared().result, /newer preview intent/);
  assert.equal((await readPreviewRequest(f.github, repo, 1)).commentId, 99);
});
test('live loss of maintainer authority revokes an Enable and an accepted Stop survives role loss', async () => {
  const f = fixture('preview-enable');
  await commitPreviewIntent(f, 'preview-enable', 800, '2026-10-15T16:00:00Z');
  f.role = 'read';
  assert.equal((await readPreviewRequest(f.github, repo, 1)).enabled, false);
  f.role = 'admin';
  await commitPreviewIntent(f, 'preview-stop', 801, '2026-10-15T16:01:00Z');
  f.role = 'read';
  assert.equal((await readPreviewRequest(f.github, repo, 1)).enabled, false);
});
test('long-lived exhausted and expired journals stop old grants while allowing a fresh legacy opt-in', async () => {
  const f = fixture('preview-enable');
  f.intentComments.push(legacyPreview(98, true, '2026-10-15T15:00:00Z'));
  f.previous.counter = 899;
  f.pointer.description = 'Control panel 55 revision 899';
  await prepare(f);
  assert.equal(prepared().previewIntent.request.enabled, false);
  uploaded(f, 1800);
  await assert.rejects(
    publishControls({
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 1800,
      evidenceDirectory: EVIDENCE_DIRECTORY,
    }),
    /900-update limit/
  );
  assert.equal((await readPreviewRequest(f.github, repo, 1)).enabled, false);
  f.artifacts.set(800, []); // Confirmed artifact expiry/deletion never resets the journal budget.
  assert.equal((await currentControlState(f.github, repo, 1, { recover: true })).counter, 900);
  assert.equal((await readPreviewRequest(f.github, repo, 1)).enabled, false);
  f.intentComments.push(legacyPreview(99, true, '2026-10-15T16:02:00Z'));
  assert.equal((await readPreviewRequest(f.github, repo, 1)).commentId, 99);
  assert.equal((await readPreviewRequest(f.github, repo, 1, 98)).enabled, false);
  f.role = 'read';
  assert.equal((await readPreviewRequest(f.github, repo, 1)).enabled, false);
});
test('Preview State completion refreshes exactly its named PR and never fans out', async () => {
  const f = fixture();
  f.context.eventName = 'workflow_run';
  f.context.payload = { workflow_run: { id: 800, run_attempt: 1 } };
  Object.assign(f.run, {
    path: '.github/workflows/preview-state.yml',
    status: 'completed',
    display_title: 'Preview State PR 1',
  });
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), [1]);
  f.run.event = 'pull_request_target';
  assert.deepEqual(await controlTargets({ github: f.github, context: f.context }), []);
});
test('revocation proof belongs to the specific PR even when two PRs share a head SHA', async () => {
  const f = fixture('revoke-review');
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  await prepare(f);
  f.github.rest.repos.createCommitStatus = async (params) => {
    if (params.context === controlContext(1)) throw new Error('Injected pointer failure');
    f.statuses.unshift({ ...params, creator: { id: issuer.botId } });
    return { data: {} };
  };
  await assert.rejects(
    publishControls({
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 88,
      evidenceDirectory: EVIDENCE_DIRECTORY,
    }),
    /Injected/
  );
  const revocation = f.statuses[0];
  assert.match(revocation.description, /PR #1/);
  revocation.description = revocation.description.replace('PR #1', 'PR #2');
  assert.equal((await currentAdminAttestation(f.github, repo, 1, head)).reviewId, 600);
  revocation.description = revocation.description.replace('PR #2', 'PR #1');
  assert.equal(await currentAdminAttestation(f.github, repo, 1, head), null);
});
test('a failed terminal comment update can be repaired without another journal write or renewed actions', async () => {
  const f = fixture();
  f.previous.counter = 899;
  f.pointer.description = 'Control panel 55 revision 899';
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  await prepare(f);
  const terminal = prepared();
  uploaded(f, 1800);
  const original = f.github.rest.issues.updateComment;
  f.github.rest.issues.updateComment = async () => {
    throw new Error('Injected comment failure');
  };
  await assert.rejects(
    publishControls({
      github: f.github,
      context: f.context,
      number: 1,
      artifactId: 1800,
      evidenceDirectory: EVIDENCE_DIRECTORY,
    }),
    /Injected/
  );
  assert.equal(f.pointer.description, 'Control panel 55 revision 900');
  assert.ok(f.comment.body.includes('- [ ]'));
  const writes = f.pointers.length;
  f.runs.set(800, structuredClone(f.run));
  Object.assign(f.run, { id: 801, run_number: 11 });
  f.context.runId = 801;
  f.context.eventName = 'pull_request_target';
  f.github.rest.issues.updateComment = original;
  f.outputs = {};
  await prepare(f);
  assert.equal(f.comment.body, terminal.body);
  assert.match(f.comment.body, /Controls are disabled/);
  assert.ok(!f.comment.body.includes('- [ ]'));
  assert.equal(f.outputs.changed, undefined);
  assert.equal(f.pointers.length, writes);
});
test('a cross-source timestamp tie favors Stop and same-source ties follow server sequence', () => {
  const record = (kind, sequence, enabled) => ({
    kind,
    sequence,
    key: `${kind}-${sequence}`,
    at: '2026-10-15T16:00:00Z',
    request: { enabled },
  });
  for (const [left, right] of [
    [record('control', 10, true), record('comment', 99, false)],
    [record('comment', 99, true), record('control', 10, false)],
  ]) {
    assert.equal(selectPreviewAuthorization([left, right]).latest.request.enabled, false);
    assert.equal(selectPreviewAuthorization([right, left]).grant, null);
  }
  assert.ok(comparePreviewIntents(record('control', 11, true), record('control', 10, false)) < 0);
});
test('confirmed receipt loss fails native head/group admission before panel or artifact preparation can fail', async () => {
  for (const failure of ['panel-read', 'artifact-storage']) {
    const f = fixture();
    f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
    f.stateAvailable = false;
    f.context.eventName = 'pull_request_target';
    const queueSha = 'd'.repeat(40);
    f.github.rest.git.listMatchingRefs = async () => ({
      data: [
        {
          ref: 'refs/heads/gh-readonly-queue/main/pr-1-aabb',
          object: { sha: queueSha },
        },
      ],
    });
    const blocker = join(EVIDENCE_DIRECTORY, 'blocked-recovery-artifact');
    writeFileSync(blocker, 'fixture');
    if (failure === 'panel-read')
      f.github.rest.issues.getComment = async () => {
        throw new Error('Injected panel read failure');
      };
    await assert.rejects(
      prepareControls({
        github: f.github,
        context: f.context,
        core: f.core,
        number: 1,
        evidenceDirectory: blocker,
      })
    );
    assert.deepEqual(
      f.pointers.map(({ context, state, sha }) => [context, state, sha]),
      [
        ['Review Admission', 'failure', head],
        ['Review Admission', 'failure', queueSha],
      ]
    );
    assert.equal(f.pointer.id, 90); // No replacement journal pointer was uploaded or published.
    assert.equal(f.outputs.changed, undefined);
    assert.equal(f.comments.length, 0);
    await assert.rejects(currentAdminAttestation(f.github, repo, 1, head), /missing/);
  }
});
async function passiveFixture() {
  const f = fixture();
  f.context.eventName = 'pull_request_target';
  f.context.payload.action = 'edited';
  await prepare(f);
  f.previous = { ...prepared(), runId: 700 };
  f.pointer.description = `Control panel 55 revision ${f.previous.counter}`;
  f.comment.body = f.previous.body;
  delete f.github.reviewAdmissionIssuer;
  return f;
}
const eligible = (f) => publicationTargets({ github: f.github, context: f.context, numbers: [1] });
test('read-only preflight skips a verified unchanged panel before obtaining any publisher identity', async () => {
  const f = await passiveFixture();
  assert.deepEqual(await eligible(f), []);
  assert.deepEqual([f.pointers, f.comments, f.dispatches], [[], [], []]);
});
test('preflight retains changed head, base, draft, gates, comment body and missing or forged receipt', async () => {
  const changes = [
    (f) => {
      f.pull.head.sha = 'd'.repeat(40);
    },
    (f) => {
      f.pull.base.sha = 'e'.repeat(40);
    },
    (f) => {
      f.pull.draft = true;
    },
    (f) => {
      f.statuses = [{ context: 'Preview Result', state: 'pending', creator: { id: 41898282 } }];
    },
    (f) => {
      f.comment.body += ' changed';
    },
    (f) => {
      f.stateAvailable = false;
    },
    (f) => {
      f.pointer.creator.id = 999;
    },
    (f) => {
      f.run.run_attempt = 2;
    },
    (f) => {
      f.github.rest.pulls.get = async () => {
        throw new Error('API unavailable');
      };
    },
  ];
  for (const change of changes) {
    const f = await passiveFixture();
    change(f);
    assert.deepEqual(await eligible(f), [1]);
    assert.deepEqual([f.pointers, f.comments, f.dispatches], [[], [], []]);
  }
});
test('all explicit operations, checkbox edits, unknown events and untrusted refs bypass preflight reads', async () => {
  for (const eventName of ['issue_comment', 'workflow_dispatch', 'future_event']) {
    const f = fixture();
    f.context.eventName = eventName;
    let reads = 0;
    f.github.rest.pulls.get = () => {
      reads++;
      throw new Error('must not be read');
    };
    assert.deepEqual(await eligible(f), [1]);
    assert.equal(reads, 0);
  }
  for (const change of [
    (f) => {
      f.context.ref = 'refs/heads/topic';
    },
    (f) => {
      f.context.payload.action = 'synchronize';
    },
  ]) {
    const f = fixture();
    f.context.eventName = 'pull_request_target';
    change(f);
    let reads = 0;
    f.github.rest.pulls.get = () => {
      reads++;
      throw new Error('must not be read');
    };
    assert.deepEqual(await eligible(f), [1]);
    assert.equal(reads, 0);
  }
});
test('preflight rechecks live head/base, pointer and gates across concurrent observations', async () => {
  for (const change of [
    (f) => {
      f.pull.head.sha = 'd'.repeat(40);
    },
    (f) => {
      f.pull.base.sha = 'e'.repeat(40);
    },
    (f) => {
      f.pointer.id = 999;
    },
    (f) => {
      f.statuses = [{ context: 'Preview Result', state: 'pending', creator: { id: 41898282 } }];
    },
  ]) {
    const f = await passiveFixture();
    const get = f.github.rest.pulls.get;
    let reads = 0;
    f.github.rest.pulls.get = async (...args) => {
      if (++reads === 2) change(f);
      const { data } = await get(...args);
      return { data: structuredClone(data) };
    };
    assert.deepEqual(await eligible(f), [1]);
    assert.deepEqual([f.pointers, f.comments, f.dispatches], [[], [], []]);
  }
});
test('a verified early skip does not replace the protected publisher revalidation after a later change', async () => {
  const f = await passiveFixture();
  assert.deepEqual(await eligible(f), []);
  f.pull.base.sha = 'e'.repeat(40);
  assert.deepEqual(await eligible(f), [1]);
  f.github.reviewAdmissionIssuer = issuer;
  await prepare(f);
  assert.equal(prepared().presentation.baseSha, f.pull.base.sha);
});
test('modeled observed body-edit and ready burst saves only the verified redundant publication', async () => {
  const f = await passiveFixture();
  f.pull.draft = true;
  f.github.reviewAdmissionIssuer = issuer;
  await prepare(f);
  f.previous = { ...prepared(), runId: 700 };
  f.pointer.description = `Control panel 55 revision ${f.previous.counter}`;
  f.comment.body = f.previous.body;
  delete f.github.reviewAdmissionIssuer;
  const bodyEdit = (await eligible(f)).length;
  f.pull.draft = false;
  f.context.payload.action = 'ready_for_review';
  const ready = (await eligible(f)).length;
  // Admission is a distinct security evaluator and is deliberately outside this optimization.
  const admission = 1;
  const modeled = { baselineEligible: 3, optimizedEligible: bodyEdit + ready + admission };
  assert.deepEqual(modeled, { baselineEligible: 3, optimizedEligible: 2 });
  if (process.env.TT_CONTROL_MEASUREMENTS) console.log('MODELED_17_03_SEQUENCE', modeled);
});
test('modeled stable refreshes skip publication while concurrent changed snapshots remain eligible', async () => {
  const f = await passiveFixture();
  let eligibleCount = 0;
  for (let index = 0; index < 8; index++) eligibleCount += (await eligible(f)).length;
  assert.equal(eligibleCount, 0);
  f.pull.base.sha = 'e'.repeat(40);
  for (let index = 0; index < 3; index++) assert.deepEqual(await eligible(f), [1]);
  // No receipt was committed between these observations: all three retain final revalidation.
  if (process.env.TT_CONTROL_MEASUREMENTS)
    console.log('MODELED_STABLE_AND_CONCURRENT', {
      stableBaseline: 8,
      stableOptimized: 0,
      changedBaseline: 3,
      changedOptimized: 3,
    });
});
