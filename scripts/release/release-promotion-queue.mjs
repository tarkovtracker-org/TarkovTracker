import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { candidateEvidence, promotionBranch } from './release-promotion.mjs';
const FULL_SHA = /^[0-9a-f]{40}$/;
const ADMISSION_PATH = '.github/workflows/review-admission.yml';
// Older Review Admission runs also uploaded a PR Controls refresh locator; it is never a receipt.
const ADMISSION_LOCATOR = /^review-admission-target-[1-9]\d*$/;
const RELEASE_PATH = '.github/workflows/release.yml';
const TRUSTED_ADMISSION_EVENTS = [
  'pull_request_target',
  'workflow_run',
  'issue_comment',
  'workflow_dispatch',
];
const QUEUE_QUERY = `query($owner:String!,$repo:String!,$number:Int!) {
  repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
    headRefOid mergeQueueEntry { id } }
  }
}`;
const skip = (reason) => ({ state: 'SKIPPED', reason });
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function requireTrigger(context) {
  requireCondition(
    context.eventName === 'workflow_run',
    'Release enqueue only accepts trusted workflow completion.'
  );
  const event = context.payload.workflow_run;
  requireCondition(Number.isSafeInteger(event?.id) && event.id > 0, 'Missing source run identity.');
  requireCondition(
    Number.isSafeInteger(event.run_attempt) && event.run_attempt > 0,
    'Missing source run attempt.'
  );
  return event;
}
function requireRunIdentity(run, repo, event) {
  requireCondition(run.id === event.id, 'Source run ID changed.');
  requireCondition(
    run.repository.full_name === `${repo.owner}/${repo.repo}`,
    'Foreign source repository.'
  );
  requireCondition(
    [ADMISSION_PATH, RELEASE_PATH].includes(run.path),
    'Unknown release enqueue source workflow.'
  );
  requireCondition(FULL_SHA.test(run.head_sha), 'Missing immutable source run revision.');
}
function requireMainSource(run, repo) {
  const identity = [run.head_branch, run.head_repository?.full_name];
  requireCondition(
    isDeepStrictEqual(identity, ['main', `${repo.owner}/${repo.repo}`]),
    'Source dispatch/release must use trusted main.'
  );
}
function requireSourceEvent(run, repo) {
  if (run.path === RELEASE_PATH) {
    requireMainSource(run, repo);
    if (run.event === 'workflow_run') return false; // Publication callback is not a preparation wakeup.
    requireCondition(
      ['schedule', 'workflow_dispatch'].includes(run.event),
      'Untrusted release source event.'
    );
    return true;
  }
  requireCondition(
    TRUSTED_ADMISSION_EVENTS.includes(run.event),
    'Untrusted admission source event.'
  );
  if (run.event === 'workflow_dispatch') requireMainSource(run, repo);
  return true;
}
async function sourceWakeup(github, context) {
  const event = requireTrigger(context);
  const repo = context.repo;
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: event.id });
  requireRunIdentity(run, repo, event);
  if (!requireSourceEvent(run, repo)) return null;
  if (!completedAttempt(run, event)) return null;
  if (run.path === RELEASE_PATH) await requirePolicySource(github, repo, run.head_sha);
  return run;
}
function completedAttempt(run, event) {
  if (run.run_attempt > event.run_attempt) return false;
  requireCondition(run.run_attempt === event.run_attempt, 'Source attempt identity changed.');
  if (run.status !== 'completed') return false;
  requireCondition(run.conclusion === 'success', 'Source workflow did not succeed.');
  return true;
}
async function requirePolicySource(github, repo, sha) {
  const { requireTrustedPolicySource } = await binding();
  await requireTrustedPolicySource(github, repo, sha);
}
async function sourceArtifacts(github, repo, run) {
  const prefix = run.path === ADMISSION_PATH ? 'review-admission-' : 'release-promotion-';
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: run.id,
    per_page: 100,
  });
  requireCondition(Array.isArray(artifacts), 'Incomplete source artifact metadata.');
  const matches = artifacts.filter(
    (artifact) => artifact.name.startsWith(prefix) && !ADMISSION_LOCATOR.test(artifact.name)
  );
  requireCondition(
    new Set(matches.map((artifact) => artifact.name)).size === matches.length,
    'Duplicate per-head source receipts.'
  );
  return matches.map((artifact) => checkedArtifact(artifact, prefix));
}
function checkedArtifact(artifact, prefix) {
  const head = artifact.name.slice(prefix.length);
  requireCondition(FULL_SHA.test(head), 'Invalid artifact revision.');
  requireCondition(artifact.expired === false, 'Source receipt expired.');
  const limit = prefix === 'review-admission-' ? 100000 : 1024 * 1024;
  requireCondition(
    Number.isSafeInteger(artifact.id) && artifact.size_in_bytes <= limit,
    'Invalid/oversized receipt.'
  );
  return { artifact, head };
}
async function binding() {
  return import(new URL('../ci/review-admission-binding.mjs', import.meta.url));
}
function checkedReceipt(receipt, repo, run, statusSha) {
  const identity = [
    receipt.schema,
    receipt.repository,
    receipt.statusSha,
    receipt.runId,
    receipt.runAttempt,
  ];
  requireCondition(
    isDeepStrictEqual(identity, [
      1,
      `${repo.owner}/${repo.repo}`,
      statusSha,
      run.id,
      run.run_attempt,
    ]),
    'Receipt source/attempt identity changed.'
  );
  requireCondition(FULL_SHA.test(receipt.headSha), 'Receipt head is missing.');
  requireCondition(receipt.approved === true, 'Receipt did not approve admission.');
  return receipt;
}
async function admissionCandidate(github, repo, run, source) {
  const { data } = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: source.artifact.id,
    archive_format: 'zip',
  });
  const { readAdmissionArchive } = await binding();
  const receipt = checkedReceipt(
    await readAdmissionArchive(Buffer.from(data), source.head),
    repo,
    run,
    source.head
  );
  // Admission event metadata may identify the candidate; the run-owned receipt records
  // the actual trusted checkout. Prove that source before considering even skipped PRs.
  await requirePolicySource(github, repo, receipt.workflowSourceSha);
  if (receipt.statusSha !== receipt.headSha) return null; // Integration receipts cannot enqueue a PR again.
  requireCondition(
    Number.isSafeInteger(receipt.number) && receipt.number > 0,
    'Receipt PR number is missing.'
  );
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: receipt.number });
  requireCondition(
    pr.head.sha === receipt.headSha,
    'Current PR head differs from admission receipt.'
  );
  return pr;
}
async function releaseCandidate(github, repo, run, source) {
  const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...repo,
    commit_sha: source.head,
    per_page: 100,
  });
  requireCondition(Array.isArray(prs), 'Incomplete promotion PR metadata.');
  const matches = prs.filter((pr) => promotionBranch(pr, repo) && pr.head.sha === source.head);
  if (!matches.length) return null;
  requireCondition(matches.length === 1, 'Ambiguous promotion PR identity.');
  const pr = matches[0];
  const branch = promotionBranch(pr, repo);
  requireCondition(
    isDeepStrictEqual([Number(branch[2]), Number(branch[3])], [run.id, run.run_attempt]),
    'Promotion does not belong to this preparation attempt.'
  );
  return pr;
}
async function discoveredCandidate(github, repo, run) {
  const sources = await sourceArtifacts(github, repo, run);
  const candidates = [];
  for (const source of sources) await collectCandidate(candidates, github, repo, run, source);
  if (!candidates.length) return null;
  requireCondition(candidates.length === 1, 'Ambiguous generated version PRs.');
  return candidates[0];
}
async function collectCandidate(candidates, github, repo, run, source) {
  const pr =
    run.path === ADMISSION_PATH
      ? await admissionCandidate(github, repo, run, source)
      : await releaseCandidate(github, repo, run, source);
  if (!pr) return;
  if (!pr.head.ref.startsWith('wip/release-')) return;
  requireReleaseIdentity(pr, repo);
  candidates.push(pr);
}
function requireReleaseIdentity(pr, repo) {
  const branch = promotionBranch(pr, repo);
  requireCondition(
    Boolean(branch),
    'Only canonical same-repository generated release PRs may enqueue.'
  );
  requireCondition(
    pr.base.repo.full_name === `${repo.owner}/${repo.repo}`,
    'PR base repository changed.'
  );
  requireCondition(FULL_SHA.test(pr.head.sha), 'Release PR head is missing.');
  return branch;
}
async function alreadyQueued(github, repo, pr) {
  const data = await github.graphql(QUEUE_QUERY, { ...repo, number: pr.number });
  const queried = data.repository?.pullRequest;
  requireCondition(Boolean(queried), 'Queue PR metadata missing.');
  requireCondition(queried.headRefOid === pr.head.sha, 'Queue PR head changed.');
  return Boolean(queried.mergeQueueEntry);
}
async function preparationReady(github, repo, branch) {
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    ...repo,
    run_id: Number(branch[2]),
    attempt_number: Number(branch[3]),
  });
  if (['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(run.status))
    return false;
  requireCondition(
    run.status === 'completed' && run.conclusion === 'success',
    'Release preparation failed.'
  );
  return true;
}
async function approvedAdmission(github, repo, pr) {
  const { requireReviewAdmission } = await binding();
  try {
    await requireReviewAdmission({ github, repo, head: pr.head.sha, number: pr.number });
    return true;
  } catch (error) {
    const { AdmissionPending } = await import(
      new URL('../ci/review-admission-policy.mjs', import.meta.url)
    );
    if (error instanceof AdmissionPending) return false;
    throw error;
  }
}
function liveIdentity(current, expected, repo) {
  requireReleaseIdentity(current, repo);
  requireCondition(
    current.number === expected.number && current.head.sha === expected.head.sha,
    'Release head changed before enqueue.'
  );
  return current.state === 'open' && !current.draft;
}
/** Only trusted main tooling may execute policy/merge CLI; no candidate code or bypass flags. */
export function queueOperations(repo) {
  const repository = `${repo.owner}/${repo.repo}`;
  const env = { ...process.env, GITHUB_REPOSITORY: repository, GH_TOKEN: process.env.GITHUB_TOKEN };
  const gate = fileURLToPath(new URL('../ci/github-ci-gate.sh', import.meta.url));
  const policy = () =>
    execFileSync(
      '/bin/bash',
      ['-euo', 'pipefail', '-c', 'source "$1"; main_policy_mode', 'release-policy', gate],
      { env, encoding: 'utf8' }
    ).trim();
  const submit = (number, head, mode) => {
    if (mode !== 'strict') {
      const helper = fileURLToPath(new URL('../ci/enqueue-pr-cli.mjs', import.meta.url));
      execFileSync(process.execPath, [helper, repository, String(number), head], {
        env,
        stdio: 'inherit',
      });
      return;
    }
    const args = [
      'pr',
      'merge',
      String(number),
      '--repo',
      repository,
      '--match-head-commit',
      head,
      '--squash',
    ];
    execFileSync('gh', args, { env, stdio: 'inherit' });
  };
  const dispatchMain = () =>
    execFileSync('gh', ['workflow', 'run', 'ci.yml', '--repo', repository, '--ref', 'main'], {
      env,
      stdio: 'inherit',
    });
  return { policy, submit, dispatchMain };
}
async function submitCandidate(github, repo, pr, sourceSha, operations) {
  const mode = operations.policy();
  requireCondition(
    ['strict', 'strict-queue', 'queue'].includes(mode),
    'Unsupported main merge policy.'
  );
  const { data: live } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
  if (!liveIdentity(live, pr, repo)) return skip('Release PR is no longer open and ready.');
  if (await alreadyQueued(github, repo, live)) return skip('Release PR is already queued.');
  if (!(await approvedAdmission(github, repo, live))) return skip('Review Admission is pending.');
  return submitFromSource(github, repo, live, sourceSha, mode, operations);
}
async function submitFromSource(github, repo, live, sourceSha, mode, operations) {
  if (!(await unchangedSource(github, repo, sourceSha)))
    return skip('Version source is no longer main; scheduled Release will reprepare safely.');
  operations.submit(live.number, live.head.sha, mode);
  const { data: after } = await github.rest.pulls.get({ ...repo, pull_number: live.number });
  return afterSubmission(github, repo, after, live, operations);
}
async function afterSubmission(github, repo, after, before, operations) {
  requireCondition(
    after.head.sha === before.head.sha,
    'Release head changed during queue submission.'
  );
  if (after.merged) {
    operations.dispatchMain();
    return { state: 'MERGED', number: before.number, head: before.head.sha };
  }
  if (after.state !== 'open') return skip('Release PR closed without a merge.');
  if (!(await alreadyQueued(github, repo, after)))
    return skip('Submission accepted; queue entry is not confirmed yet.');
  return { state: 'QUEUED', number: before.number, head: before.head.sha };
}
/** Authenticate wakeups and immutable proofs, submit once, and leave queue wait to GitHub. */
export async function queueReleasePromotion({
  github,
  context,
  operations = queueOperations(context.repo),
}) {
  const run = await sourceWakeup(github, context);
  if (!run) return skip('Source wakeup is unfinished or superseded.');
  const repo = context.repo;
  const pr = await discoveredCandidate(github, repo, run);
  if (!pr) return skip('No head-owned admission/promotion receipt eligible for enqueue.');
  const branch = requireReleaseIdentity(pr, repo);
  return eligibleCandidate(github, repo, pr, branch, operations);
}
async function eligibleCandidate(github, repo, pr, branch, operations) {
  if (!isDeepStrictEqual([pr.state, pr.draft], ['open', false]))
    return skip('Release PR is no longer open and ready.');
  if (await alreadyQueued(github, repo, pr)) return skip('Release PR is already queued.');
  return checkedCandidate(github, repo, pr, branch, operations);
}
async function checkedCandidate(github, repo, pr, branch, operations) {
  if (!(await preparationReady(github, repo, branch)))
    return skip('Preparation is pending; completed Release will recheck.');
  if (!(await approvedAdmission(github, repo, pr))) return skip('Review Admission is pending.');
  const evidence = await candidateEvidence(github, repo, pr, branch);
  return submitCandidate(github, repo, pr, evidence.baseSha, operations);
}
async function unchangedSource(github, repo, sourceSha) {
  const { data: main } = await github.rest.git.getRef({ ...repo, ref: 'heads/main' });
  return main.object.sha === sourceSha;
}
