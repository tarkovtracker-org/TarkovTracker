// Trusted main-only controller. Candidate code and candidate artifacts never execute here.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readPreviewAuthorization } from '../preview/request-authorization.mjs';
import { previewControlRecord, recoveryPreviewStop } from '../preview/control-intents.mjs';
import { comparePreviewIntents } from '../preview/intent-policy.mjs';
import { allPages, queuedRefs, requirePrIdentity } from './review-admission-api.mjs';
import { controlRefreshTargets } from './pr-control-targets.mjs';
import { controlPanelEvidence } from './pr-control-panel.mjs';
import {
  CONTROL_MARKER,
  CONTROL_ANCHOR,
  CONTROL_WRITE_LIMIT,
  revocationDescription,
  controlContext,
  controlEdit,
  renderControlPanel,
  requireControlActor,
  requireControlOperation,
} from './pr-control-policy.mjs';
import {
  controlRole,
  currentControlState,
  currentAdmin,
  grantForHead,
} from './pr-control-state.mjs';
import { requireQueueIssuer } from './review-admission-issuer.mjs';
import { requireEvidence } from './review-admission-policy.mjs';
const ACTIONS_BOT = 41898282;
const EDITOR_QUERY = `query($id:ID!) { node(id:$id) { ... on IssueComment {
  fullDatabaseId body lastEditedAt editor { login ... on User { databaseId } }
} } }`;
const runUrl = (context) =>
  `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
function controlCommentEvent(context) {
  const { payload } = context;
  return [
    payload.action === 'edited',
    Boolean(payload.issue?.pull_request),
    payload.sender?.type === 'User',
    payload.changes?.body?.from?.startsWith(CONTROL_MARKER),
  ].every(Boolean);
}
function commentTargets(context) {
  return controlCommentEvent(context) ? [context.payload.issue.number] : [];
}
function directTargets(context) {
  const number =
    context.eventName === 'pull_request_target'
      ? context.payload.pull_request.number
      : Number(context.payload.inputs.pull_request);
  requireEvidence(
    [Number.isSafeInteger(number), number > 0].every(Boolean),
    'Expected a positive PR number.'
  );
  return [number];
}
export async function controlTargets({ github, context }) {
  if (context.ref !== 'refs/heads/main') return [];
  if (context.eventName === 'workflow_run') return controlRefreshTargets(github, context);
  if (context.eventName === 'issue_comment') return commentTargets(context);
  return directTargets(context);
}
// Scheduling only: uncertainty retains the protected publisher, which still revalidates in-lock.
export async function publicationTargets({ github, context, numbers, core }) {
  if (!passiveSchedulingContext(context)) return numbers;
  const retained = [];
  for (const number of numbers) {
    if (await passivePublicationNeeded(github, context, number, core)) retained.push(number);
  }
  return retained;
}
function passiveSchedulingContext(context) {
  return [
    context.ref === 'refs/heads/main',
    ['workflow_run', 'pull_request_target'].includes(context.eventName),
    context.payload.action !== 'synchronize',
  ].every(Boolean);
}
async function passivePublicationNeeded(github, context, number, core) {
  try {
    return await passivePanelChanged(github, context, number);
  } catch {
    core?.notice('Panel preflight inconclusive; retaining protected publication.');
    return true;
  }
}
async function passivePanelChanged(github, context, number) {
  const before = await controlSnapshot(github, context, number);
  if (!canPreflight(before.previous)) return true;
  const initial = schedulingSnapshot(before);
  if (await prepareState(github, context, before, { strictPreviewLookup: true })) return true;
  return passiveSnapshotChanged(github, context, number, initial, before.previous.body);
}
function canPreflight(previous) {
  return [Boolean(previous), !previous?.recovered, previous?.counter < CONTROL_WRITE_LIMIT].every(
    Boolean
  );
}
async function passiveSnapshotChanged(github, context, number, initial, body) {
  const after = await controlSnapshot(github, context, number);
  if (!isDeepStrictEqual(initial, schedulingSnapshot(after))) return true;
  if (await prepareState(github, context, after, { strictPreviewLookup: true })) return true;
  const comment = await officialComment(github, context.repo, after.previous);
  return comment.body !== body;
}
function schedulingSnapshot({ pull, previous }) {
  return {
    head: pull.head.sha,
    baseSha: pull.base.sha,
    baseRef: pull.base.ref,
    state: pull.state,
    draft: pull.draft,
    pointer: previous?.pointerId,
  };
}
async function officialComment(github, repo, state) {
  const { data } = await github.rest.issues.getComment({ ...repo, comment_id: state.commentId });
  requireEvidence(
    data.user?.id === ACTIONS_BOT && data.user.type === 'Bot',
    'Official panel is not bot-owned.'
  );
  return data;
}
async function commentOperation(github, context, previous, comment) {
  const { payload } = context;
  requireEvidence(
    payload.comment.id === previous.commentId,
    'Copied comments are not control panels.'
  );
  const live = await github.graphql(EDITOR_QUERY, { id: comment.node_id });
  const node = live.node;
  requireEvidence(
    Number(node?.fullDatabaseId) === comment.id,
    'Comment editor identity is missing.'
  );
  requireEvidence(
    node.editor?.databaseId === payload.sender.id,
    'The event sender is not the current comment editor.'
  );
  requireEvidence(node.editor.login === context.actor, 'Comment editor and workflow actor differ.');
  requireEvidence(
    node.body === payload.comment.body && node.body === comment.body,
    'The comment changed after this event.'
  );
  requireEvidence(
    Date.parse(node.lastEditedAt) === Date.parse(payload.comment.updated_at),
    'This is not the current body edit.'
  );
  return controlEdit(payload.changes.body.from, node.body, previous.body);
}
async function requestedOperation(github, context, previous, comment) {
  if (context.eventName !== 'issue_comment')
    return {
      operation: context.payload.inputs.operation,
      expectedHead: context.payload.inputs.expected_head,
    };
  return {
    operation: await commentOperation(github, context, previous, comment),
    expectedHead: previous.headSha,
  };
}
function requireEventActor(context, run) {
  const actor = context.payload.sender;
  requireEvidence(
    [context.actor === actor?.login, run.actor?.id === actor?.id].every(Boolean),
    'Workflow actor and event sender differ.'
  );
  return actor;
}
async function authenticatedRequest(github, context, previous, comment, pull, run) {
  const { operation, expectedHead } = await requestedOperation(github, context, previous, comment);
  requireControlOperation({ operation, expectedHead, pull, run, previous });
  const actor = requireEventActor(context, run);
  const permission = await controlRole(github, context.repo, actor);
  requireControlActor(actor, permission, operation === 'recheck' ? 'preview' : operation);
  return { operation, actor: { id: actor.id, login: actor.login, type: 'User' } };
}
function isIntent(context) {
  return ['issue_comment', 'workflow_dispatch'].includes(context.eventName);
}
async function validPreviousGrant(github, repo, previous, pull) {
  const grant = grantForHead(previous, pull.head.sha);
  if (!grant) return null;
  return (await currentAdmin(github, repo, grant.actor)) ? grant : null;
}
async function initialComment(github, repo, number) {
  // Recovery can adopt a bot-owned placeholder only with NO attestation; it grants no authority.
  const comments = await allPages(github, github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
  });
  const panels = comments.filter(
    (item) => item.user?.id === ACTIONS_BOT && item.body?.startsWith(CONTROL_MARKER)
  );
  requireEvidence(panels.length <= 1, 'Multiple panel placeholders require manual cleanup.');
  if (panels.length === 1) return panels[0];
  const { data } = await github.rest.issues.createComment({
    ...repo,
    issue_number: number,
    body: `${CONTROL_MARKER}\n### TarkovTracker · PR controls\nPreparing this commit’s controls…`,
  });
  return data;
}
async function applyIntent(github, context, state, request, pull, run) {
  state.lastIntentRunNumber = run.run_number;
  state.request = request;
  if (request.operation === 'approve-review')
    state.grant = {
      actor: request.actor,
      headSha: pull.head.sha,
      runId: run.id,
      runNumber: run.run_number,
    };
  if (request.operation === 'revoke-review') state.grant = null;
  if (isPreviewOperation(request.operation))
    return applyPreviewIntent(github, context, state, request, pull, run);
  return `${request.operation} accepted from @${request.actor.login}. [Request receipt](${runUrl(context)}).`;
}
async function processIntent(github, context, state, previous, comment, pull, run) {
  if (!isIntent(context)) return;
  try {
    if (context.eventName === 'issue_comment')
      requireEvidence(Boolean(previous), 'Refresh the official panel before requesting an action.');
    const request = await authenticatedRequest(github, context, previous, comment, pull, run);
    state.result = await applyIntent(github, context, state, request, pull, run);
    state.operationResult = {
      status: 'accepted',
      operation: request.operation,
      actorId: request.actor.id,
      expectedHead: pull.head.sha,
      runId: run.id,
    };
  } catch (error) {
    // Failed/old requests never replace a newer operation or create an attestation.
    state.request = null;
    state.operationResult = {
      status: 'rejected',
      reason: error.message,
      expectedHead: pull.head.sha,
      runId: run.id,
    };
    state.result = `Request rejected: ${error.message}`;
  }
}
const EMPTY_STATE = Object.freeze({
  lastIntentRunNumber: 0,
  result: 'Ready for a request.',
  pointerId: null,
  runNumber: 0,
  counter: 0,
  presentation: null,
  headSha: null,
  body: null,
  previewIntent: null,
  previewGrant: null,
  previewStop: null,
});
function nextState(context, pull, previous, comment, grant, run, source) {
  previous = previous ?? EMPTY_STATE;
  return {
    schema: 1,
    kind: 'pr-controls',
    repository: `${context.repo.owner}/${context.repo.repo}`,
    number: pull.number,
    headSha: pull.head.sha,
    commentId: comment.id,
    grant,
    lastIntentRunNumber: previous.lastIntentRunNumber,
    issuer: null,
    workflowSourceSha: source,
    runId: run.id,
    runNumber: run.run_number,
    counter: previous.counter + 1,
    runAttempt: 1,
    result: previous.result,
    request: null,
    operationResult: null,
    previewIntent: previous.previewIntent,
    previewGrant: previous.previewGrant,
    previewStop: previous.previewStop,
  };
}
async function controlSnapshot(github, context, number) {
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: Number(context.runId),
  });
  requireEvidence(
    run.run_attempt === 1,
    'Reruns do not mutate control state; create a fresh request.'
  );
  const { data: pull } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  requirePrIdentity(pull, context.repo);
  const previous = await currentControlState(github, context.repo, number, { recover: true });
  return { run, pull, previous };
}
function unrelatedComment(context, previous) {
  if (context.eventName !== 'issue_comment') return false;
  return context.payload.comment.id !== previous?.commentId;
}
async function panelComment(github, repo, previous, number) {
  return previous ? officialComment(github, repo, previous) : initialComment(github, repo, number);
}
function currentPresentation(state, pull, evidence) {
  return {
    ...evidence,
    headSha: state.headSha,
    baseSha: pull.base.sha,
    baseRef: pull.base.ref,
    grant: state.grant,
    result: state.result,
    state: pull.draft ? 'draft' : pull.state,
    terminal: state.counter >= CONTROL_WRITE_LIMIT,
  };
}
function meaningfulChange(previous, state, comment) {
  previous = previous ?? EMPTY_STATE;
  return [
    Boolean(state.operationResult),
    !isDeepStrictEqual(previous.presentation, state.presentation),
    comment.body !== previous.body,
  ].some(Boolean);
}
function refreshHeadMessage(state, previous) {
  previous = previous ?? EMPTY_STATE;
  if (previous.recovered) return;
  if (previous.headSha !== state.headSha)
    state.result = 'Current commit refreshed; admin attestations apply to one exact commit.';
}
function synchronizeGrant(grant, context, run) {
  if (!grant) return null;
  const invalidated = [
    context.eventName === 'pull_request_target',
    context.payload.action === 'synchronize',
    run.run_number > grant.runNumber,
  ].every(Boolean);
  return invalidated ? null : grant;
}
async function prepareState(github, context, snapshot, options = {}) {
  const { pull, previous, run } = snapshot;
  const comment = await panelComment(github, context.repo, previous, pull.number);
  const grant = synchronizeGrant(
    await validPreviousGrant(github, context.repo, previous, pull),
    context,
    run
  );
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const state = nextState(context, pull, previous, comment, grant, run, source);
  state.issuer = github.reviewAdmissionIssuer;
  refreshHeadMessage(state, previous);
  preserveRecoveryPreviewStop(state, previous);
  await processIntent(github, context, state, previous, comment, pull, run);
  enforceJournalBudget(state, run);
  const previewAuthorization = await readPreviewAuthorization(github, context.repo, pull.number, {
    controlState: state,
  });
  state.presentation = currentPresentation(state, pull, {
    ...(await controlPanelEvidence(github, context.repo, pull.head.sha, options)),
    previewMode: previewMode(previewAuthorization),
  });
  if (!meaningfulChange(previous, state, comment)) return null;
  state.body = renderControlPanel({ ...state.presentation, revision: randomUUID() });
  state.previousPointerId = (previous ?? EMPTY_STATE).pointerId;
  return state;
}
async function savePreparedState(state, core, evidenceDirectory) {
  if (!state) return;
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  core.setOutput('changed', 'true');
}
export async function prepareControls({
  github,
  context,
  core,
  number,
  evidenceDirectory = 'pr-control-evidence',
}) {
  requireQueueIssuer(github);
  requireEvidence(context.ref === 'refs/heads/main', 'Controls require trusted main.');
  const snapshot = await controlSnapshot(github, context, number);
  if (unrelatedComment(context, snapshot.previous)) return;
  await invalidateRecoveredState(github, context, snapshot);
  if (!journalAvailable(snapshot.previous, context, core))
    return repairExhaustedPanel(github, context.repo, snapshot.previous);
  await savePreparedState(await prepareState(github, context, snapshot), core, evidenceDirectory);
}
async function revalidateRequest(github, context, state, previous, pull) {
  if (!state.request) return;
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: Number(context.runId),
  });
  const comment = previous ? await officialComment(github, context.repo, previous) : null;
  const request = await authenticatedRequest(github, context, previous, comment, pull, run);
  requireEvidence(
    isDeepStrictEqual(request, state.request),
    'Control request changed during receipt upload.'
  );
}
export async function publishControls({
  github,
  context,
  number,
  artifactId,
  evidenceDirectory = 'pr-control-evidence',
}) {
  const state = JSON.parse(await readFile(join(evidenceDirectory, 'state.json'), 'utf8'));
  requireEvidence(
    [state.number === number, state.runId === Number(context.runId)].every(Boolean),
    'Control publication identity mismatch.'
  );
  const previous = await currentControlState(github, context.repo, number, { recover: true });
  requirePublicationRevision(previous, state);
  const { data: pull } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  requireEvidence(
    pull.head.sha === state.headSha,
    'The PR head changed while saving control evidence.'
  );
  await revalidateRequest(github, context, state, previous, pull);
  requireEvidence(
    Number.isSafeInteger(artifactId) && artifactId > 0,
    'Uploaded control artifact ID is invalid.'
  );
  await invalidateChangedGrant(github, context, previous, state, pull);
  const { data: currentPull } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: number,
  });
  requireCurrentPanelPull(currentPull, state, context.repo);
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: CONTROL_ANCHOR,
    state: 'success',
    context: controlContext(number),
    description: `Control panel ${state.commentId} revision ${state.counter}`,
    target_url: `${runUrl(context)}#artifacts/${artifactId}`,
  });
  await github.rest.issues.updateComment({
    ...context.repo,
    comment_id: state.commentId,
    body: state.body,
  });
  await recheckAfterInvalidation(github, context, previous, state, number);
  requireEvidence(state.operationResult?.status !== 'rejected', state.result);
  await executeAcceptedRequest(github, context, state, number, currentPull);
}
function requireCurrentPanelPull(pull, state, repo) {
  requireEvidence(
    pull.head.sha === state.headSha,
    'The PR head changed while saving control evidence.'
  );
  requireEvidence(
    [
      pull.base.sha === state.presentation.baseSha,
      pull.base.ref === state.presentation.baseRef,
      (pull.draft ? 'draft' : pull.state) === state.presentation.state,
    ].every(Boolean),
    'The PR base or lifecycle changed while saving control evidence.'
  );
  requirePrIdentity(pull, repo);
}
async function executeAcceptedRequest(github, context, state, number, pull) {
  if (!state.request) return;
  if (isPreviewOperation(state.request.operation)) {
    await requireCurrentRequestActor(github, context, state, pull);
    return github.rest.actions.createWorkflowDispatch({
      ...context.repo,
      workflow_id: 'preview-state.yml',
      ref: 'main',
      inputs: { pull_request: String(number) },
    });
  }
  await github.rest.actions.createWorkflowDispatch({
    ...context.repo,
    workflow_id: 'review-admission.yml',
    ref: 'main',
    inputs: { pull_request: String(number) },
  });
}
function needsGrantInvalidation(previous, state) {
  previous = previous ?? EMPTY_STATE;
  if (previous.recovered) return true;
  return [Boolean(previous.grant), !state.grant, previous.headSha === state.headSha].every(Boolean);
}
async function recheckAfterInvalidation(github, context, previous, state, number) {
  if (!needsGrantInvalidation(previous, state)) return;
  if (hasAdmissionRequest(state)) return;
  await github.rest.actions.createWorkflowDispatch({
    ...context.repo,
    workflow_id: 'review-admission.yml',
    ref: 'main',
    inputs: { pull_request: String(number) },
  });
}
async function invalidateChangedGrant(github, context, previous, state, pull) {
  if (needsGrantInvalidation(previous, state)) await invalidateRevokedGrant(github, context, pull);
}
async function invalidateRevokedGrant(github, context, pull) {
  const refs = await queuedRefs(github, context.repo, pull.number);
  const shas = new Set([pull.head.sha, ...refs.map((ref) => ref.object.sha)]);
  for (const sha of shas)
    await github.rest.repos.createCommitStatus({
      ...context.repo,
      sha,
      context: 'Review Admission',
      state: 'failure',
      description: revocationDescription(pull.number),
      target_url: runUrl(context),
    });
}
function enforceJournalBudget(state, run) {
  if (state.counter < CONTROL_WRITE_LIMIT) return;
  state.grant = null;
  const stop = previewControlRecord({
    run,
    commentId: state.commentId,
    actor: { id: 41898282, login: 'github-actions[bot]', type: 'Bot' },
    enabled: false,
  });
  state.previewIntent = stop;
  state.previewStop = stop;
  state.previewGrant = null;
  state.request = null;
  state.operationResult = {
    status: 'rejected',
    reason: 'Control journal write budget reached.',
    runId: state.runId,
    expectedHead: state.headSha,
  };
  state.result =
    'Control journal reached its 900-update limit. Admin attestations are disabled for this PR; use existing review and preview workflows.';
}
async function requireCurrentRequestActor(github, context, state, pull) {
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: pull.number,
  });
  requireEvidence(current.head.sha === state.headSha, 'PR head changed before preview dispatch.');
  const permission = await controlRole(github, context.repo, state.request.actor);
  requireControlActor(state.request.actor, permission, 'preview');
  return current;
}
function requirePublicationRevision(previous, state) {
  previous = previous ?? EMPTY_STATE;
  requireEvidence(
    previous.pointerId === state.previousPointerId,
    'A newer control receipt superseded this run.'
  );
  requireEvidence(
    state.runNumber > previous.runNumber,
    'A newer control run already committed state; this receipt cannot replace it.'
  );
}
function hasAdmissionRequest(state) {
  return ['approve-review', 'revoke-review', 'recheck'].includes(state.request?.operation);
}
function journalAvailable(previous, context, core) {
  if ((previous ?? EMPTY_STATE).counter < CONTROL_WRITE_LIMIT) return true;
  const message =
    'Control journal is exhausted for this PR; use existing review/preview workflows.';
  requireEvidence(!isIntent(context), message);
  core.notice(message);
  return false;
}
function isPreviewOperation(operation) {
  return ['preview-enable', 'preview-stop'].includes(operation);
}
function reusableControlGrant(authorization) {
  if (!authorization.latest?.request.enabled) return null;
  return controlGrant(authorization.grant);
}
function controlGrant(record) {
  return record?.kind === 'control' ? record : null;
}
async function applyPreviewIntent(github, context, state, request, pull, run) {
  const authorization = await readPreviewAuthorization(github, context.repo, pull.number);
  const enabled = request.operation === 'preview-enable';
  const record = previewControlRecord({
    run,
    commentId: state.commentId,
    actor: request.actor,
    enabled,
  });
  requirePreviewIntentFresh(authorization.latest, record);
  state.previewIntent = record;
  state.previewStop = enabled ? state.previewStop : record;
  state.previewGrant = acceptedPreviewGrant(enabled, authorization, record);
  return `Automatic PR previews ${enabled ? 'enabled' : 'stopped'}. [Request receipt](${runUrl(context)}).`;
}
function acceptedPreviewGrant(enabled, authorization, record) {
  if (!enabled) return null;
  return reusableControlGrant(authorization) ?? record;
}
function requirePreviewIntentFresh(latest, record) {
  if (!latest) return;
  requireEvidence(
    comparePreviewIntents(latest, record) >= 0,
    'A newer preview intent superseded this request.'
  );
}
function preserveRecoveryPreviewStop(state, previous) {
  if (!previous?.recovered) return;
  const stop = recoveryPreviewStop(previous);
  state.previewIntent = stop;
  state.previewStop = stop;
  state.previewGrant = null;
}
function previewMode(authorization) {
  if (!authorization.latest) return 'repository default';
  return authorization.latest.request.enabled ? 'enabled' : 'stopped';
}
async function repairExhaustedPanel(github, repo, previous) {
  const comment = await officialComment(github, repo, previous);
  const body =
    previous.body ??
    `${CONTROL_MARKER}\n### TarkovTracker · PR controls\nControls are disabled for this PR. Use provider/human review, /preview, /preview stop, or the existing manual preview workflow.`;
  if (comment.body === body) return;
  await github.rest.issues.updateComment({ ...repo, comment_id: previous.commentId, body });
}
async function invalidateRecoveredState(github, context, snapshot) {
  if (!snapshot.previous?.recovered) return;
  // A native queue only sees statuses: receipt loss must fail it before any panel/upload work.
  await invalidateRevokedGrant(github, context, snapshot.pull);
}
