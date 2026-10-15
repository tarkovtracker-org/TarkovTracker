import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
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
import { controlTargets, prepareControls, publishControls } from '../ci/pr-controls.mjs';
import { requestPreviewForHead } from '../preview/comment-request.mjs';
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
  rmSync('pr-control-evidence', { recursive: true, force: true });
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
    description: 'Control panel 55',
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
        f.pointer = { ...params, id: 91, creator: { id: issuer.botId } };
        return reply(f.pointer);
      },
    },
    pulls: {
      get: () => reply(f.pull),
      list: () => reply([f.pull]),
      listFiles: () => reply([{ filename: 'app/components/Button.vue' }]),
    },
    issues: {
      getComment: () => reply(f.comment),
      listComments: () => reply([f.comment]),
      updateComment: (params) => {
        f.comments.push(params);
        f.comment.body = params.body;
        return reply(f.comment);
      },
    },
    git: { listMatchingRefs: () => reply([]) },
    checks: { listForRef: () => reply([]) },
    actions: {
      getWorkflowRun: ({ run_id }) =>
        reply(
          Number(run_id) === f.previous.runId
            ? { ...run, id: f.previous.runId, run_number: f.previous.lastIntentRunNumber + 1 }
            : f.run
        ),
      getWorkflowRunAttempt: ({ run_id, attempt_number }) => {
        assert.equal(attempt_number, 1);
        return reply(
          Number(run_id) === f.previous.runId
            ? {
                ...run,
                id: f.previous.runId,
                run_number: f.previous.lastIntentRunNumber + 1,
                run_attempt: 1,
              }
            : f.run
        );
      },
      listWorkflowRunArtifacts: ({ run_id }) =>
        reply({
          artifacts:
            Number(run_id) === f.previous.runId && f.stateAvailable
              ? [{ id: 77, name: 'pr-controls-1', expired: false, size_in_bytes: 5000 }]
              : (f.artifacts.get(Number(run_id)) ?? []),
        }),
      downloadArtifact: () => reply(zip(f.previous)),
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
    graphql: async () => ({
      node: {
        fullDatabaseId: '55',
        body: f.comment.body,
        lastEditedAt: '2026-10-15T16:00:00Z',
        editor: { databaseId: f.editor.id, login: f.editor.login },
      },
    }),
  };
  f.core = {
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
const prepare = (f) =>
  prepareControls({ github: f.github, context: f.context, core: f.core, number: 1 });
const prepared = () => JSON.parse(readFileSync('pr-control-evidence/state.json', 'utf8'));
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
  await publishControls({ github: f.github, context: f.context, number: 1, artifactId: 88 });
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
      publishControls({ github: f.github, context: f.context, number: 1, artifactId: 88 })
    );
    assert.equal(f.pointers.length, 0);
    assert.equal(f.comments.length, 0);
  }
});
test('preview operation rejects missing current successful CI and does not dispatch', async () => {
  const f = fixture('preview');
  f.github.rest.actions.listWorkflowRuns = async () => ({ data: { workflow_runs: [] } });
  await assert.rejects(requestPreviewForHead(f.github, repo, f.pull), /successful current-head CI/);
  assert.deepEqual(f.dispatches, []);
});
test('one-shot preview reuses exact CI run/attempt and never grants persistent opt-in or production deployment', async () => {
  const f = fixture('preview');
  const ci = {
    id: 40,
    run_attempt: 2,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    head_sha: head,
    head_repository: { full_name: 'example/repo' },
    head_branch: 'fix',
    status: 'completed',
    conclusion: 'success',
    pull_requests: [{ number: 1, head: { sha: head }, base: { sha: base } }],
    updated_at: '2026-10-15T15:00:00Z',
  };
  f.github.rest.actions.listWorkflowRuns = async ({ workflow_id }) => ({
    data: workflow_id === 'ci.yml' ? { workflow_runs: [ci] } : [],
  });
  f.github.rest.checks.listForRef = async () => ({
    data: [
      {
        id: 1,
        app: { id: 15368 },
        head_sha: head,
        status: 'completed',
        conclusion: 'success',
        details_url: 'https://github.com/example/repo/actions/runs/40/job/77',
      },
    ],
  });
  const result = await requestPreviewForHead(f.github, repo, f.pull);
  assert.equal(result.ciRunId, 40);
  assert.equal(f.dispatches.length, 1);
  assert.deepEqual(f.dispatches[0], {
    ...repo,
    workflow_id: 'preview.yml',
    ref: 'main',
    inputs: { run_id: '40', queue: 'false', ci_attempt: '2' },
  });
});

test('successful revocation fails head/queue admission before updating durable control state', async () => {
  const f = fixture('revoke-review');
  f.previous.grant = { actor, headSha: head, runId: 600, runNumber: 5 };
  f.github.rest.git.listMatchingRefs = async () => ({
    data: [{ ref: 'refs/heads/gh-readonly-queue/main/pr-1-aabb', object: { sha: 'd'.repeat(40) } }],
  });
  await prepare(f);
  await publishControls({ github: f.github, context: f.context, number: 1, artifactId: 88 });
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
  f.comment.body = f.previous.body;
  f.outputs = {};
  f.core.setOutput = (key, value) => {
    f.outputs[key] = value;
  };
  await prepare(f);
  assert.equal(f.outputs.changed, undefined);
  assert.equal(f.comments.length, 0);
});
test('rerunning an old source cannot resurrect a grant after the latest revoke', async () => {
  const f = fixture();
  f.previous.grant = null;
  f.github.rest.actions.getWorkflowRun = async () => ({ data: { ...f.run, run_attempt: 2 } });
  assert.equal(await currentAdminAttestation(f.github, repo, 1, head), null);
});

test('privileged controls workflow is main-only, serialized, artifact-first, and never executes candidate code', () => {
  const source = readFileSync('.github/workflows/pr-controls.yml', 'utf8');
  assert.match(source, /permissions: \{\}/);
  assert.match(source, /environment: review-admission/);
  assert.match(
    source,
    /group: review-admission-publication\n      queue: max\n      cancel-in-progress: false/
  );
  assert.equal((source.match(/ref: main/g) ?? []).length, 2);
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.match(source, /actions: write/);
  assert.match(source, /issues: write/);
  assert.match(source, /pull-requests: read/);
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
    assert.ok(!source.includes(unsafe));
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
  f.previous = { ...f.previous, grant: null, runId: 701, lastIntentRunNumber: 7 };
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
