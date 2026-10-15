// Trusted main-only controller. Candidate code and candidate artifacts never execute here.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { requestPreviewForHead } from '../preview/comment-request.mjs';
import { allPages, queuedRefs, requirePrIdentity } from './review-admission-api.mjs';
import { controlPanelEvidence } from './pr-control-panel.mjs';
import {
  CONTROL_MARKER,
  CONTROL_ANCHOR,
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
async function refreshTargets(github, context) {
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    ...context.repo,
    run_id: context.payload.workflow_run.id,
    attempt_number: context.payload.workflow_run.run_attempt,
  });
  requireEvidence(
    run.repository?.full_name === `${context.repo.owner}/${context.repo.repo}`,
    'Refresh source repository mismatch.'
  );
  requireEvidence(
    [
      '.github/workflows/ci.yml',
      '.github/workflows/preview.yml',
      '.github/workflows/review-admission.yml',
    ].includes(run.path),
    'Refresh source workflow mismatch.'
  );
  requireEvidence(run.status === 'completed', 'Refresh source is not completed.');
  const pulls = await allPages(github, github.rest.pulls.list, {
    ...context.repo,
    state: 'open',
    base: 'main',
  });
  requireEvidence(pulls.length <= 100, 'Too many PRs for one bounded panel refresh.');
  return pulls.map((pr) => pr.number);
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
  if (context.eventName === 'workflow_run') return refreshTargets(github, context);
  if (context.eventName === 'issue_comment') return commentTargets(context);
  return directTargets(context);
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
  if (request.operation === 'preview')
    return (await requestPreviewForHead(github, context.repo, pull)).message;
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
  presentation: null,
  headSha: null,
  body: null,
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
    runAttempt: 1,
    result: previous.result,
    request: null,
    operationResult: null,
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
    grant: state.grant,
    result: state.result,
    state: pull.draft ? 'draft' : pull.state,
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
  if (previous?.headSha !== state.headSha)
    state.result = 'Current commit refreshed; admin attestations apply to one exact commit.';
}
async function prepareState(github, context, snapshot) {
  const { pull, previous, run } = snapshot;
  const comment = await panelComment(github, context.repo, previous, pull.number);
  const grant = await validPreviousGrant(github, context.repo, previous, pull);
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const state = nextState(context, pull, previous, comment, grant, run, source);
  state.issuer = github.reviewAdmissionIssuer;
  refreshHeadMessage(state, previous);
  await processIntent(github, context, state, previous, comment, pull, run);
  state.presentation = currentPresentation(
    state,
    pull,
    await controlPanelEvidence(github, context.repo, pull.head.sha)
  );
  if (!meaningfulChange(previous, state, comment)) return null;
  state.body = renderControlPanel({ ...state.presentation, revision: randomUUID() });
  state.previousPointerId = (previous ?? EMPTY_STATE).pointerId;
  return state;
}
async function savePreparedState(state, core) {
  if (!state) return;
  await mkdir('pr-control-evidence', { recursive: true });
  await writeFile('pr-control-evidence/state.json', `${JSON.stringify(state, null, 2)}\n`);
  core.setOutput('changed', 'true');
}
export async function prepareControls({ github, context, core, number }) {
  requireQueueIssuer(github);
  requireEvidence(context.ref === 'refs/heads/main', 'Controls require trusted main.');
  const snapshot = await controlSnapshot(github, context, number);
  if (unrelatedComment(context, snapshot.previous)) return;
  await savePreparedState(await prepareState(github, context, snapshot), core);
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
export async function publishControls({ github, context, number, artifactId }) {
  const state = JSON.parse(await readFile('pr-control-evidence/state.json', 'utf8'));
  requireEvidence(
    [state.number === number, state.runId === Number(context.runId)].every(Boolean),
    'Control publication identity mismatch.'
  );
  const previous = await currentControlState(github, context.repo, number, { recover: true });
  requireEvidence(
    (previous ?? EMPTY_STATE).pointerId === state.previousPointerId,
    'A newer control receipt superseded this run.'
  );
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
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: CONTROL_ANCHOR,
    state: 'success',
    context: controlContext(number),
    description: `Control panel ${state.commentId}`,
    target_url: `${runUrl(context)}#artifacts/${artifactId}`,
  });
  await github.rest.issues.updateComment({
    ...context.repo,
    comment_id: state.commentId,
    body: state.body,
  });
  requireEvidence(state.operationResult?.status !== 'rejected', state.result);
  await requestAdmission(github, context, state, number);
}
async function requestAdmission(github, context, state, number) {
  if (!state.request) return;
  if (state.request.operation === 'preview') return;
  await github.rest.actions.createWorkflowDispatch({
    ...context.repo,
    workflow_id: 'review-admission.yml',
    ref: 'main',
    inputs: { pull_request: String(number) },
  });
}
async function invalidateChangedGrant(github, context, previous, state, pull) {
  if (!previous?.grant) return;
  if (state.grant) return;
  await invalidateRevokedGrant(github, context, pull);
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
      description: 'Admin review attestation revoked; fresh admission is required.',
      target_url: runUrl(context),
    });
}
