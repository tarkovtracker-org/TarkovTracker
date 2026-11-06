import { queuedRelease } from './release-promotion.mjs';
import { findReleaseRecovery } from './release-recovery.mjs';
const CI_PATH = '.github/workflows/ci.yml';
const MAIN_REF = 'refs/heads/main';
const FULL_SHA = /^[0-9a-f]{40}$/;
// Daily opportunities catch up missed releases; only one scheduled publication per seven days.
const RELEASE_EVENTS = new Set(['schedule', 'workflow_dispatch']);
const RELEASE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
function parsePublicationDate(value) {
  const invalid = () => new Error('Invalid stable release publication date.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) throw invalid();
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value.replace('Z', '.000Z')
  )
    throw invalid();
  return timestamp;
}
function publicationTime(release) {
  if (release.draft || release.prerelease) return 0;
  return parsePublicationDate(release.published_at);
}
async function scheduledCooldown({ github, context, now }) {
  if (context.eventName !== 'schedule') return null;
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...context.repo,
    per_page: 100,
  });
  const latest = Math.max(0, ...releases.map(publicationTime));
  if (!latest || now >= latest + RELEASE_INTERVAL_MS) return null;
  const due = new Date(latest + RELEASE_INTERVAL_MS).toISOString();
  return `Weekly release is not due until ${due}; recent stable publication includes manual releases.`;
}
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
  if (context.ref !== MAIN_REF) return null;
  if (![...RELEASE_EVENTS, 'workflow_run'].includes(context.eventName)) return null;
  const sha = eventSha(context);
  return FULL_SHA.test(String(sha)) ? sha : null;
}
function eventSha(context) {
  if (context.eventName === 'workflow_run') return context.payload.workflow_run?.head_sha;
  return context.sha;
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
async function publicationProblem(evidence) {
  const cooldown = await scheduledCooldown(evidence);
  if (cooldown) return cooldown;
  const problem = await mainValidationProblem(evidence);
  return problem ? `${problem} Publication is not authorized.` : null;
}
// Re-read CI and main each time: a CI rerun or a newer merge can supersede the candidate.
export async function releaseEligibility({
  github,
  context,
  allowRecovery = false,
  validatePromotion = false,
  now = Date.now(),
}) {
  const skip = (reason) => ({ release: false, reason });
  const sha = await validatedCandidateSha(github, context);
  if (!sha)
    return skip(
      'Only scheduled/dispatched main preparation or trusted main CI finalization may publish.'
    );
  const problem = await publicationProblem({ github, context, sha, now });
  if (problem) return skip(problem);
  const { data: main } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (main.object.sha !== sha) {
    return staleMain({ github, context, baseSha: sha, sha: main.object.sha }, allowRecovery);
  }
  return currentRelease({ github, context, sha, validatePromotion });
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
async function currentRelease({ github, context, sha, validatePromotion }) {
  const promotion = await queuedRelease({
    github,
    context,
    sha,
    requireValidation: validatePromotion,
  });
  if (promotion) return promotion;
  if (!RELEASE_EVENTS.has(context.eventName))
    return {
      release: false,
      reason:
        'Main CI wakeups finalize only pending reviewed versions; preparation retains schedule/dispatch cadence.',
    };
  return { release: true, sha, reason: `Release validated main commit ${sha}.` };
}
/** Shared read-only main CI proof for the operator's local recovery preparation. */
export async function mainValidationProblem(evidence) {
  return ciProblem(await latestCiRun(evidence));
}
async function trustedFinalizationWakeup(github, context, sha) {
  if (context.eventName !== 'workflow_run') return true;
  const source = context.payload.workflow_run;
  if (!Number.isSafeInteger(source.id)) return false;
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: source.id,
  });
  return verifiedFinalizationRun(run, source, context.payload.repository.id, sha);
}
function verifiedFinalizationRun(run, source, repositoryId, sha) {
  return [
    run.id === source.id,
    run.run_attempt === source.run_attempt,
    trustedRun(run, repositoryId, sha),
    completedSuccessfully(run),
    !explicitlySkipsAutomation(run),
  ].every(Boolean);
}
async function validatedCandidateSha(github, context) {
  const sha = candidateSha(context);
  if (!sha) return null;
  if (!(await trustedFinalizationWakeup(github, context, sha))) return null;
  return sha;
}
