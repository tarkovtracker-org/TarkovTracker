import { previewRolloutStart } from './request-authorization.mjs';
/** Automation-owned candidates retain their dedicated dispatchers. */
export function readinessEligible(pull, repo, request) {
  const current = pull ?? {};
  return [
    Number.isFinite(previewRolloutStart()),
    readyPull(current),
    sameRepositoryPull(current, repo),
    ordinaryPull(current),
    request?.enabled !== false,
  ].every(Boolean);
}
function readyPull(pull) {
  const base = pull.base ?? {};
  return [pull.state === 'open', pull.draft === false, base.ref === 'main'].every(Boolean);
}
function sameRepositoryPull(pull, repo) {
  const head = pull.head ?? {};
  return head.repo?.full_name === `${repo.owner}/${repo.repo}`;
}
function ordinaryPull(pull) {
  const user = pull.user ?? {};
  const head = pull.head ?? {};
  return [
    user.type === 'User',
    user.id !== 49699333,
    !String(head.ref).startsWith('wip/release-'),
    head.ref !== 'locales',
  ].every(Boolean);
}
/** Readiness uses current PR CI, never an independently authorized branch CI dispatch. */
export function assertReadinessCi(run, pull) {
  const snapshots = run.pull_requests ?? [];
  const matching = snapshots.some((item) =>
    [
      item.number === pull.number,
      item.head?.sha === pull.head.sha,
      item.base?.sha === pull.base.sha,
    ].every(Boolean)
  );
  if (run.event !== 'pull_request' || !matching)
    throw new Error('Readiness requires CI for the current PR head and base.');
}
