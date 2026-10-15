// Completed runs are locators only; each panel still fetches current PR and trusted state.
import { findPullForHead } from '../preview/github-api.mjs';
import { allPages } from './review-admission-api.mjs';
import { readAdmissionArchive } from './review-admission-archive.mjs';
import { requireEvidence } from './review-admission-policy.mjs';
const RESOLVERS = new Map([
  ['.github/workflows/ci.yml', ciTargets],
  ['.github/workflows/preview.yml', previewTargets],
  ['.github/workflows/preview-state.yml', previewStateTargets],
  ['.github/workflows/review-admission.yml', admissionTargets],
]);
export async function controlRefreshTargets(github, context) {
  const event = context.payload.workflow_run;
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    ...context.repo,
    run_id: event.id,
    attempt_number: event.run_attempt,
  });
  requireEvidence(
    run.repository?.full_name === `${context.repo.owner}/${context.repo.repo}`,
    'Refresh source repository mismatch.'
  );
  requireEvidence(
    [run.id === event.id, run.run_attempt === event.run_attempt, run.status === 'completed'].every(
      Boolean
    ),
    'Refresh source identity or completion mismatch.'
  );
  const resolve = RESOLVERS.get(run.path);
  requireEvidence(Boolean(resolve), 'Refresh source workflow mismatch.');
  const numbers = [...new Set(await resolve(github, context.repo, run))];
  requireEvidence(numbers.length <= 1, 'A source run must identify at most one PR.');
  requireEvidence(
    numbers.every((number) => Number.isSafeInteger(number) && number > 0),
    'Refresh PR locator is invalid.'
  );
  return numbers;
}
function queueTarget(run) {
  const match = /^gh-readonly-queue\/main\/pr-([1-9]\d*)-[a-f0-9]+$/.exec(run.head_branch);
  return match ? [Number(match[1])] : [];
}
async function ciTargets(github, repo, run) {
  if (run.event === 'merge_group') return queueTarget(run);
  if (run.event !== 'pull_request') return [];
  return linkedCiTargets(github, repo, run);
}
async function linkedCiTargets(github, repo, run) {
  const linked = run.pull_requests ?? [];
  requireEvidence(linked.length <= 1, 'CI PR locator is ambiguous.');
  if (linked.length === 1) return [linked[0].number];
  const pull = await findPullForHead(github, repo, {
    baseBranch: 'main',
    headSha: run.head_sha,
    headRepo: headRepository(run),
    headBranch: run.head_branch,
  });
  return pull ? [pull.number] : [];
}
async function previewTargets(github, repo, run) {
  const match = /^Preview CI ([1-9]\d*)(?: request [0-9]+(?: control [0-9]+)?)?$/.exec(
    run.display_title
  );
  requireEvidence(Boolean(match), 'Preview CI locator is malformed.');
  const { data: ci } = await github.rest.actions.getWorkflowRun({
    ...repo,
    run_id: Number(match[1]),
  });
  requireEvidence(
    [
      ci.path === '.github/workflows/ci.yml',
      ci.repository?.full_name === `${repo.owner}/${repo.repo}`,
    ].every(Boolean),
    'Preview source CI identity mismatch.'
  );
  return ciTargets(github, repo, ci);
}
async function admissionTargets(github, repo, run) {
  const artifacts = await allPages(github, github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: run.id,
  });
  const matches = artifacts.filter(
    (item) => item.name === `review-admission-target-${run.run_attempt}`
  );
  if (matches.length === 0) return []; // A controller from before the locator protocol.
  requireEvidence(matches.length === 1, 'Admission target locator is ambiguous.');
  const artifact = matches[0];
  requireEvidence(
    !artifact.expired && artifact.size_in_bytes <= 100000,
    'Admission target locator unavailable.'
  );
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  });
  const locator = await readAdmissionArchive(Buffer.from(data), 'target');
  requireEvidence(
    [
      locator.repository === `${repo.owner}/${repo.repo}`,
      locator.runId === run.id,
      locator.runAttempt === run.run_attempt,
    ].every(Boolean),
    'Admission target locator binding mismatch.'
  );
  return [locator.number];
}
function headRepository(run) {
  return run.head_repository?.full_name;
}
function previewStateTargets(github, repo, run) {
  if (run.event !== 'workflow_dispatch') return [];
  const match = /^Preview State PR ([1-9]\d*)$/.exec(run.display_title);
  return match ? [Number(match[1])] : [];
}
