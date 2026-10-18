import { expectedPublisherBot, requireReceiptIssuer } from './review-admission-issuer.mjs';
import { requireQueueConfiguration } from './queue-configuration.mjs';
import { AdmissionPending, CONTEXT, SHA, requireEvidence } from './review-admission-policy.mjs';
export async function allPages(github, endpoint, params) {
  const result = await github.paginate(endpoint, { ...params, per_page: 100 });
  requireEvidence(Array.isArray(result), 'GitHub pagination did not return a complete list.');
  return result;
}
const THREAD_QUERY = `query($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
 repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
  reviewThreads(first:100,after:$cursor) { nodes { id isResolved isOutdated } pageInfo { hasNextPage endCursor } }
 } }
}`;
function threadPage(result) {
  const page = result.repository?.pullRequest?.reviewThreads;
  requireEvidence(Array.isArray(page?.nodes), 'Missing review threads.');
  requireEvidence(typeof page.pageInfo?.hasNextPage === 'boolean', 'Incomplete thread pagination.');
  return page;
}
export async function reviewThreads(github, repo, number) {
  const threads = [];
  let cursor = null;
  for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
    const page = threadPage(await github.graphql(THREAD_QUERY, { ...repo, number, cursor }));
    threads.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return threads;
    cursor = nextCursor(page, cursor);
  }
  throw new Error('Review thread pagination limit exceeded.');
}
function nextCursor(page, previous) {
  const cursor = page.pageInfo.endCursor;
  requireEvidence(Boolean(cursor) && cursor !== previous, 'Thread pagination did not advance.');
  return cursor;
}
async function collaborator(github, repo, username) {
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username });
    return ['write', 'maintain', 'admin'].includes(data.permission);
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}
export async function trustedActors(github, repo, reviews, comments) {
  const actors = [...reviews, ...comments].filter((item) => item.user?.type === 'User');
  const names = [...new Set(actors.map((item) => item.user.login))];
  const trusted = new Set();
  for (const name of names) {
    if (await collaborator(github, repo, name)) trusted.add(name);
  }
  return trusted;
}
export function requirePrIdentity(pr, repo) {
  const repository = `${repo.owner}/${repo.repo}`;
  requireEvidence(pr.base?.repo?.full_name === repository, 'PR repository mismatch.');
  requireEvidence(pr.base.ref === 'main', 'Admission only targets main.');
  requireEvidence(SHA.test(pr.head?.sha), 'Missing immutable PR head.');
}
const QUEUE_QUERY = `query($owner:String!,$repo:String!,$number:Int!) {
 repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
  headRefOid mergeQueueEntry { position state baseCommit { oid } headCommit { oid }
   pullRequest { number headRefOid } }
 } }
}`;
export async function queuedRefs(github, repo, number) {
  const refs = await allPages(github, github.rest.git.listMatchingRefs, {
    ...repo,
    ref: `heads/gh-readonly-queue/main/pr-${number}-`,
  });
  const pattern = new RegExp(`^refs/heads/gh-readonly-queue/main/pr-${number}-[a-f0-9]+$`);
  requireEvidence(
    refs.every((ref) => pattern.test(ref.ref) && SHA.test(ref.object.sha)),
    'Queue ref identities are malformed.'
  );
  return refs;
}
function queueErrorField(error) {
  const path = error.errors?.[0]?.path;
  return Array.isArray(path) ? path.join('.') : 'unknown';
}
async function queueEntry(github, repo, number) {
  try {
    return await github.graphql(QUEUE_QUERY, { ...repo, number });
  } catch (error) {
    requireEvidence(false, `Queue metadata read failed at ${queueErrorField(error)}.`);
  }
}
export async function activeQueueGroup(github, repo, pr, refs) {
  const data = await queueEntry(github, repo, pr.number);
  const queried = data.repository.pullRequest;
  requireEvidence(queried.headRefOid === pr.head.sha, 'Queue discovery PR revision changed.');
  requireEvidence(Object.hasOwn(queried, 'mergeQueueEntry'), 'Queue entry metadata missing.');
  const entry = queried.mergeQueueEntry;
  if (entry === null) return null;
  requireEvidence(
    entry.pullRequest.number === pr.number,
    'Queue discovery member number mismatch.'
  );
  if (awaitingBuild(entry)) return null;
  return referencedGroup(refs, entry);
}
// With one build slot, later entries stay QUEUED with no integration commit until they reach the
// front. Only the PR head is in scope then; the group's own merge_group signal re-runs admission
// once GitHub builds it. Any other entry without an integration commit still fails closed.
function awaitingBuild(entry) {
  requireEvidence(Object.hasOwn(entry, 'headCommit'), 'Queue entry integration metadata missing.');
  if (entry.headCommit !== null) return false;
  requireEvidence(entry.state === 'QUEUED', 'Queue entry has no integration commit.');
  return true;
}
function referencedGroup(refs, entry) {
  const matches = refs.filter((ref) => ref.object.sha === entry.headCommit.oid);
  requireEvidence(matches.length === 1, 'Current integration ref is missing or ambiguous.');
  return {
    head_ref: matches[0].ref,
    head_sha: matches[0].object.sha,
    base_ref: 'refs/heads/main',
    base_sha: entry.baseCommit.oid,
  };
}
function requireQueueEntry(data, pr, sha, base) {
  const queried = data.repository?.pullRequest;
  requireEvidence(Boolean(queried), 'Queue pull request is missing.');
  const entry = queried.mergeQueueEntry;
  requireEvidence(Boolean(entry), 'PR is no longer in the queue.');
  requireEvidence(queried.headRefOid === pr.head.sha, 'Queue PR head changed.');
  requireEvidence(
    entry.headCommit?.oid === sha,
    'Queue entry does not identify this integration commit.'
  );
  requireEvidence(entry.baseCommit.oid === base, 'Queue entry base changed.');
  requireEvidence(entry.position === 1, 'Only the first single-entry queue group is supported.');
  requireQueueMember(entry, pr);
}
function requireQueueMember(entry, pr) {
  requireEvidence(entry.pullRequest.number === pr.number, 'Queue PR number mismatch.');
  requireEvidence(entry.pullRequest.headRefOid === pr.head.sha, 'Queue member revision mismatch.');
}
export async function queueIdentity(github, repo, group, pr) {
  requireEvidence(group.base_ref === 'refs/heads/main', 'Queue target must be main.');
  requireEvidence(SHA.test(group.head_sha) && SHA.test(group.base_sha), 'Invalid queue revisions.');
  const ref = group.head_ref.replace(/^refs\/heads\//, '');
  requireEvidence(
    new RegExp(`^gh-readonly-queue/main/pr-${pr.number}-[a-f0-9]+$`).test(ref),
    'Queue ref/PR identity mismatch.'
  );
  const { data: live } = await github.rest.git.getRef({ ...repo, ref: `heads/${ref}` });
  requireEvidence(live.object.sha === group.head_sha, 'Queue ref changed or was removed.');
  await queueCommit(github, repo, group);
  const data = await queueEntry(github, repo, pr.number);
  requireQueueEntry(data, pr, group.head_sha, group.base_sha);
  await requireQueueConfiguration(github, repo);
}
// A squash queue commit has main as its only parent and does not contain the PR head as an
// ancestor. GitHub's queue entry binds it to the exact PR head; prove one commit on current main.
async function queueCommit(github, repo, group) {
  const { data: main } = await github.rest.git.getRef({ ...repo, ref: 'heads/main' });
  const { data: commit } = await github.rest.git.getCommit({ ...repo, commit_sha: group.head_sha });
  requireEvidence(main.object.sha === group.base_sha, 'Queue base is not current main.');
  requireEvidence(
    [commit.parents?.length === 1, commit.parents?.[0]?.sha === group.base_sha].every(Boolean),
    'Queue commit is not a single squash commit on main.'
  );
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: group.base_sha,
    head: group.head_sha,
  });
  requireEvidence(
    [comparison.status === 'ahead', comparison.ahead_by === 1, comparison.behind_by === 0].every(
      Boolean
    ),
    'Queue commit is not exactly one commit ahead of main.'
  );
}
export async function admissionRun(github, repo, head, expectedRunId) {
  const expectedBot = expectedPublisherBot();
  await requireExpectedPublisher(github, repo, expectedRunId);
  requireEvidence(SHA.test(head), 'Admission status requires exact SHA.');
  const statuses = await allPages(github, github.rest.repos.listCommitStatusesForRef, {
    ...repo,
    ref: head,
  });
  const status = statuses.find((item) => item.context === CONTEXT);
  if (!status) throw new AdmissionPending('Review Admission has not published a status yet.');
  requireEvidence(
    ['pending', 'success'].includes(status.state),
    'Review Admission did not succeed.'
  );
  requireEvidence(
    status.creator.id === expectedBot && status.creator.type === 'Bot',
    'Admission status was not created by the configured publisher.'
  );
  const prefix = `https://github.com/${repo.owner}/${repo.repo}/actions/runs/`;
  requireEvidence(status.target_url.startsWith(prefix), 'Untrusted admission status URL.');
  const runId = Number(status.target_url.slice(prefix.length));
  requireEvidence(Number.isSafeInteger(runId) && runId > 0, 'Invalid admission run ID.');
  requireExpectedRun(runId, expectedRunId);
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  requireEvidence(
    run.path === '.github/workflows/review-admission.yml',
    'Admission workflow identity mismatch.'
  );
  requireEvidence(
    ['pull_request_target', 'workflow_run', 'issue_comment', 'workflow_dispatch'].includes(
      run.event
    ),
    'Admission publisher did not use a trusted event.'
  );
  requireTrustedRun(run, repo);
  requirePublishedAdmission(status, run);
  return run;
}
async function requireExpectedPublisher(github, repo, id) {
  if (id === undefined) return;
  await expectedPublisher(github, repo, id);
}
function requireExpectedRun(runId, expectedRunId) {
  if (expectedRunId === undefined) return;
  requireEvidence(
    runId === Number(expectedRunId),
    'Admission status is not bound to the requested dispatch.'
  );
}
async function expectedPublisher(github, repo, id) {
  const runId = Number(id);
  requireEvidence(Number.isSafeInteger(runId) && runId > 0, 'Invalid expected admission run ID.');
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  requireEvidence(
    run.path === '.github/workflows/review-admission.yml',
    'Expected admission workflow mismatch.'
  );
  requireEvidence(run.event === 'workflow_dispatch', 'Expected admission was not a main dispatch.');
  requireTrustedRun(run, repo);
  requirePublishedAdmission({ state: 'success' }, run);
}
function requirePublishedAdmission(status, run) {
  if (['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(run.status))
    throw new AdmissionPending('Trusted admission publisher has not completed yet.');
  requireEvidence(
    run.status === 'completed' && run.conclusion === 'success',
    'Admission run did not succeed.'
  );
  if (status.state === 'pending')
    throw new AdmissionPending('Review Admission decision is still pending.');
}
function requireTrustedRun(run, repo) {
  requireEvidence(
    run.repository.full_name === `${repo.owner}/${repo.repo}`,
    'Admission run repository mismatch.'
  );
  if (run.event !== 'workflow_dispatch') return;
  requireEvidence(run.head_branch === 'main', 'Admission dispatch did not use trusted main.');
}
export function validateAdmissionReceipt(receipt, repo, head, run, number) {
  requireEvidence(Number.isSafeInteger(number) && number > 0, 'Expected a positive PR number.');
  requireEvidence(receipt.number === number, 'Admission receipt PR number mismatch.');
  requireReceiptIssuer(receipt);
  requireEvidence(receipt.schema === 1, 'Missing admission receipt.');
  requireEvidence(
    receipt.repository === `${repo.owner}/${repo.repo}`,
    'Receipt repository mismatch.'
  );
  requireEvidence(
    receipt.statusSha === head && receipt.headSha === head,
    'Receipt revision mismatch.'
  );
  requireEvidence(receipt.approved === true, 'Receipt did not approve admission.');
  requireEvidence(
    receipt.runId === run.id && receipt.runAttempt === run.run_attempt,
    'Receipt run attempt mismatch.'
  );
  requireEvidence(SHA.test(receipt.workflowSourceSha), 'Receipt source revision missing.');
  requireEvidence(receipt.review.commit === head, 'Receipt review revision mismatch.');
}
