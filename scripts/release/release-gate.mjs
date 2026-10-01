import { findReleaseRecovery } from './release-recovery.mjs';
const CI_PATH = '.github/workflows/ci.yml';
const MAIN_REF = 'refs/heads/main';
const FULL_SHA = /^[0-9a-f]{40}$/;
// Releases are batched: only the weekly schedule or an explicit maintainer dispatch publishes.
const RELEASE_EVENTS = new Set(['schedule', 'workflow_dispatch']);
function mainCiRun(run) {
  return ['push', 'workflow_dispatch'].includes(run?.event) && run.head_branch === 'main';
}
function sameRepositoryCi(run, repositoryId) {
  return run.head_repository?.id === repositoryId && run.path === CI_PATH;
}
function trustedRun(run, repositoryId, sha) {
  return mainCiRun(run) && run.head_sha === sha && sameRepositoryCi(run, repositoryId);
}
function completedSuccessfully(run) {
  return run.status === 'completed' && run.conclusion === 'success';
}
function explicitlySkipsAutomation(run) {
  const message = run.head_commit?.message ?? '';
  return (
    /\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/i.test(message) ||
    /^skip-checks:[ \t]*true[ \t]*\r?$/im.test(message)
  );
}
/**
 * The release candidate is the run's own trigger commit. `context.sha` is fixed for the whole run
 * and reused by reruns, so interrupted publication can still identify the original commit.
 */
function candidateSha(context) {
  const releaseRun = RELEASE_EVENTS.has(context.eventName) && context.ref === MAIN_REF;
  return releaseRun && FULL_SHA.test(String(context.sha)) ? context.sha : null;
}
// A rerun keeps its run id but restarts, so order by the latest attempt's start time, then id.
function latestAttempt(a, b) {
  const started = (run) => Date.parse(run.run_started_at) || 0;
  return started(b) - started(a) || b.id - a.id;
}
// The most recently executed trusted main CI run for the candidate decides, so a later failed or
// in-progress attempt is never bypassed by an older success.
async function latestCiRun({ github, context, sha }) {
  const repositoryId = context.payload.repository.id;
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: 'ci.yml',
    branch: 'main',
    head_sha: sha,
    per_page: 100,
  });
  const runs = data.workflow_runs.filter((run) => trustedRun(run, repositoryId, sha));
  return runs.sort(latestAttempt)[0] ?? null;
}
function ciProblem(run) {
  if (!run) return 'No main CI run exists for this commit.';
  if (!completedSuccessfully(run)) return `Latest main CI for this commit is ${run.status}.`;
  if (explicitlySkipsAutomation(run)) return 'The commit skips automation.';
  return null;
}
// Re-read CI and main each time: a CI rerun or a newer merge can supersede the candidate.
export async function releaseEligibility({ github, context, allowRecovery = false }) {
  const skip = (reason) => ({ release: false, reason });
  const sha = candidateSha(context);
  if (!sha) return skip('Only scheduled or dispatched release runs on main may publish.');
  const problem = ciProblem(await latestCiRun({ github, context, sha }));
  if (problem) return skip(`${problem} Publication is not authorized.`);
  const { data: main } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (main.object.sha !== sha) {
    return staleMain({ github, context, baseSha: sha, sha: main.object.sha }, allowRecovery);
  }
  return { release: true, sha, reason: `Release validated main commit ${sha}.` };
}
// A retry can resume publication only for the exact validated version child, never arbitrary main.
async function staleMain(evidence, allowRecovery) {
  const skip = {
    release: false,
    reason: 'Validated commit is no longer main; the next release run will cover its successor.',
  };
  if (!allowRecovery) return skip;
  const recovery = await findReleaseRecovery(evidence);
  if (!recovery) return skip;
  return {
    release: false,
    recovery,
    reason: `Recover validated release ${recovery.version} at ${recovery.sha}.`,
  };
}
