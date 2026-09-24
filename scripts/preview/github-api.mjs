import { ARTIFACT_NAME, CI_WORKFLOW_PATH, STATUS_CONTEXT } from './profile.mjs';
// GitHub Actions app id: only check runs and statuses created by Actions count as CI evidence.
const ACTIONS_APP_ID = 15368;
const CI_WORKFLOW_FILE = 'ci.yml';
/** Live pull request state; the controller never trusts payload snapshots for freshness checks. */
export async function getPull(github, repo, number) {
  const { data } = await github.rest.pulls.get({ ...repo, pull_number: number });
  return data;
}
function matchesCandidate(pull, candidate) {
  const checks = [
    pull.state === 'open',
    pull.base.ref === candidate.baseBranch,
    pull.head.sha === candidate.headSha,
    pull.head.repo?.full_name === candidate.headRepo,
  ];
  return checks.every(Boolean);
}
/** Resolve the open pull request whose current head is the validated commit, if any. */
export async function findPullForHead(github, repo, candidate) {
  const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...repo,
    commit_sha: candidate.headSha,
    per_page: 100,
  });
  const matches = pulls.filter((pull) => matchesCandidate(pull, candidate));
  return matches.length === 1 ? matches[0] : null;
}
export async function getRun(github, repo, runId) {
  const { data } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  return data;
}
/** Newest matching PR CI run for a head; callers bind it to the requested PR or branch. */
export async function findLatestPullRun(github, repo, headSha, matches = () => true) {
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...repo,
    workflow_id: CI_WORKFLOW_FILE,
    event: 'pull_request',
    head_sha: headSha,
    per_page: 100,
  });
  return (
    data.workflow_runs.filter(matches).toSorted((left, right) => right.id - left.id)[0] ?? null
  );
}
export function isCiRun(run) {
  return (
    run?.path === CI_WORKFLOW_PATH && ['pull_request', 'workflow_dispatch'].includes(run.event)
  );
}
/** Latest `CI Result` job check run from GitHub Actions on the exact head. */
export async function ciResultCheck(github, repo, sha) {
  const checks = await github.paginate(github.rest.checks.listForRef, {
    ...repo,
    ref: sha,
    check_name: 'CI Result',
    filter: 'latest',
    per_page: 100,
  });
  return (
    checks
      .filter((check) => check.app?.id === ACTIONS_APP_ID && check.head_sha === sha)
      .toSorted((left, right) => right.id - left.id)[0] ?? null
  );
}
/** Latest commit status for one context on the exact head (dispatched CI reports this way). */
export async function latestStatus(github, repo, sha, statusContext) {
  const statuses = await github.paginate(github.rest.repos.listCommitStatusesForRef, {
    ...repo,
    ref: sha,
    per_page: 100,
  });
  return (
    statuses
      .filter((status) => status.context === statusContext)
      .toSorted((left, right) => right.id - left.id)[0] ?? null
  );
}
export async function allStatuses(github, repo, sha, statusContext) {
  const statuses = await github.paginate(github.rest.repos.listCommitStatusesForRef, {
    ...repo,
    ref: sha,
    per_page: 100,
  });
  return statuses.filter((status) => status.context === statusContext);
}
export async function findPreviewArtifact(github, repo, runId) {
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: runId,
    per_page: 100,
  });
  const candidates = artifacts.filter((artifact) => artifact.name === ARTIFACT_NAME);
  if (candidates.length !== 1) return null;
  return candidates[0].expired ? null : candidates[0];
}
export async function downloadArtifact(github, repo, artifactId) {
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: artifactId,
    archive_format: 'zip',
  });
  return Buffer.from(data);
}
export async function listPullPaths(github, repo, number) {
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const paths = files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
  // GitHub caps the file listing; an incomplete listing must select the conservative decision.
  return files.length >= 3000 ? [] : paths;
}
function truncateDescription(description) {
  return description.length > 140 ? `${description.slice(0, 137)}...` : description;
}
/** Publish the authoritative `Preview Result` context; callers treat a rejected write as fatal. */
export async function publishStatus(github, repo, { sha, state, description, targetUrl }) {
  await github.rest.repos.createCommitStatus({
    ...repo,
    sha,
    context: STATUS_CONTEXT,
    state,
    description: truncateDescription(description),
    target_url: targetUrl,
  });
}
