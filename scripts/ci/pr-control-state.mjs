// App-pinned, immutable receipts are authority. A Markdown marker alone is never authority.
import { allPages } from './review-admission-api.mjs';
import { readAdmissionArchive } from './review-admission-archive.mjs';
import {
  expectedPublisherBot,
  requireReceiptIssuer,
  publisherConfig,
} from './review-admission-issuer.mjs';
import { requireEvidence, SHA } from './review-admission-policy.mjs';
import { CONTROL_ANCHOR, CONTROL_WORKFLOW, controlContext } from './pr-control-policy.mjs';
export async function controlRole(github, repo, actor) {
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...repo,
      username: actor.login,
    });
    return data;
  } catch (error) {
    if ([403, 404].includes(error.status)) return {};
    throw error;
  }
}
function pointerIds(pointer, repo) {
  requireEvidence(pointer.creator?.id === expectedPublisherBot(), 'Control state issuer mismatch.');
  requireEvidence(pointer.state === 'success', 'Control state pointer is not valid.');
  const prefix = `https://github.com/${repo.owner}/${repo.repo}/actions/runs/`;
  requireEvidence(
    pointer.target_url?.startsWith(prefix),
    'Control state URL is not in this repository.'
  );
  const match = /^([1-9]\d*)#artifacts\/([1-9]\d*)$/.exec(pointer.target_url.slice(prefix.length));
  requireEvidence(Boolean(match), 'Control state receipt locator is malformed.');
  return { runId: Number(match[1]), artifactId: Number(match[2]) };
}
export async function trustedControlRun(github, repo, run) {
  requireEvidence(run.path === CONTROL_WORKFLOW, 'Control receipt workflow path mismatch.');
  requireEvidence(
    run.repository?.full_name === `${repo.owner}/${repo.repo}`,
    'Control receipt repository mismatch.'
  );
  requireEvidence(run.run_attempt === 1, 'Control receipt must come from a first attempt.');
  requireEvidence(
    ['pull_request_target', 'issue_comment', 'workflow_run', 'workflow_dispatch'].includes(
      run.event
    ),
    'Control receipt event is unsupported.'
  );
  // REST run head_sha is the candidate head for pull_request_target, even though the job
  // executes trusted main. The App pin plus receipt.workflowSourceSha authenticates its policy.
  if (run.event === 'pull_request_target') return;
  const { data } = await github.rest.repos.compareCommits({
    ...repo,
    base: run.head_sha,
    head: 'main',
  });
  requireEvidence(
    ['ahead', 'identical'].includes(data.status),
    'Control workflow did not originate on trusted main history.'
  );
}
function validateState(state, repo, number, run) {
  requireReceiptIssuer(state);
  requireEvidence(
    [state.schema === 1, state.kind === 'pr-controls'].every(Boolean),
    'Control receipt schema mismatch.'
  );
  requireEvidence(
    [state.repository === `${repo.owner}/${repo.repo}`, state.number === number].every(Boolean),
    'Control receipt PR identity mismatch.'
  );
  requireEvidence(
    [state.runId === run.id, state.runAttempt === 1].every(Boolean),
    'Control receipt run identity mismatch.'
  );
  requireEvidence(
    [Number.isSafeInteger(state.commentId), state.commentId > 0].every(Boolean),
    'Control comment ID is invalid.'
  );
  requireEvidence(
    [SHA.test(state.headSha), SHA.test(state.workflowSourceSha)].every(Boolean),
    'Control source or head is invalid.'
  );
  requireEvidence(
    [typeof state.body === 'string', String(state.body).length <= 12000].every(Boolean),
    'Control body is invalid.'
  );
  requireEvidence(
    [
      Number.isSafeInteger(state.lastIntentRunNumber),
      state.lastIntentRunNumber <= run.run_number,
    ].every(Boolean),
    'Control operation ordering is invalid.'
  );
}
async function stateArtifact(github, repo, ids, number) {
  const artifacts = await allPages(github, github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: ids.runId,
    attempt_number: 1,
  });
  const matches = artifacts.filter(
    (item) => item.id === ids.artifactId && item.name === `pr-controls-${number}`
  );
  requireEvidence(matches.length === 1, 'Current control receipt is missing or ambiguous.');
  requireEvidence(
    !matches[0].expired && matches[0].size_in_bytes <= 100000,
    'Current control receipt expired or oversized.'
  );
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: ids.artifactId,
    archive_format: 'zip',
  });
  return readAdmissionArchive(Buffer.from(data), 'state');
}
function requireConfiguredControls() {
  requireEvidence(
    publisherConfig()?.queueAllowed === true,
    'Controls require the dedicated App configuration.'
  );
}
export async function currentControlState(github, repo, number, { recover = false } = {}) {
  requireConfiguredControls();
  const statuses = await allPages(github, github.rest.repos.listCommitStatusesForRef, {
    ...repo,
    ref: CONTROL_ANCHOR,
  });
  const pointer = statuses.find((item) => item.context === controlContext(number));
  if (!pointer) return null;
  const ids = pointerIds(pointer, repo);
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    ...repo,
    run_id: ids.runId,
    attempt_number: 1,
  });
  await trustedControlRun(github, repo, run);
  let state;
  try {
    state = await stateArtifact(github, repo, ids, number);
  } catch (error) {
    if (!recover) throw error;
    return recoveredPointer(pointer, run);
  }
  validateState(state, repo, number, run);
  const { data } = await github.rest.repos.compareCommits({
    ...repo,
    base: state.workflowSourceSha,
    head: 'main',
  });
  requireEvidence(
    ['ahead', 'identical'].includes(data.status),
    'Control policy source is not on trusted main history.'
  );
  return { ...state, pointerId: pointer.id };
}
export function grantForHead(state, head) {
  if (!state?.grant) return null;
  if (![state.headSha === head, state.grant.headSha === head].every(Boolean)) return null;
  return state.grant;
}
export async function currentAdmin(github, repo, actor) {
  const role = await controlRole(github, repo, actor);
  return [role.role_name === 'admin', role.user?.id === actor.id, actor.type === 'User'].every(
    Boolean
  );
}
export async function currentAdminAttestation(github, repo, number, head) {
  const state = await currentControlState(github, repo, number);
  const grant = grantForHead(state, head);
  if (!grant) return null;
  requireEvidence(Number.isSafeInteger(grant.runId), 'Admin attestation binding is malformed.');
  if (!(await currentAdmin(github, repo, grant.actor))) return null;
  return {
    provider: 'admin-attestation',
    reviewId: grant.runId,
    commit: head,
    actorId: grant.actor.id,
  };
}
function recoveredPointer(pointer, run) {
  const match = /^Control panel ([1-9]\d*)$/.exec(pointer.description);
  requireEvidence(Boolean(match), 'Cannot recover the official comment ID from the App pointer.');
  return {
    pointerId: pointer.id,
    commentId: Number(match[1]),
    grant: null,
    headSha: null,
    body: null,
    lastIntentRunNumber: run.run_number,
    result:
      'Previous state unavailable; prior attestations invalidated. Re-attest explicitly if needed.',
  };
}
