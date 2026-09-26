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
// Every "test merge not ready" pending reason starts with this prefix so the hourly fallback can
// re-evaluate it once GitHub computes the merge; other pending reasons are left alone.
const MERGE_PENDING = 'GitHub has not finished computing';
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
async function findCandidatePull(github, context, candidate) {
  return candidate.pullRequest
    ? await getPull(github, context.repo, candidate.pullRequest)
    : await findPullForHead(github, context.repo, candidate);
}
function assertCandidatePull(pull, candidate) {
  if (!pull && candidate.runEvent === 'pull_request')
    throw ignore('No open pull request currently points at the validated head.');
}
async function resolvePull(github, context, candidate) {
  const pull = await findCandidatePull(github, context, candidate);
  assertCandidatePull(pull, candidate);
  return needsMergeRetry(pull) ? waitForMerge(github, context, candidate, pull) : pull;
}
function needsMergeRetry(pull) {
  return pull && pull.state === 'open' && !SHA_PATTERN.test(String(pull.merge_commit_sha));
}
function pullRevisionChanged(current, candidate) {
  return current.head.sha !== candidate.headSha || current.base.ref !== PRODUCTION_BRANCH;
}
async function waitForMerge(github, context, candidate, pull) {
  // GitHub briefly returns a null test merge after a PR is opened or synchronized. Retry
  // before verifying; artifact claims bind to the test merge even though the status targets the head.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const current = await getPull(github, context.repo, pull.number);
    if (pullRevisionChanged(current, candidate)) return current;
    if (SHA_PATTERN.test(String(current.merge_commit_sha))) return current;
  }
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
function sameCandidateBranch(run, candidate) {
  return [
    run.head_repository?.full_name === candidate.headRepo,
    run.head_branch === candidate.headBranch,
  ].every(Boolean);
}
function assertLatestPullRun(candidate, latest) {
  if (!latest) throw pending('Waiting for CI to start for this revision.');
  if (candidate.runId && candidate.runId !== latest.id) {
    throw ignore('A newer CI run superseded this preview state event.');
  }
}
async function resolvePullRun(github, context, candidate) {
  const latest = await findLatestPullRun(github, context.repo, candidate.headSha, (run) =>
    sameCandidateBranch(run, candidate)
  );
  assertLatestPullRun(candidate, latest);
  return candidate.runId ? runById(github, context, candidate) : latest;
}
async function resolveRun(github, context, candidate) {
  if (candidate.runEvent === 'pull_request') return resolvePullRun(github, context, candidate);
  return runById(github, context, candidate);
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
    pullRequest: candidate.runEvent === 'pull_request' ? pullRequestNumber(pull) : null,
    branch: candidate.headBranch,
  });
}
function claimSha(candidate, pull) {
  if (candidate.runEvent !== 'pull_request' || !pull) return null;
  return pull.base.sha;
}
/** Tree of the commit GitHub triggered the run for; binds the build to the run's commit. */
function runTreeSha(run) {
  const tree = run.head_commit?.tree_id;
  return SHA_PATTERN.test(String(tree)) ? tree : null;
}
function dispatchMergePrerequisite(pull, run) {
  if (!SHA_PATTERN.test(String(pull.merge_commit_sha)))
    return `${MERGE_PENDING} the PR test merge; retry after it is ready.`;
  if (!runTreeSha(run)) return 'Dispatched CI run has no verifiable Git tree.';
  return null;
}
async function currentPullBaseMismatch(github, context, pull) {
  if (!SHA_PATTERN.test(String(pull.merge_commit_sha)))
    return `${MERGE_PENDING} the PR test merge; retry after it is ready.`;
  const { data: main } = await github.rest.git.getRef({
    ...context.repo,
    ref: `heads/${PRODUCTION_BRANCH}`,
  });
  return pull.base.sha === main.object.sha
    ? null
    : 'PR base is no longer current main; rerun PR CI before requesting a preview.';
}
async function dispatchMergeMismatch(github, context, pull, run) {
  const prerequisite = dispatchMergePrerequisite(pull, run);
  if (prerequisite) return prerequisite;
  const baseMismatch = await currentPullBaseMismatch(github, context, pull);
  if (baseMismatch) return baseMismatch;
  const { data: merge } = await github.rest.git.getCommit({
    ...context.repo,
    commit_sha: pull.merge_commit_sha,
  });
  return merge.tree.sha === runTreeSha(run)
    ? null
    : 'Dispatched branch build differs from the PR test merge; request a preview from PR CI.';
}
/* GitHub can regenerate a PR's test-merge commit (observed when a merge is attempted) with the
   same parents and tree but a new SHA. A test merge is identified by that content, not its SHA. */
function shapeOf(data) {
  return { tree: data.tree?.sha, parents: (data.parents ?? []).map((parent) => parent.sha) };
}
function missingCommit(error) {
  return [404, 422].includes(error.status);
}
async function commitShape(github, context, sha) {
  try {
    const { data } = await github.rest.git.getCommit({ ...context.repo, commit_sha: sha });
    return shapeOf(data);
  } catch (error) {
    if (missingCommit(error)) return null;
    throw error;
  }
}
function representsPull(shape, pull) {
  return [
    shape.parents.length === 2,
    shape.parents[0] === pull.base.sha,
    shape.parents[1] === pull.head.sha,
    SHA_PATTERN.test(String(shape.tree)),
  ].every(Boolean);
}
function comparableMerges(pull, sha) {
  return [sha, pull.merge_commit_sha].every((value) => SHA_PATTERN.test(String(value)));
}
function sameMergeContent(claimed, current, pull) {
  if (!claimed || !current) return false;
  return [
    representsPull(claimed, pull),
    representsPull(current, pull),
    claimed.tree === current.tree,
  ].every(Boolean);
}
/** True when `sha` is the PR's current test merge or a regenerated equivalent of it. */
async function equivalentTestMerge(github, context, pull, sha) {
  if (!comparableMerges(pull, sha)) return false;
  if (sha === pull.merge_commit_sha) return true;
  const claimed = await commitShape(github, context, sha);
  const current = await commitShape(github, context, pull.merge_commit_sha);
  return sameMergeContent(claimed, current, pull);
}
async function requireDispatchMergeProof(github, context, candidate, pull, run) {
  if (!pull || candidate.runEvent !== 'workflow_dispatch') return;
  const mismatch = await dispatchMergeMismatch(github, context, pull, run);
  if (mismatch) throw pending(mismatch);
}
function claimCheckedOutSha(candidate, pull) {
  return candidate.runEvent === 'pull_request' && pull ? pull.merge_commit_sha : candidate.headSha;
}
function expectedManifest(context, candidate, pull, run) {
  const previewBranch = manifestPreviewBranch(candidate, pull);
  return {
    repository: repoName(context),
    pullRequest: candidate.runEvent === 'pull_request' ? pullRequestNumber(pull) : null,
    headSha: candidate.headSha,
    baseSha: claimSha(candidate, pull),
    checkedOutSha: claimCheckedOutSha(candidate, pull),
    treeSha: runTreeSha(run),
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
    return [`${MERGE_PENDING} the test merge for this revision.`];
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
async function mergeBoundExpectation({ github, context, candidate, pull, manifest, expected }) {
  if (candidate.runEvent !== 'pull_request' || !pull) return expected;
  const equivalent = await equivalentTestMerge(github, context, pull, manifest.checkedOutSha);
  return equivalent ? { ...expected, checkedOutSha: manifest.checkedOutSha } : expected;
}
async function verifiedArtifact({ github, context, candidate, pull, run, destination }) {
  const artifact = await fetchArtifact(github, context, run, destination);
  const manifest = readManifest(destination);
  const expected = await mergeBoundExpectation({
    github,
    context,
    candidate,
    pull,
    manifest,
    expected: expectedManifest(context, candidate, pull, run),
  });
  const errors = verifyManifest(manifest, expected, digestDirectory(destination));
  if (errors.length === 1 && errors[0].startsWith(MERGE_PENDING)) throw pending(errors[0]);
  if (errors.length) throw failure(`Preview artifact verification failed: ${errors.join('; ')}`);
  return { artifact, manifest };
}
/* ------------------------------------------------------------------------------------------ */
/* Decisions                                                                                   */
/* ------------------------------------------------------------------------------------------ */
function previousRunId(context, status) {
  const prefix = `${context.serverUrl}/${repoName(context)}/actions/runs/`;
  const target = status.target_url ?? '';
  if (!target.startsWith(prefix)) return null;
  const id = target.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(id) ? Number(id) : null;
}
function trustedPreviousRun(context, run) {
  const repository = repoName(context);
  return [
    run.path === '.github/workflows/preview.yml',
    run.event === 'workflow_dispatch',
    run.head_branch === PRODUCTION_BRANCH,
    run.head_repository?.full_name === repository,
    run.repository?.full_name === repository,
    run.status === 'completed',
    run.conclusion === 'success',
  ].every(Boolean);
}
async function successfulResultJob(github, context, runId) {
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...context.repo,
    run_id: runId,
    per_page: 100,
  });
  return jobs.some((job) => job.name === 'Publish preview result' && job.conclusion === 'success');
}
async function retainedDeployment(github, context, runId, sha) {
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...context.repo,
    run_id: runId,
    per_page: 100,
  });
  return artifacts.some(
    (artifact) => artifact.name === `preview-deployment-${sha}` && !artifact.expired
  );
}
async function previousRun(github, context, runId) {
  try {
    return await getRun(github, context.repo, runId);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
async function validatedPreviousRun(github, context, status) {
  const runId = previousRunId(context, status);
  if (!runId) return null;
  const run = await previousRun(github, context, runId);
  if (!run) return null;
  if (!trustedPreviousRun(context, run)) return null;
  return runId;
}
async function authenticatedPreviousSuccess(github, context, status, sha) {
  const runId = await validatedPreviousRun(github, context, status);
  if (!runId) return false;
  if (!(await successfulResultJob(github, context, runId))) return false;
  return retainedDeployment(github, context, runId, sha);
}
function matchesSuccessMarker(status, marker) {
  return status.state === 'success' && status.description?.includes(marker);
}
async function previousSuccess(github, context, headSha, digest) {
  const statuses = await allStatuses(github, context.repo, headSha, 'Preview Result');
  const marker = successMarker(digest);
  for (const status of statuses.toSorted((left, right) => right.id - left.id)) {
    if (!matchesSuccessMarker(status, marker)) continue;
    if (await authenticatedPreviousSuccess(github, context, status, headSha)) return status;
  }
  return null;
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
/** Rebuild the phase-1 candidate for phase-2 re-verification; runEvent picks the claim shape. */
function decisionRunEvent(candidate, pull) {
  const dispatch = !candidate || candidate.runEvent !== 'pull_request' || !pull;
  return dispatch ? 'workflow_dispatch' : 'pull_request';
}
function decisionBase({ candidate, pull, run, fork }) {
  return {
    ...decisionIdentity({ candidate, pull }),
    fork: Boolean(fork),
    runEvent: decisionRunEvent(candidate, pull),
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
  await requireDispatchMergeProof(github, context, state.candidate, state.pull, state.run);
  if (!(await requiresPreview(github, context, state.pull)))
    return { ...decisionBase(state), ...notApplicable() };
  return deployDecision({ github, context, state, workspace });
}
function draftDecision() {
  return {
    action: 'skip',
    state: 'pending',
    description: 'Draft pull request: mark ready, then request a preview after successful CI.',
  };
}
function notApplicable() {
  return {
    action: 'skip',
    state: 'success',
    description: 'Not applicable: documentation-only change set with successful CI.',
  };
}
function deploymentDecision(common, earlier, manifest, fork, headSha) {
  if (earlier) {
    return {
      ...common,
      action: 'reuse',
      state: 'success',
      description: `Preview already deployed for this revision ${successMarker(manifest.digest)}`,
      reuseTargetUrl: earlier.target_url,
    };
  }
  return {
    ...common,
    action: 'deploy',
    state: 'pending',
    description: fork
      ? `Fork preview awaits maintainer approval for ${headSha.slice(0, 12)}.`
      : 'Deploying the validated preview.',
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
  const earlier = await previousSuccess(github, context, candidate.headSha, manifest.digest);
  return deploymentDecision(common, earlier, manifest, fork, candidate.headSha);
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
/* ------------------------------------------------------------------------------------------ */
/* Public phases                                                                               */
/* ------------------------------------------------------------------------------------------ */
function statusTargetUrl(context, decision) {
  return decision.reuseTargetUrl ?? runUrl(context);
}
async function publishDecision(github, context, decision) {
  if (!decision.state || !decision.headSha) return false;
  // Always report on the validated head. GitHub regenerates the test-merge commit when a merge is
  // attempted, dropping any status on it; strict ruleset freshness binds the head to current main.
  await publishStatus(github, context.repo, {
    sha: decision.headSha,
    state: decision.state,
    description: decision.description,
    targetUrl: statusTargetUrl(context, decision),
  });
  return true;
}
function awaitExplicitPreview(decision) {
  const request = decision.fork
    ? `Run Preview with run_id=${decision.runId}. Fork needs maintainer approval.`
    : 'Comment /preview on this PR after CI succeeds.';
  return {
    ...decision,
    action: 'wait',
    state: 'pending',
    description: `Preview pending: ${decision.headSha.slice(0, 12)}. ${request}`,
  };
}
function deferAutomaticPreview(context, decision) {
  return context.eventName !== 'workflow_dispatch' && decision.action === 'deploy'
    ? awaitExplicitPreview(decision)
    : decision;
}
async function publishPlannedDecision(github, context, core, decision) {
  if (decision.action === 'ignore') return false;
  if (decision.pullRequest && !decision.mergeSha)
    core.warning('PR test merge is not ready; Preview Result stays pending until a later refresh.');
  return publishDecision(github, context, decision);
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
  decision = deferAutomaticPreview(context, decision);
  decision.statusPublished = await publishPlannedDecision(github, context, core, decision);
  core.info(`${decision.action}: ${decision.description}`);
  return decision;
}
function refreshContext(context, pull) {
  return {
    ...context,
    eventName: 'pull_request_target',
    payload: { ...context.payload, action: 'synchronize', pull_request: pull },
  };
}
function awaitingTestMerge(status) {
  return status.state === 'pending' && String(status.description).startsWith(MERGE_PENDING);
}
/** Refresh a head with no result, or one left pending only because the test merge was not ready. */
async function needsPreviewRefresh(github, context, pull) {
  if (!SHA_PATTERN.test(String(pull.merge_commit_sha))) return false;
  const statuses = await allStatuses(github, context.repo, pull.head.sha, 'Preview Result');
  const latest = statuses.toSorted((left, right) => right.id - left.id)[0];
  return !latest || awaitingTestMerge(latest);
}
async function refreshMissingPull(github, context, core, workspace, item) {
  const pull = await getPull(github, context.repo, item.number);
  if (!(await needsPreviewRefresh(github, context, pull))) return;
  const current = refreshContext(context, pull);
  try {
    await planPreview({
      github,
      context: current,
      core,
      workspace: join(workspace, `pr-${pull.number}`),
    });
  } catch (error) {
    await publishControllerFailure({ github, context: current, core });
    throw error;
  }
}
/** Hourly fallback for a test merge that became available after the last PR/CI event. */
export async function reconcileMissingPreviewStatuses({ github, context, core, workspace }) {
  const pulls = await github.paginate(github.rest.pulls.list, {
    ...context.repo,
    state: 'open',
    base: PRODUCTION_BRANCH,
    per_page: 100,
  });
  const errors = [];
  for (const pull of pulls) {
    try {
      await refreshMissingPull(github, context, core, workspace, pull);
    } catch (error) {
      errors.push(`#${pull.number}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(`Preview reconciliation failed: ${errors.join('; ')}`);
}
function pullReadinessError(pull) {
  if (pull.state !== 'open' || pull.draft) return 'pull request is not open and ready';
  return null;
}
async function pullFreshnessErrors(github, context, decision) {
  const pull = await getPull(github, context.repo, decision.pullRequest);
  const headMoved = pull.head.sha !== decision.headSha ? 'pull request head moved' : null;
  const mergeChanged = (await equivalentTestMerge(github, context, pull, decision.mergeSha))
    ? null
    : 'test merge changed';
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
  const mismatch = await dispatchFreshnessMismatch(github, context, decision, run);
  return [...pullErrors, ...runFreshnessErrors(run, decision), ...(mismatch ? [mismatch] : [])];
}
async function dispatchFreshnessMismatch(github, context, decision, run) {
  if (!decision.pullRequest || decision.runEvent !== 'workflow_dispatch') return null;
  const pull = await getPull(github, context.repo, decision.pullRequest);
  return dispatchMergeMismatch(github, context, pull, run);
}
function candidateFromDecision(decision) {
  return {
    runId: decision.runId,
    runEvent: decision.runEvent,
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
  return publishDecision(github, context, {
    ...decision,
    state: result.state,
    description: result.message,
  });
}
/** Phase 3: publish the authoritative result only for a still-current candidate. */
export async function publishResult({ github, context, core, decision, outcomes, evidence }) {
  if (decision.action !== 'deploy') {
    const planned = new Outcome(decision.action, decision.state, decision.description);
    await summarize(core, decision, planned, decision.statusPublished, evidence);
    return decision.state;
  }
  const result = terminalResult(decision, outcomes);
  const published = await publishTerminal(github, context, core, decision, result);
  await summarize(core, decision, result, published, evidence);
  if (result.state === 'failure') core.setFailed(result.message);
  return published ? result.state : 'obsolete';
}
function unchangedFailureEvent(context, pull) {
  if (context.eventName !== 'pull_request_target') return true;
  const event = context.payload.pull_request;
  const sameBase = event.base.sha === pull.base.sha;
  const eventMerge = event.merge_commit_sha;
  return (
    sameBase && (!SHA_PATTERN.test(String(eventMerge)) || eventMerge === pull.merge_commit_sha)
  );
}
function sameFailureSnapshot(snapshot, pull) {
  return [
    snapshot.number === pull.number,
    snapshot.head?.sha === pull.head.sha,
    snapshot.base?.sha === pull.base.sha,
  ].every(Boolean);
}
function currentFailureRun(candidate, pull, run) {
  if (!pull || candidate.runEvent !== 'pull_request') return true;
  const snapshots = run.pull_requests ?? [];
  // Fork runs may omit PR/base snapshots. An old run with the same head cannot be attributed
  // to today's test merge, so leave its required status pending instead of failing the wrong SHA.
  return snapshots.some((snapshot) => sameFailureSnapshot(snapshot, pull));
}
async function liveFailureIdentity(github, context, inputs) {
  const candidate = await resolveCandidate({ github, context, inputs });
  const pull = await resolvePull(github, context, candidate);
  checkPullFreshness(pull, candidate);
  if (pull && !unchangedFailureEvent(context, pull)) return null;
  const run = await resolveRun(github, context, candidate);
  if (!currentFailureRun(candidate, pull, run)) return null;
  await requireDispatchMergeProof(github, context, candidate, pull, run);
  return decisionBase({ candidate, pull });
}
async function failureIdentity(github, context, core, inputs, decision) {
  if (decision?.headSha) return decision;
  try {
    return await liveFailureIdentity(github, context, inputs);
  } catch (error) {
    core.warning(`Could not identify a current candidate for failure reporting: ${error.message}`);
    return null;
  }
}
/** Re-identify the live candidate after a controller crash; never fail a stale PR revision. */
export async function publishControllerFailure({ github, context, core, inputs, decision }) {
  const identity = await failureIdentity(github, context, core, inputs, decision);
  if (!identity) return;
  const published = await publishDecision(github, context, {
    ...identity,
    state: 'failure',
    description: 'Preview controller failed; inspect the workflow run.',
  });
  if (!published) core.warning('No failure status was published.');
}
