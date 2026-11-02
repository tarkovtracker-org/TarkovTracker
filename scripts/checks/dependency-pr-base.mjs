import { execFileSync } from 'node:child_process';
import { githubJson, requireEvidence, SHA } from './dependency-evidence.mjs';
function requirePull(pull, event, repository, candidate) {
  requireEvidence(
    [
      pull.state === 'open',
      pull.base?.ref === 'main',
      pull.base?.repo?.full_name === repository,
      pull.head?.sha === event.pull_request.head.sha,
      pull.merge_commit_sha === candidate,
    ].every(Boolean),
    'PR merge identity changed before dependency composition'
  );
}
function requireParents(commit, candidate, head) {
  requireEvidence(
    [
      commit.sha === candidate,
      commit.parents?.length === 2,
      SHA.test(commit.parents?.[0]?.sha),
      commit.parents?.[1]?.sha === head,
    ].every(Boolean),
    'PR merge does not have the authenticated base and head parents'
  );
}
function checkedOutCandidate(identity) {
  const candidate = identity.candidate ?? process.env.GITHUB_SHA;
  requireEvidence(SHA.test(candidate), 'PR composition requires an immutable merge revision');
  const checkout =
    identity.checkout ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  requireEvidence(checkout === candidate, 'PR merge revision does not match the checkout');
  return candidate;
}
/** A PR's cached base snapshot is not necessarily its current test merge's main parent. */
export async function compositionBase(
  event,
  repository,
  base,
  identity = {},
  request = githubJson
) {
  if (!event.pull_request) return base;
  requireEvidence(
    [
      SHA.test(event.pull_request.head?.sha),
      Number.isSafeInteger(event.number),
      event.number > 0,
    ].every(Boolean),
    'PR composition requires an immutable pull request identity'
  );
  const candidate = checkedOutCandidate(identity);
  const pull = await request(`repos/${repository}/pulls/${event.number}`);
  requirePull(pull, event, repository, candidate);
  const commit = await request(`repos/${repository}/git/commits/${candidate}`);
  requireParents(commit, candidate, event.pull_request.head.sha);
  const current = await request(`repos/${repository}/commits/main`);
  requireEvidence(
    current.sha === commit.parents[0].sha,
    'PR merge parent is no longer current trusted main'
  );
  return commit.parents[0].sha;
}
