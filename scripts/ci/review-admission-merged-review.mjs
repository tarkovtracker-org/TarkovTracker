import { allPages, requirePrIdentity } from './review-admission-api.mjs';
import { requireEvidence, SHA } from './review-admission-policy.mjs';
export function unlinkedReview(run) {
  return [
    ['pull_request_review', 'pull_request_review_comment'].includes(run.event),
    Array.isArray(run.pull_requests),
    run.pull_requests?.length === 0,
  ].every(Boolean);
}
function repositoryIdentity(repository) {
  if (!repository) return false;
  return [
    Number.isSafeInteger(repository.id),
    repository.id > 0,
    /^[^/\s:]+\/[^/\s:]+$/.test(repository.full_name),
    repository.url === `https://api.github.com/repos/${repository.full_name}`,
  ].every(Boolean);
}
function sameRepository(actual, expected) {
  return [
    repositoryIdentity(actual),
    actual?.id === expected.id,
    actual?.full_name === expected.full_name,
    actual?.url === expected.url,
  ].every(Boolean);
}
function requireRecoverySource(context, run) {
  const repository = context.payload.repository;
  requireEvidence(repositoryIdentity(repository), 'Missing review signal repository identity.');
  requireEvidence(
    [
      repository.full_name === `${context.repo.owner}/${context.repo.repo}`,
      sameRepository(run.repository, repository),
      repositoryIdentity(run.head_repository),
      typeof run.head_branch === 'string',
      /^[^:\s]+$/.test(run.head_branch ?? ''),
      SHA.test(run.head_sha),
    ].every(Boolean),
    'Merged review signal source identity mismatch.'
  );
}
function requireRecoveryTarget(pr, context, run) {
  requirePrIdentity(pr, context.repo);
  requireEvidence(
    [
      Number.isSafeInteger(pr.number),
      pr.number > 0,
      pr.url === `${run.repository.url}/pulls/${pr.number}`,
      sameRepository(pr.base.repo, run.repository),
      sameRepository(pr.head.repo, run.head_repository),
      pr.head.ref === run.head_branch,
      pr.head.sha === run.head_sha,
      pr.state === 'closed',
      typeof pr.merged_at === 'string',
      Number.isFinite(Date.parse(pr.merged_at)),
    ].every(Boolean),
    'Merged review signal PR identity mismatch.'
  );
}
function conflictsWithSignal(pr, run) {
  const branch = [
    sameRepository(pr.head?.repo, run.head_repository),
    pr.head?.ref === run.head_branch,
  ].every(Boolean);
  return [branch, pr.head?.sha === run.head_sha].some(Boolean);
}
export async function recoverMergedReview(github, context, run) {
  requireEvidence(unlinkedReview(run), 'Only unlinked review signals can recover a merged PR.');
  requireRecoverySource(context, run);
  // Commit association alone omits closed, unmerged PRs once the commit is on main.
  // Read the full branch history and reject ambiguity, including branch reuse.
  const candidates = await allPages(github, github.rest.pulls.list, {
    ...context.repo,
    state: 'all',
    base: 'main',
    head: `${run.head_repository.full_name.split('/')[0]}:${run.head_branch}`,
  });
  requireEvidence(candidates.length === 1, 'Merged review signal target is missing or ambiguous.');
  const candidate = candidates[0];
  requireRecoveryTarget(candidate, context, run);
  const active = await allPages(github, github.rest.pulls.list, {
    ...context.repo,
    state: 'open',
    base: 'main',
  });
  requireEvidence(
    !active.some((pr) => conflictsWithSignal(pr, run)),
    'Merged review signal conflicts with an active PR.'
  );
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: candidate.number,
  });
  requireRecoveryTarget(current, context, run);
  requireEvidence(
    current.number === candidate.number && current.merged === true,
    'Merged review signal target changed or was not merged.'
  );
  return { number: current.number, obsoleteMergedReview: true };
}
export async function linkedReviewTarget(github, context, run, target) {
  if (!['pull_request_review', 'pull_request_review_comment'].includes(run.event)) return target;
  const { data: pr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: target.number,
  });
  requirePrIdentity(pr, context.repo);
  requireEvidence(pr.number === target.number, 'Linked review signal PR number changed.');
  // A unique service-owned PR link already binds this event. Active PR signals
  // keep their existing tolerance for old heads and synthetic merge commits.
  if (pr.state === 'closed' && pr.merged === true) {
    return { ...target, obsoleteMergedReview: true };
  }
  return target;
}
