import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { approvalCommandPrefix, currentAdminAttestation } from './review-admission-attestation.mjs';
import {
  activeQueueGroup,
  allPages,
  queuedRefs,
  queueIdentity,
  requirePrIdentity,
  reviewThreads,
  trustedActors,
} from './review-admission-api.mjs';
import { readAdmissionArchive } from './review-admission-binding.mjs';
import { codeRabbitCommentEvent, readCodeRabbitComments } from './review-admission-coderabbit.mjs';
import { crowdinEligibility } from './review-admission-crowdin.mjs';
import { dependencyEligibility } from './review-admission-dependencies.mjs';
import { requireQueueIssuer, requireReceiptIssuer } from './review-admission-issuer.mjs';
import {
  admissionDecision,
  AdmissionHeld,
  CONTEXT,
  requireEvidence,
  SHA,
} from './review-admission-policy.mjs';
import { releaseAssetsEligibility, requireReleaseSource } from './review-admission-release.mjs';
const QUEUE_SUITE_BRANCH = /^gh-readonly-queue\/main\/pr-[1-9]\d*-[a-f0-9]{40}$/;
async function evidence(github, repo, pr) {
  const files = await allPages(github, github.rest.pulls.listFiles, {
    ...repo,
    pull_number: pr.number,
  });
  requireEvidence(files.length === pr.changed_files, 'Changed file list was truncated.');
  requireEvidence(
    new Set(files.map((file) => file.filename)).size === files.length,
    'Changed files contain duplicate records.'
  );
  const reviews = await allPages(github, github.rest.pulls.listReviews, {
    ...repo,
    pull_number: pr.number,
  });
  const listedComments = await allPages(github, github.rest.issues.listComments, {
    ...repo,
    issue_number: pr.number,
  });
  const comments = await readCodeRabbitComments(github, listedComments);
  const checks = await allPages(github, github.rest.checks.listForRef, {
    ...repo,
    ref: pr.head.sha,
    filter: 'latest',
  });
  const threads = await reviewThreads(github, repo, pr.number);
  const trusted = await trustedActors(github, repo, reviews, comments);
  const crowdinSafe = await crowdinEligibility(github, pr, files);
  const dependencySafe = await dependencyEligibility(github, pr, files);
  const releaseSafe = await releaseAssetsEligibility(github, pr, files);
  const adminAttestation = await currentAdminAttestation(
    github,
    repo,
    listedComments,
    pr.head.sha
  ).catch(() => null);
  return {
    pr,
    files,
    reviews,
    comments,
    checks,
    threads,
    trusted,
    crowdinSafe,
    dependencySafe,
    releaseSafe,
    adminAttestation,
  };
}
function receipt(context, pr, statusSha, decision, source, issuer) {
  return {
    schema: 1,
    issuer,
    repository: `${context.repo.owner}/${context.repo.repo}`,
    number: pr.number,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    statusSha,
    ...decision,
    runId: Number(context.runId),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    workflowSourceSha: source,
  };
}
async function unchangedPr(github, repo, pr) {
  const { data: current } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
  requireEvidence(current.head.sha === pr.head.sha, 'PR head changed during review admission.');
  requireEvidence(current.base.sha === pr.base.sha, 'PR base changed during review admission.');
  requireEvidence(current.state === 'open' && !current.draft, 'PR is no longer ready.');
}
async function status(github, context, sha, state, description) {
  requireEvidence(SHA.test(sha), 'Cannot publish without an exact SHA.');
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha,
    state,
    context: CONTEXT,
    description: description.slice(0, 140),
    target_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
  });
}
export async function evaluateAdmission({ github, context, number, group, source }) {
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  requirePrIdentity(pr, context.repo);
  const statusSha = group?.head_sha ?? pr.head.sha;
  await status(
    github,
    context,
    statusSha,
    'pending',
    'Checking exact-head review policy and sensitive approval.'
  );
  try {
    return await checkedAdmission({ github, context, pr, group, source, statusSha });
  } catch (error) {
    await status(github, context, statusSha, 'failure', error.message);
    throw error;
  }
}
async function initialQueueProof(github, repo, group, pr) {
  if (!group) return;
  requireQueueIssuer(github);
  await queueIdentity(github, repo, group, pr);
}
async function checkedAdmission({ github, context, pr, group, source, statusSha }) {
  await initialQueueProof(github, context.repo, group, pr);
  const initial = await evidence(github, context.repo, pr);
  if (group) await requireReleaseSource(github, context.repo, pr, group, initial.files);
  admissionDecision(initial);
  await unchangedPr(github, context.repo, pr);
  if (group) await queueIdentity(github, context.repo, group, pr);
  // Re-read live findings/permissions immediately before publishing, after queue identity proof.
  const decision = admissionDecision(await evidence(github, context.repo, pr));
  await unchangedPr(github, context.repo, pr);
  const result = receipt(context, pr, statusSha, decision, source, github.reviewAdmissionIssuer);
  await mkdir('review-admission-evidence', { recursive: true });
  await writeFile(
    `review-admission-evidence/${statusSha}.json`,
    `${JSON.stringify(result, null, 2)}\n`
  );
  return result;
}
async function uploadedReceipt(github, context, sha) {
  const artifacts = await allPages(github, github.rest.actions.listWorkflowRunArtifacts, {
    ...context.repo,
    run_id: Number(context.runId),
  });
  const matches = artifacts.filter((artifact) => artifact.name === `review-admission-${sha}`);
  requireEvidence(matches.length === 1, 'Uploaded admission receipt is missing or ambiguous.');
  requireEvidence(!matches[0].expired, 'Uploaded admission receipt expired.');
  const result = JSON.parse(await readFile(`review-admission-evidence/${sha}.json`, 'utf8'));
  requireEvidence(result.statusSha === sha, 'Uploaded receipt status revision mismatch.');
  return result;
}
async function currentReceiptDecision(github, context, result) {
  requireReceiptIssuer(result);
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: result.number });
  requirePrIdentity(pr, context.repo);
  requireEvidence(pr.head.sha === result.headSha, 'PR head changed after evidence upload.');
  requireEvidence(pr.base.sha === result.baseSha, 'PR base changed after evidence upload.');
  const selected = await targets(github, context);
  requireEvidence(
    selected.length === 1 && selected[0].number === pr.number,
    'Admission publication target changed.'
  );
  const group = await publicationGroup(github, context, pr, result);
  if (group) await queueIdentity(github, context.repo, group, pr);
  const live = await evidence(github, context.repo, pr);
  if (group) await requireReleaseSource(github, context.repo, pr, group, live.files);
  const decision = admissionDecision(live);
  await publicationRevision(github, context, pr, group);
  return decision;
}
async function publicationGroup(github, context, pr, result) {
  if (result.statusSha === pr.head.sha) return null;
  requireQueueIssuer(github);
  const refs = await queuedRefs(github, context.repo, pr.number);
  const group = await activeQueueGroup(github, context.repo, pr, refs);
  requireEvidence(
    group?.head_sha === result.statusSha,
    'Current queue group changed after evidence upload.'
  );
  return group;
}
async function publicationRevision(github, context, pr, group) {
  await unchangedPr(github, context.repo, pr);
  if (group) await queueIdentity(github, context.repo, group, pr);
}
function requireSameDecision(result, decision) {
  const stored = {
    approved: result.approved,
    risk: result.risk,
    review: result.review,
    sensitiveApprovalId: result.sensitiveApprovalId,
  };
  requireEvidence(
    isDeepStrictEqual(stored, decision),
    'Review decision changed after evidence upload; recheck admission.'
  );
}
const EXEMPTION_SUMMARIES = {
  'crowdin-policy': 'Verified Crowdin translation policy exemption; low risk admission approved.',
  'release-policy': 'Verified generated release assets exemption; low risk admission approved.',
};
function admissionSummary(decision) {
  return (
    EXEMPTION_SUMMARIES[decision.review.provider] ??
    `Verified ${decision.review.provider} review; ${decision.risk} risk admission approved.`
  );
}
export async function publishReviewAdmission({ github, context, sha }) {
  requireEvidence(SHA.test(sha), 'Publication requires exact admission SHA.');
  try {
    const result = await uploadedReceipt(github, context, sha);
    const decision = await currentReceiptDecision(github, context, result);
    requireSameDecision(result, decision);
    await status(github, context, sha, 'success', admissionSummary(decision));
  } catch (error) {
    await status(github, context, sha, 'failure', error.message);
    throw error;
  }
}
function directNumber(payload) {
  return [
    payload.pull_request?.number,
    payload.issue?.number,
    Number(payload.inputs?.pull_request),
  ].find(Boolean);
}
function queueRun(payload) {
  const run = payload.workflow_run;
  if (run?.event !== 'merge_group') return null;
  return { head_ref: `refs/heads/${run.head_branch}`, head_sha: run.head_sha };
}
async function groupForRun(github, repo, run) {
  const { data: commit } = await github.rest.git.getCommit({ ...repo, commit_sha: run.head_sha });
  return { ...run, base_ref: 'refs/heads/main', base_sha: commit.parents?.[0]?.sha };
}
async function targets(github, context) {
  const queued = queueRun(context.payload);
  if (queued) return queueTarget(github, context.repo, queued);
  const direct = directNumber(context.payload);
  if (direct) return [{ number: direct }];
  if (context.eventName !== 'workflow_run') return [];
  return signalTargets(github, context);
}
async function signalTargets(github, context) {
  const run = await validatedSignalRun(github, context);
  if (run.event === 'check_suite') return suiteTargets(github, context.repo, run);
  return linkedPullTarget(run.pull_requests, context.repo);
}
function linkedPullTarget(pulls, repo) {
  requireEvidence(
    Array.isArray(pulls) && pulls.length === 1,
    'Signal PR identity is missing or ambiguous.'
  );
  const pr = pulls[0];
  const repositoryUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  requireEvidence(
    [
      Number.isSafeInteger(pr.number),
      pr.number > 0,
      pr.url === `${repositoryUrl}/pulls/${pr.number}`,
      pr.base?.ref === 'main',
      pr.base?.repo?.url === repositoryUrl,
    ].every(Boolean),
    'Signal PR repository identity mismatch.'
  );
  return [{ number: pr.number }];
}
async function signalLocator(github, repo, run) {
  const artifacts = await allPages(github, github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: run.id,
  });
  const matches = artifacts.filter(
    (item) => item.name === `review-admission-signal-${run.run_attempt}`
  );
  requireEvidence(matches.length === 1, 'Signal locator is missing or ambiguous.');
  const artifact = matches[0];
  requireEvidence(
    !artifact.expired && artifact.size_in_bytes <= 100000,
    'Signal locator expired or oversized.'
  );
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  });
  // Candidate artifacts are only locators. Authority comes from the suite API
  // and the fresh PR/review/queue checks, never from fields in this document.
  const locator = await readAdmissionArchive(Buffer.from(data), 'signal');
  requireEvidence(
    Number.isSafeInteger(locator.suiteId) && locator.suiteId > 0,
    'Invalid provider suite locator.'
  );
  return locator;
}
async function suiteTargets(github, repo, run) {
  requireEvidence(run.head_branch === 'main', 'Provider suite signal must run on main.');
  const locator = await signalLocator(github, repo, run);
  const { data: suite } = await github.rest.checks.getSuite({
    ...repo,
    check_suite_id: locator.suiteId,
  });
  requireProviderSuite(suite, repo, locator.suiteId);
  if (queueCommitSuite(suite)) return null;
  if (suite.pull_requests?.length) return linkedPullTarget(suite.pull_requests, repo);
  const pulls = await allPages(github, github.rest.pulls.list, {
    ...repo,
    state: 'open',
    base: 'main',
  });
  const matches = pulls.filter((pr) => pr.head.sha === suite.head_sha);
  return linkedPullTarget(matches, repo);
}
// Providers also check GitHub's temporary queue commits. Those suites are not review evidence
// (admission binds the member PR head) and the group's own merge_group signal already drives
// queue admission, so an authenticated provider suite on a queue ref selects no target.
function queueCommitSuite(suite) {
  return QUEUE_SUITE_BRANCH.test(suite.head_branch ?? '') && !suite.pull_requests?.length;
}
function requireProviderSuite(suite, repo, id) {
  requireEvidence(
    [
      suite.id === id,
      suite.url === `https://api.github.com/repos/${repo.owner}/${repo.repo}/check-suites/${id}`,
      [347564, 1082092].includes(suite.app?.id),
      suite.status === 'completed',
      SHA.test(suite.head_sha),
    ].every(Boolean),
    'Signal provider suite identity mismatch.'
  );
}
async function queueTarget(github, repo, queued) {
  const match = /^refs\/heads\/gh-readonly-queue\/main\/pr-(\d+)-[a-f0-9]+$/.exec(queued.head_ref);
  requireEvidence(Boolean(match), 'Queue ref cannot be mapped to one PR.');
  return [{ number: Number(match[1]), group: await groupForRun(github, repo, queued) }];
}
function signalRunIdentity(run, context) {
  requireEvidence(
    run.path === '.github/workflows/review-admission-signal.yml',
    'Admission signal workflow path mismatch.'
  );
  requireEvidence(
    run.repository.full_name === `${context.repo.owner}/${context.repo.repo}`,
    'Admission signal repository mismatch.'
  );
  requireEvidence(
    ['pull_request_review', 'pull_request_review_comment', 'merge_group', 'check_suite'].includes(
      run.event
    ),
    'Admission signal event is unsupported.'
  );
}
async function validatedSignalRun(github, context) {
  const event = context.payload.workflow_run;
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    ...context.repo,
    run_id: event.id,
    attempt_number: event.run_attempt,
  });
  signalRunIdentity(run, context);
  requireEvidence(
    [
      run.id === event.id,
      run.run_attempt === event.run_attempt,
      run.head_sha === event.head_sha,
      run.event === event.event,
      run.status === 'completed',
      run.conclusion === 'success',
    ].every(Boolean),
    'Admission signal run metadata changed or did not succeed.'
  );
  return run;
}
async function requireSignal(github, context) {
  if (context.eventName !== 'workflow_run') return;
  const run = await validatedSignalRun(github, context);
  const jobs = await allPages(github, github.rest.actions.listJobsForWorkflowRunAttempt, {
    ...context.repo,
    run_id: run.id,
    attempt_number: run.run_attempt,
  });
  const signals = jobs.filter((job) => job.name === 'Admission signal');
  requireEvidence(signals.length === 1, 'Admission signal is missing or ambiguous.');
  const signal = signals[0];
  requireEvidence(
    [
      signal.status === 'completed',
      signal.conclusion === 'success',
      signal.head_sha === run.head_sha,
      signal.run_id === run.id,
      signal.run_attempt === run.run_attempt,
    ].every(Boolean),
    'Admission signal did not complete for this exact run attempt.'
  );
}
async function scopeStatuses(github, context, shas, state, description) {
  for (const sha of shas) await status(github, context, sha, state, description);
}
async function reviewScope(github, context, target) {
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: target.number });
  requirePrIdentity(pr, context.repo);
  const refs = await queuedRefs(github, context.repo, pr.number);
  const shas = [...new Set([pr.head.sha, ...refs.map((ref) => ref.object.sha)])];
  let group;
  try {
    group = await activeQueueGroup(github, context.repo, pr, refs);
  } catch (error) {
    await scopeStatuses(github, context, shas, 'failure', error.message);
    throw error;
  }
  // An old merge-group signal has no authority to invalidate its replacement.
  // Discovery errors still revoke the known scope; a proven obsolete target does not.
  requireEventGroup(target.group, group);
  await scopeStatuses(
    github,
    context,
    shas,
    'pending',
    'Rechecking PR and queue review admission after evidence changes.'
  );
  return { number: pr.number, group, shas };
}
function requireEventGroup(eventGroup, current) {
  if (!eventGroup) return;
  requireEvidence(
    current?.head_sha === eventGroup.head_sha,
    'Requested queue group is no longer current.'
  );
}
async function evaluateScope(github, context, core, target, source) {
  const scope = await reviewScope(github, context, target);
  try {
    const head = await evaluateAdmission({ github, context, number: scope.number, source });
    core.setOutput('admission_sha', head.statusSha);
    if (scope.group) await evaluateQueuedScope(github, context, core, scope, source);
  } catch (error) {
    await scopeStatuses(github, context, scope.shas, 'failure', error.message);
    throw error;
  }
}
async function evaluateQueuedScope(github, context, core, scope, source) {
  const queued = await evaluateAdmission({
    github,
    context,
    number: scope.number,
    group: scope.group,
    source,
  });
  core.setOutput('queue_sha', queued.statusSha);
}
function approvalComment(payload) {
  return [payload.comment?.body, payload.changes?.body?.from].some(approvalCommandPrefix);
}
export function relevantComment(payload) {
  return [approvalComment(payload), codeRabbitCommentEvent(payload)].some(Boolean);
}
function relevantPrComment(payload) {
  return Boolean(payload.issue?.pull_request) && relevantComment(payload);
}
async function successfulSignal(github, context) {
  if (context.payload.workflow_run.conclusion !== 'success') return false;
  await requireSignal(github, context);
  return true;
}
export async function filterAdmission({ github, context }) {
  if (context.eventName === 'issue_comment') return relevantPrComment(context.payload);
  if (context.eventName === 'workflow_run') return successfulSignal(github, context);
  return true;
}
export async function runReviewAdmission({ github, context, core }) {
  if (context.eventName === 'issue_comment' && !relevantComment(context.payload)) {
    core.notice('Unrelated issue comment does not affect review admission.');
    return;
  }
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  requireEvidence(SHA.test(source), 'Trusted checkout source is not immutable.');
  await requireSignal(github, context);
  const selected = await targets(github, context);
  if (selected === null) {
    core.notice(
      'Provider suite on a merge-queue commit is not review evidence; no status changed.'
    );
    return;
  }
  requireEvidence(selected.length === 1, 'No exact-head pull request could be identified.');
  await evaluateScope(github, context, core, selected[0], source);
}
// Workflow entry point. A policy hold (draft or closed PR, review missing, open findings, sensitive approval
// missing) has already failed every scope status, which is the actual gate, so the run ends green
// with a notice instead of producing a red run for every review event. Integrity, identity and
// API errors still fail the run. A hold after any receipt output was set stays a failure so later
// upload/publication steps cannot run.
export async function runReviewAdmissionStep({ github, context, core }) {
  const outputs = new Set();
  const tracked = Object.assign(Object.create(core), {
    setOutput(name, value) {
      outputs.add(name);
      core.setOutput(name, value);
    },
  });
  try {
    await runReviewAdmission({ github, context, core: tracked });
  } catch (error) {
    if (!(error instanceof AdmissionHeld) || receiptOutput(outputs)) throw error;
    core.notice(`Review admission held: ${error.message}`);
  }
}
function receiptOutput(outputs) {
  return outputs.has('admission_sha') || outputs.has('queue_sha');
}
export async function publishReviewScope({ github, context, head, queued }) {
  const shas = [head, queued].filter(Boolean);
  try {
    for (const sha of shas) await publishReviewAdmission({ github, context, sha });
  } catch (error) {
    await scopeStatuses(github, context, shas, 'failure', error.message);
    throw error;
  }
}
