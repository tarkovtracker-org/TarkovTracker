import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyPaths } from '../validation-plan.mjs';
import { extractZip } from './archive.mjs';
import { digestDirectory, manifestShapeErrors } from './manifest.mjs';
import {
  ciResultCheck,
  downloadArtifact,
  findLatestPullRun,
  findPreviewArtifact,
  findPullForHead,
  getPull,
  getRun,
  isCiRun,
  latestStatus,
  listPullPaths,
  allStatuses,
  publishStatus,
} from './github-api.mjs';
import {
  MANIFEST_FILE,
  PREVIEW_PROFILE_VERSION,
  PRODUCTION_BRANCH,
  previewAppUrl,
  previewBranchName,
} from './profile.mjs';
// Trusted preview controller. Everything here loads from the default branch and treats candidate
// artifacts, workflow payloads, and manifests as claims to verify against live GitHub state.
export const ENVIRONMENTS = { internal: 'preview', fork: 'preview-fork' };
const SHA_PATTERN = /^[0-9a-f]{40}$/;
class Outcome extends Error {
  constructor(action, state, description) {
    super(description);
    this.action = action;
    this.state = state;
  }
}
const ignore = (reason) => new Outcome('ignore', null, reason);
const pending = (reason) => new Outcome('wait', 'pending', reason);
const failure = (reason) => new Outcome('fail', 'failure', reason);
export function successMarker(digest) {
  return `[preview ${digest.slice(0, 12)} v${PREVIEW_PROFILE_VERSION}]`;
}
function repoName(context) {
  return `${context.repo.owner}/${context.repo.repo}`;
}
/** The first pull request number of a run, or the pull request number itself, or null. */
function pullRequestNumber(pull) {
  return pull?.number ?? null;
}
function optional(value, key) {
  return value?.[key] ?? null;
}
function firstRunId(candidate, run) {
  if (run?.id !== undefined) return run.id;
  return optional(candidate, 'runId');
}
function attemptOf(run) {
  return optional(run, 'run_attempt');
}
function orNa(value) {
  return value ?? 'n/a';
}
function runUrl(context) {
  return `${context.serverUrl}/${repoName(context)}/actions/runs/${context.runId}`;
}
/* ------------------------------------------------------------------------------------------ */
/* Candidate resolution                                                                        */
/* ------------------------------------------------------------------------------------------ */
function firstNumber(value) {
  return value?.[0]?.number ?? null;
}
function candidateFromRun(run, context) {
  if (!isCiRun(run)) throw ignore('Not a pull request or dispatched CI run.');
  if (run.head_branch === PRODUCTION_BRANCH) throw ignore('Production branch runs never deploy.');
  return {
    runId: run.id,
    runEvent: run.event,
    headSha: run.head_sha,
    headBranch: run.head_branch,
    headRepo: run.head_repository?.full_name,
    baseBranch: PRODUCTION_BRANCH,
    pullRequest: firstNumber(run.pull_requests),
    repositoryId: context.payload.repository.id,
  };
}
function candidateFromPullEvent(context) {
  const pull = context.payload.pull_request;
  if (pull.base.ref !== PRODUCTION_BRANCH) throw ignore('Only pull requests into main deploy.');
  if (context.payload.action === 'closed') throw ignore('Closed pull request.');
  return {
    runId: null,
    runEvent: 'pull_request',
    headSha: pull.head.sha,
    headBranch: pull.head.ref,
    headRepo: pull.head.repo?.full_name,
    baseBranch: PRODUCTION_BRANCH,
    pullRequest: pull.number,
    repositoryId: context.payload.repository.id,
  };
}
function requestedRunId(inputs) {
  const runId = Number(inputs?.run_id);
  return Number.isInteger(runId) && runId > 0 ? runId : null;
}
async function candidateFromDispatch(github, context, inputs) {
  if (context.ref !== `refs/heads/${PRODUCTION_BRANCH}`)
    throw ignore('Manual reruns must dispatch from the default branch.');
  const runId = requestedRunId(inputs);
  if (!runId) throw failure('A numeric CI run id is required.');
  return candidateFromRun(await getRun(github, context.repo, runId), context);
}
async function resolveCandidate({ github, context, inputs }) {
  if (context.eventName === 'workflow_run')
    return candidateFromRun(context.payload.workflow_run, context);
  if (context.eventName === 'pull_request_target') return candidateFromPullEvent(context);
  if (context.eventName === 'workflow_dispatch')
    return candidateFromDispatch(github, context, inputs);
  throw ignore(`Unsupported event ${context.eventName}.`);
}
/* ------------------------------------------------------------------------------------------ */
/* Live state                                                                                  */
/* ------------------------------------------------------------------------------------------ */
async function resolvePull(github, context, candidate) {
  if (candidate.pullRequest) return getPull(github, context.repo, candidate.pullRequest);
  const pull = await findPullForHead(github, context.repo, candidate);
  if (!pull && candidate.runEvent === 'pull_request')
    throw ignore('No open pull request currently points at the validated head.');
  return pull;
}
function assertPullState(pull) {
  if (pull.state !== 'open') throw ignore('Pull request is no longer open.');
  if (pull.base.ref !== PRODUCTION_BRANCH) throw ignore('Pull request no longer targets main.');
}
function assertPullRevision(pull, candidate) {
  if (pull.head.sha !== candidate.headSha)
    throw ignore(`Pull request head moved to ${pull.head.sha}; this revision is obsolete.`);
}
function checkPullFreshness(pull, candidate) {
  if (!pull) return;
  assertPullState(pull);
  assertPullRevision(pull, candidate);
}
function isFork(pull, candidate, context) {
  if (pull) return pull.head.repo?.full_name !== repoName(context);
  return candidate.headRepo !== repoName(context);
}
async function runById(github, context, candidate) {
  const run = await getRun(github, context.repo, candidate.runId);
  if (!isCiRun(run) || run.head_sha !== candidate.headSha)
    throw failure('CI run identity does not match the candidate revision.');
  return run;
}
async function resolveRun(github, context, candidate) {
  if (candidate.runId) return runById(github, context, candidate);
  const run = await findLatestPullRun(github, context.repo, candidate.headSha);
  if (!run) throw pending('Waiting for CI to start for this revision.');
  return run;
}
function assertRunRepository(run, candidate) {
  if (run.head_repository?.full_name !== candidate.headRepo)
    throw failure('CI run repository does not match the candidate.');
}
function checkRunState(run, candidate) {
  assertRunRepository(run, candidate);
  if (run.status !== 'completed') throw pending('Validation is running.');
  if (run.conclusion !== 'success') throw failure(`CI concluded ${run.conclusion}.`);
}
async function ciEvidence(github, context, candidate) {
  if (candidate.runEvent === 'pull_request')
    return ciResultCheck(github, context.repo, candidate.headSha);
  return latestStatus(github, context.repo, candidate.headSha, 'CI Result');
}
function evidenceState(evidence) {
  return evidence.conclusion ?? evidence.state;
}
function assertEvidenceComplete(state) {
  if (state === null || state === 'pending') throw pending('CI Result is still running.');
  if (state !== 'success') throw failure(`CI Result concluded ${state}.`);
}
async function checkCiResult(github, context, candidate) {
  const evidence = await ciEvidence(github, context, candidate);
  if (!evidence) throw pending('Waiting for CI Result on this revision.');
  assertEvidenceComplete(evidenceState(evidence));
}
async function requiresPreview(github, context, pull) {
  if (!pull) return true;
  const paths = await listPullPaths(github, context.repo, pull.number);
  return classifyPaths(paths).previewRequired;
}
/* ------------------------------------------------------------------------------------------ */
/* Artifact verification                                                                       */
/* ------------------------------------------------------------------------------------------ */
function manifestPreviewBranch(candidate, pull) {
  return previewBranchName({
    pullRequest: pullRequestNumber(pull),
    branch: candidate.headBranch,
  });
}
function expectedManifest(context, candidate, pull, run) {
  const previewBranch = manifestPreviewBranch(candidate, pull);
  return {
    repository: repoName(context),
    pullRequest: pullRequestNumber(pull),
    headSha: candidate.headSha,
    baseSha: pull ? pull.base.sha : null,
    checkedOutSha: pull ? pull.merge_commit_sha : candidate.headSha,
    runId: run.id,
    runAttempt: run.run_attempt,
    previewBranch,
    appUrl: previewAppUrl(previewBranch),
  };
}
function claimErrors(manifest, expected) {
  return Object.entries(expected)
    .filter(([key, value]) => manifest[key] !== value)
    .map(([key, value]) => `${key}: manifest ${String(manifest[key])}, expected ${String(value)}`);
}
/** Compare every manifest claim with live GitHub state and the recomputed content digest. */
export function verifyManifest(manifest, expected, digest) {
  const errors = manifestShapeErrors(manifest);
  if (errors.length) return errors;
  if (!SHA_PATTERN.test(String(expected.checkedOutSha)))
    return ['GitHub has not finished computing the test merge for this revision.'];
  const mismatches = claimErrors(manifest, expected);
  if (manifest.digest !== digest) mismatches.push('digest: build output does not match manifest');
  return mismatches;
}
async function fetchArtifact(github, context, run, destination) {
  const artifact = await findPreviewArtifact(github, context.repo, run.id);
  if (!artifact) throw failure('Preview artifact is missing or expired; rerun CI to rebuild it.');
  mkdirSync(destination, { recursive: true });
  extractZip(await downloadArtifact(github, context.repo, artifact.id), destination);
  return artifact;
}
function readManifest(destination) {
  try {
    return JSON.parse(readFileSync(join(destination, MANIFEST_FILE), 'utf8'));
  } catch {
    throw failure('Preview artifact has no readable manifest.');
  }
}
async function verifiedArtifact({ github, context, candidate, pull, run, destination }) {
  const artifact = await fetchArtifact(github, context, run, destination);
  const manifest = readManifest(destination);
  const expected = expectedManifest(context, candidate, pull, run);
  const errors = verifyManifest(manifest, expected, digestDirectory(destination));
  if (errors.length === 1 && errors[0].startsWith('GitHub has not finished'))
    throw pending(errors[0]);
  if (errors.length) throw failure(`Preview artifact verification failed: ${errors.join('; ')}`);
  return { artifact, manifest };
}
/* ------------------------------------------------------------------------------------------ */
/* Decisions                                                                                   */
/* ------------------------------------------------------------------------------------------ */
async function previousSuccess(github, context, sha, digest) {
  const statuses = await allStatuses(github, context.repo, sha, 'Preview Result');
  const marker = successMarker(digest);
  return statuses.find(
    (status) => status.state === 'success' && status.description?.includes(marker)
  );
}
function firstString(value) {
  return value?.[0]?.full_name ?? null;
}
function decisionIdentity({ candidate, pull }) {
  return {
    pullRequest: pullRequestNumber(pull),
    headSha: optional(candidate, 'headSha'),
    headBranch: optional(candidate, 'headBranch'),
    headRepo: optional(candidate, 'headRepo'),
    mergeSha: optional(pull, 'merge_commit_sha'),
  };
}
function decisionRun({ candidate, run }) {
  return {
    runId: firstRunId(candidate, run),
    runAttempt: attemptOf(run),
    runCompletedAt: optional(run, 'updated_at'),
  };
}
function decisionBase({ candidate, pull, run, fork }) {
  return {
    ...decisionIdentity({ candidate, pull }),
    fork: Boolean(fork),
    ...decisionRun({ candidate, run }),
  };
}
// `state` is filled progressively so an interim outcome (pending/failure) still knows which
// revision to report on.
async function evaluate({ github, context, inputs, workspace }, state) {
  state.candidate = await resolveCandidate({ github, context, inputs });
  state.pull = await resolvePull(github, context, state.candidate);
  checkPullFreshness(state.pull, state.candidate);
  state.fork = isFork(state.pull, state.candidate, context);
  if (state.pull?.draft) return { ...decisionBase(state), ...draftDecision() };
  state.run = await resolveRun(github, context, state.candidate);
  checkRunState(state.run, state.candidate);
  await checkCiResult(github, context, state.candidate);
  if (!(await requiresPreview(github, context, state.pull)))
    return { ...decisionBase(state), ...notApplicable() };
  return deployDecision({ github, context, state, workspace });
}
function draftDecision() {
  return {
    action: 'skip',
    state: 'pending',
    description: 'Draft pull request: the preview deploys after it is marked ready for review.',
  };
}
function notApplicable() {
  return {
    action: 'skip',
    state: 'success',
    description: 'Not applicable: documentation-only change set with successful CI.',
  };
}
async function deployDecision({ github, context, state, workspace }) {
  const { candidate, pull, run, fork } = state;
  const destination = join(workspace, 'plan-artifact');
  const { artifact, manifest } = await verifiedArtifact({
    github,
    context,
    candidate,
    pull,
    run,
    destination,
  });
  const common = {
    ...decisionBase(state),
    artifactId: artifact.id,
    artifactExpiresAt: artifact.expires_at,
    digest: manifest.digest,
    previewBranch: manifest.previewBranch,
    appUrl: manifest.appUrl,
    environment: fork ? ENVIRONMENTS.fork : ENVIRONMENTS.internal,
  };
  if (await previousSuccess(github, context, candidate.headSha, manifest.digest)) {
    return {
      ...common,
      action: 'reuse',
      state: 'success',
      description: `Preview already deployed for this revision ${successMarker(manifest.digest)}`,
    };
  }
  return {
    ...common,
    action: 'deploy',
    state: 'pending',
    description: fork
      ? `Fork preview awaits maintainer approval for ${candidate.headSha.slice(0, 12)}.`
      : 'Deploying the validated preview.',
  };
}
function outcomeDecision(error, state) {
  if (!(error instanceof Outcome)) throw error;
  return {
    ...decisionBase(state),
    action: error.action,
    state: error.state,
    description: error.message,
  };
}
function workflowRunHead(context) {
  const run = context.payload.workflow_run;
  if (run && run.head_branch !== PRODUCTION_BRANCH && isCiRun(run)) return run.head_sha;
  return null;
}
function pullEventHead(context) {
  return context.payload.pull_request?.head?.sha ?? null;
}
/** Best-effort revision for reporting a controller crash; never the production branch. */
export function fallbackHead(context) {
  return workflowRunHead(context) ?? pullEventHead(context);
}
/* ------------------------------------------------------------------------------------------ */
/* Public phases                                                                               */
/* ------------------------------------------------------------------------------------------ */
async function publishDecision(github, context, decision) {
  if (!decision.state || !decision.headSha) return;
  const targets = [decision.headSha, decision.mergeSha].filter(
    (sha, index, all) => sha && all.indexOf(sha) === index
  );
  for (const sha of targets) {
    await publishStatus(github, context.repo, {
      sha,
      state: decision.state,
      description: decision.description,
      targetUrl: runUrl(context),
    });
  }
}
/** Phase 1: resolve the candidate, verify evidence, publish the interim status, emit the plan. */
export async function planPreview({ github, context, core, inputs, workspace }) {
  const state = {};
  let decision;
  try {
    decision = await evaluate({ github, context, inputs, workspace }, state);
  } catch (error) {
    decision = outcomeDecision(error, state);
  }
  if (decision.action !== 'ignore') await publishDecision(github, context, decision);
  core.info(`${decision.action}: ${decision.description}`);
  return decision;
}
function pullReadinessError(pull) {
  if (pull.state !== 'open' || pull.draft) return 'pull request is not open and ready';
  return null;
}
async function pullFreshnessErrors(github, context, decision) {
  const pull = await getPull(github, context.repo, decision.pullRequest);
  const headMoved = pull.head.sha !== decision.headSha ? 'pull request head moved' : null;
  const mergeChanged = pull.merge_commit_sha !== decision.mergeSha ? 'test merge changed' : null;
  return [pullReadinessError(pull), headMoved, mergeChanged].filter(Boolean);
}
function runFreshnessErrors(run, decision) {
  const errors = [];
  if (run.run_attempt !== decision.runAttempt) errors.push('CI run attempt superseded');
  if (run.head_sha !== decision.headSha) errors.push('CI run head changed');
  return errors;
}
async function freshnessErrors(github, context, decision) {
  const pullErrors = decision.pullRequest
    ? await pullFreshnessErrors(github, context, decision)
    : [];
  const run = await getRun(github, context.repo, decision.runId);
  return [...pullErrors, ...runFreshnessErrors(run, decision)];
}
function candidateFromDecision(decision) {
  return {
    runId: decision.runId,
    runEvent: decision.pullRequest ? 'pull_request' : 'workflow_dispatch',
    headSha: decision.headSha,
    headBranch: decision.headBranch,
    headRepo: decision.headRepo,
    baseBranch: PRODUCTION_BRANCH,
    pullRequest: decision.pullRequest,
  };
}
function assertDeployablePlan(decision) {
  if (decision.action !== 'deploy') throw new Error('Deployment was not planned.');
  if (
    decision.previewBranch === PRODUCTION_BRANCH ||
    !decision.previewBranch?.startsWith('preview-')
  )
    throw new Error('Refusing to deploy to a non-preview branch.');
}
/** Phase 2: immediately before upload, repeat freshness checks and re-verify the artifact. */
export async function verifyForDeploy({ github, context, core, decision, destination }) {
  assertDeployablePlan(decision);
  const errors = await freshnessErrors(github, context, decision);
  if (errors.length) throw new Error(`Candidate is obsolete: ${errors.join('; ')}`);
  const candidate = candidateFromDecision(decision);
  const pull = decision.pullRequest
    ? await getPull(github, context.repo, decision.pullRequest)
    : null;
  const run = await getRun(github, context.repo, decision.runId);
  const { manifest } = await verifiedArtifact({
    github,
    context,
    candidate,
    pull,
    run,
    destination,
  });
  if (manifest.digest !== decision.digest)
    throw new Error('Artifact digest changed since planning.');
  core.info(`Verified artifact ${manifest.digest} for ${manifest.headSha}.`);
  return manifest;
}
function terminalResult(decision, outcomes) {
  if (outcomes.deploy !== 'success') return failure(`Preview deployment ${outcomes.deploy}.`);
  if (outcomes.smoke !== 'success') return failure(`Preview smoke tests ${outcomes.smoke}.`);
  return new Outcome('publish', 'success', `Preview deployed ${successMarker(decision.digest)}`);
}
function elapsedMinutes(since) {
  const started = since ? Date.parse(since) : Number.NaN;
  return Number.isNaN(started) ? 'n/a' : ((Date.now() - started) / 60000).toFixed(1);
}
function publishedLabel(published, result) {
  return published ? String(result.state) : 'not published (obsolete candidate)';
}
function pullLabel(pullRequest) {
  return pullRequest ? `#${pullRequest}` : 'branch dispatch';
}
function deploymentLabel(evidence) {
  return orNa(optional(evidence, 'url'));
}
function summaryRows(decision, result, published, evidence) {
  return [
    ['Action', orNa(decision.action)],
    ['Published', publishedLabel(published, result)],
    ['Revision', orNa(decision.headSha)],
    ['Pull request', pullLabel(decision.pullRequest)],
    ['Digest', orNa(decision.digest)],
    ['Deployment', deploymentLabel(evidence)],
    ['Validation to preview (minutes)', elapsedMinutes(decision.runCompletedAt)],
    ['Detail', result.message],
  ];
}
function summarize(core, decision, result, published, evidence) {
  core.summary
    .addHeading('Preview Result', 2)
    .addTable(summaryRows(decision, result, published, evidence));
  return core.summary.write();
}
async function publishTerminal(github, context, core, decision, result) {
  const stale = result.state === 'success' ? await freshnessErrors(github, context, decision) : [];
  if (stale.length) {
    core.warning(`Not publishing success for an obsolete candidate: ${stale.join('; ')}`);
    return false;
  }
  await publishDecision(github, context, {
    ...decision,
    state: result.state,
    description: result.message,
  });
  return true;
}
/** Phase 3: publish the authoritative result only for a still-current candidate. */
export async function publishResult({ github, context, core, decision, outcomes, evidence }) {
  if (decision.action !== 'deploy') {
    const planned = new Outcome(decision.action, decision.state, decision.description);
    await summarize(core, decision, planned, true, evidence);
    return decision.state;
  }
  const result = terminalResult(decision, outcomes);
  const published = await publishTerminal(github, context, core, decision, result);
  await summarize(core, decision, result, published, evidence);
  if (result.state === 'failure') core.setFailed(result.message);
  return published ? result.state : 'obsolete';
}
/** Report a controller crash on the candidate revision so the gate cannot pass by omission. */
export async function publishControllerFailure({ github, context, core, decision }) {
  const headSha = decision?.headSha ?? fallbackHead(context);
  if (!headSha) {
    core.warning('Controller failed before a candidate revision was known.');
    return;
  }
  await publishDecision(github, context, {
    ...decision,
    headSha,
    state: 'failure',
    description: 'Preview controller failed; inspect the workflow run.',
  });
}
