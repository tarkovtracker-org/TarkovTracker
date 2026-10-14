import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import {
  activeQueueGroup,
  allPages,
  queuedRefs,
  queueIdentity,
  requirePrIdentity,
  reviewThreads,
  trustedActors,
} from './review-admission-api.mjs';
import { dependencyEligibility } from './review-admission-dependencies.mjs';
import { requireQueueIssuer, requireReceiptIssuer } from './review-admission-issuer.mjs';
import { admissionDecision, CONTEXT, requireEvidence, SHA } from './review-admission-policy.mjs';
import { releaseAssetsEligibility, requireReleaseSource } from './review-admission-release.mjs';
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
  const comments = await allPages(github, github.rest.issues.listComments, {
    ...repo,
    issue_number: pr.number,
  });
  const checks = await allPages(github, github.rest.checks.listForRef, {
    ...repo,
    ref: pr.head.sha,
    filter: 'latest',
  });
  const threads = await reviewThreads(github, repo, pr.number);
  const trusted = await trustedActors(github, repo, reviews, comments);
  const dependencySafe = await dependencyEligibility(github, pr, files);
  const releaseSafe = await releaseAssetsEligibility(github, pr, files);
  return { pr, files, reviews, comments, checks, threads, trusted, dependencySafe, releaseSafe };
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
    'Checking exact-head independent review and sensitive approval.'
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
export async function publishReviewAdmission({ github, context, sha }) {
  requireEvidence(SHA.test(sha), 'Publication requires exact admission SHA.');
  try {
    const result = await uploadedReceipt(github, context, sha);
    const decision = await currentReceiptDecision(github, context, result);
    requireSameDecision(result, decision);
    await status(
      github,
      context,
      sha,
      'success',
      `Verified ${decision.review.provider} review; ${decision.risk} risk admission approved.`
    );
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
function sourceHead(payload) {
  return payload.check_suite?.head_sha ?? payload.workflow_run?.head_sha;
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
  const head = sourceHead(context.payload);
  if (!head) return [];
  const pulls = await allPages(github, github.rest.pulls.list, {
    ...context.repo,
    state: 'open',
    base: 'main',
  });
  return pulls.filter((pr) => pr.head.sha === head).map((pr) => ({ number: pr.number }));
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
  await scopeStatuses(
    github,
    context,
    shas,
    'pending',
    'Rechecking PR and queue review admission after evidence changes.'
  );
  try {
    const group = await activeQueueGroup(github, context.repo, pr, refs);
    requireEventGroup(target.group, group);
    return { number: pr.number, group, shas };
  } catch (error) {
    await scopeStatuses(github, context, shas, 'failure', error.message);
    throw error;
  }
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
function sensitiveCommand(body) {
  return typeof body === 'string' && body.trimStart().startsWith('/approve-sensitive ');
}
export function relevantComment(payload) {
  return [payload.comment?.body, payload.changes?.body?.from].some(sensitiveCommand);
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
  requireEvidence(selected.length === 1, 'No exact-head pull request could be identified.');
  await evaluateScope(github, context, core, selected[0], source);
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
