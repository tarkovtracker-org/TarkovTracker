// Trusted merge-queue reuse. A queue commit whose Git tree is identical to the tree a member PR
// already validated gains nothing from rebuilding: same files, same build, same tests. Reuse is
// allowed only when that proof comes from trusted evidence:
//   - the PR head's newest `Preview Result` is a success published by the trusted preview
//     workflow on main, whose retained deployment evidence records the verified build tree;
//   - that tree equals the live queue commit's tree, built on current main;
//   - the CI run that built the deployed artifact is the latest attempt of a same-repository PR
//     run for that head, and every full-validation job in it succeeded.
// Anything missing, ambiguous or unreadable returns `reused: false` and the queue validates in
// full, so this can only skip work, never weaken a result. Release version PRs are excluded
// because release finalization requires a queue preview deployment on the merged SHA.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip } from './archive.mjs';
import {
  downloadArtifact,
  findLatestPullRun,
  getPull,
  getRun,
  latestStatus,
} from './github-api.mjs';
import { QueueValidationError, queueRevision } from './merge-queue.mjs';
import { CI_WORKFLOW_PATH, PRODUCTION_BRANCH, STATUS_CONTEXT } from './profile.mjs';
const SHA = /^[0-9a-f]{40}$/;
const QUEUE_BRANCH = new RegExp(
  `^gh-readonly-queue/${PRODUCTION_BRANCH}/pr-([1-9][0-9]*)-[0-9a-f]{40}$`
);
const PREVIEW_WORKFLOW_PATH = '.github/workflows/preview.yml';
const PREVIEW_RESULT_JOB = 'Publish preview result';
const EVIDENCE_FILE = 'deployment-evidence.json';
/** Jobs that run only under a full validation plan; all must have succeeded in the source run. */
export const FULL_VALIDATION_JOBS = [
  'Fallow audit',
  'Lint & Format',
  'Type Check',
  'Test (shard 1/4)',
  'Test (shard 2/4)',
  'Test (shard 3/4)',
  'Test (shard 4/4)',
  'Coverage thresholds',
  'Validate',
  'Supabase DB',
  'Systems drift check',
  'Workers',
  'CI Result',
];
class NotReusable extends Error {}
function ensure(condition, reason) {
  if (!condition) throw new NotReusable(reason);
}
function repoName(context) {
  return `${context.repo.owner}/${context.repo.repo}`;
}
export function queuePullNumber(branch) {
  const match = QUEUE_BRANCH.exec(String(branch ?? ''));
  return match ? Number(match[1]) : null;
}
function eligibleHead(head, context) {
  return [
    head.repo?.full_name === repoName(context),
    !String(head.ref).startsWith('wip/release-'),
    SHA.test(String(head.sha)),
  ].every(Boolean);
}
function eligiblePull(pull, context) {
  return [
    pull.state === 'open',
    pull.base?.ref === PRODUCTION_BRANCH,
    eligibleHead(pull.head ?? {}, context),
  ].every(Boolean);
}
async function memberPull(github, context, candidate) {
  const number = queuePullNumber(candidate.headBranch);
  ensure(number, 'Queue branch does not name a member pull request.');
  const pull = await getPull(github, context.repo, number);
  ensure(eligiblePull(pull, context), 'Member PR is not an open same-repository ordinary PR.');
  return pull;
}
function runIdAfter(target, prefix) {
  const id = target.startsWith(prefix) ? target.slice(prefix.length) : '';
  return /^[1-9][0-9]*$/.test(id) ? Number(id) : null;
}
function previewRunId(context, status) {
  return runIdAfter(
    String(status.target_url),
    `${context.serverUrl}/${repoName(context)}/actions/runs/`
  );
}
function trustedPreviewRun(run, context) {
  return [
    run.path === PREVIEW_WORKFLOW_PATH,
    run.event === 'workflow_dispatch',
    run.head_branch === PRODUCTION_BRANCH,
    run.repository?.full_name === repoName(context),
    run.head_repository?.full_name === repoName(context),
    run.status === 'completed',
    run.conclusion === 'success',
  ].every(Boolean);
}
async function previewRun(github, context, headSha) {
  const status = await latestStatus(github, context.repo, headSha, STATUS_CONTEXT);
  ensure(status?.state === 'success', 'Member PR head has no current successful preview.');
  const runId = previewRunId(context, status);
  ensure(runId, 'Preview Result does not point at a preview run.');
  const run = await getRun(github, context.repo, runId);
  ensure(
    trustedPreviewRun(run, context),
    'Preview Result is not from the trusted preview workflow.'
  );
  return run;
}
async function runJobs(github, context, run) {
  return github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
    ...context.repo,
    run_id: run.id,
    attempt_number: run.run_attempt,
    per_page: 100,
  });
}
function succeeded(jobs, name) {
  const matching = jobs.filter((job) => job.name === name);
  return matching.length === 1 && matching[0].conclusion === 'success';
}
async function requirePublishedResult(github, context, run) {
  const jobs = await runJobs(github, context, run);
  ensure(succeeded(jobs, PREVIEW_RESULT_JOB), 'Preview run did not publish its result.');
}
async function evidenceArtifact(github, context, run, headSha) {
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...context.repo,
    run_id: run.id,
    per_page: 100,
  });
  const matches = artifacts.filter((item) => item.name === `preview-deployment-${headSha}`);
  ensure(matches.length === 1 && !matches[0].expired, 'Preview deployment evidence is missing.');
  return matches[0];
}
function readEvidence(buffer) {
  const directory = mkdtempSync(join(tmpdir(), 'queue-reuse-'));
  try {
    extractZip(buffer, directory);
    return JSON.parse(readFileSync(join(directory, EVIDENCE_FILE), 'utf8'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
async function deploymentEvidence(github, context, run, headSha) {
  const artifact = await evidenceArtifact(github, context, run, headSha);
  const archive = await downloadArtifact(github, context.repo, artifact.id);
  try {
    return readEvidence(archive) ?? {};
  } catch (error) {
    throw new NotReusable(`Preview deployment evidence is unreadable: ${error.message}`);
  }
}
function evidenceMatches(evidence, pull, treeSha) {
  return [
    evidence.headSha === pull.head.sha,
    Number(evidence.pullRequest) === pull.number,
    evidence.treeSha === treeSha,
    Number.isSafeInteger(Number(evidence.sourceCiRunId)),
  ].every(Boolean);
}
function trustedSourceRun(run, context, pull, evidence) {
  return [
    run.path === CI_WORKFLOW_PATH,
    run.event === 'pull_request',
    run.head_sha === pull.head.sha,
    run.repository?.full_name === repoName(context),
    run.head_repository?.full_name === repoName(context),
    run.status === 'completed',
    run.conclusion === 'success',
    String(run.run_attempt) === String(evidence.sourceCiAttempt),
  ].every(Boolean);
}
async function requireLatestSourceRun(github, context, pull, run) {
  const latest = await findLatestPullRun(github, context.repo, pull.head.sha, (candidate) =>
    [
      candidate.path === CI_WORKFLOW_PATH,
      candidate.head_repository?.full_name === repoName(context),
    ].every(Boolean)
  );
  ensure(latest?.id === run.id, 'A newer PR CI run exists for this head.');
}
async function requireFullSourceCi(github, context, pull, evidence) {
  const run = await getRun(github, context.repo, Number(evidence.sourceCiRunId));
  ensure(trustedSourceRun(run, context, pull, evidence), 'Source CI run is not the PR head run.');
  await requireLatestSourceRun(github, context, pull, run);
  const jobs = await runJobs(github, context, run);
  const missing = FULL_VALIDATION_JOBS.filter((name) => !succeeded(jobs, name));
  ensure(!missing.length, `Source CI did not run full validation: ${missing.join(', ')}`);
  return run;
}
async function reuseProof(github, context, candidate) {
  const revision = await queueRevision(github, context, candidate);
  const pull = await memberPull(github, context, candidate);
  const preview = await previewRun(github, context, pull.head.sha);
  await requirePublishedResult(github, context, preview);
  const evidence = await deploymentEvidence(github, context, preview, pull.head.sha);
  ensure(
    evidenceMatches(evidence, pull, revision.treeSha),
    'Queue tree differs from the PR preview tree.'
  );
  const ci = await requireFullSourceCi(github, context, pull, evidence);
  return {
    reused: true,
    pullRequest: pull.number,
    headSha: pull.head.sha,
    treeSha: revision.treeSha,
    baseSha: revision.baseSha,
    ciRunId: ci.id,
    previewRunId: preview.id,
    previewUrl: typeof evidence.url === 'string' ? evidence.url : null,
  };
}
function notReusable(error) {
  if ([NotReusable, QueueValidationError].some((type) => error instanceof type))
    return error.message;
  return [404, 410, 422].includes(error?.status) ? `GitHub returned ${error.status}.` : null;
}
/** Decide reuse for a queue candidate `{ headRepo, headBranch, headSha }`. Never throws for
 * missing or mismatched evidence; unexpected API failures propagate so callers fail closed. */
export async function findQueueReuse({ github, context, candidate }) {
  try {
    return await reuseProof(github, context, candidate);
  } catch (error) {
    const reason = notReusable(error);
    if (reason === null) throw error;
    return { reused: false, reason };
  }
}
function mergeGroupCandidate(context) {
  const group = context.payload?.merge_group ?? {};
  return {
    headRepo: repoName(context),
    headBranch: String(group.head_ref ?? '').replace(/^refs\/heads\//, ''),
    headSha: group.head_sha,
  };
}
async function safeQueueReuse(github, context, core) {
  return findQueueReuseOrFull({
    github,
    context,
    candidate: mergeGroupCandidate(context),
    warn: (message) => core.warning(message),
  });
}
/** Like findQueueReuse, but an unexpected lookup failure selects full validation instead. */
export async function findQueueReuseOrFull({ github, context, candidate, warn = () => {} }) {
  try {
    return await findQueueReuse({ github, context, candidate });
  } catch (error) {
    warn(`Queue reuse lookup failed; validating in full: ${error.message}`);
    return { reused: false, reason: 'Reuse lookup failed.' };
  }
}
/** CI `Validation plan` entry point for merge_group runs; reports `reused` as a step output. */
export async function reportQueueReuse({ github, context, core }) {
  const result = await safeQueueReuse(github, context, core);
  core.setOutput('reused', String(result.reused));
  if (result.reused)
    core.notice(
      `Queue tree ${result.treeSha} matches PR #${result.pullRequest} head ${result.headSha}: reusing CI run ${result.ciRunId} and preview run ${result.previewRunId}.`
    );
  else core.info(`Validating the queue commit in full: ${result.reason}`);
  return result;
}
