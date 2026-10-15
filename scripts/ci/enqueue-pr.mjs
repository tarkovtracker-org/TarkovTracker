import { requireEvidence, SHA } from './review-admission-policy.mjs';
const CURRENT = `query($owner:String!,$repo:String!,$number:Int!) {
  repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
    headRefOid mergeQueueEntry { id pullRequest { number headRefOid } }
  } }
}`;
const ENQUEUE = `mutation($input:EnqueuePullRequestInput!) {
  enqueuePullRequest(input:$input) { mergeQueueEntry {
    id pullRequest { number headRefOid }
  } }
}`;
function requireInput(repo, number, head) {
  requireEvidence(
    [
      typeof repo.owner === 'string',
      typeof repo.repo === 'string',
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(`${repo.owner}/${repo.repo}`),
    ].every(Boolean),
    'Expected OWNER/REPO.'
  );
  requireEvidence(Number.isSafeInteger(number) && number > 0, 'Expected a positive PR number.');
  requireEvidence(SHA.test(head), 'Expected exact 40-character head SHA.');
}
function requireCandidate(pr, repo, number, head) {
  const name = `${repo.owner}/${repo.repo}`;
  requireRepository(pr.head, name);
  requireRepository(pr.base, name);
  requireEvidence(
    [
      pr.number === number,
      pr.head.sha === head,
      pr.base.ref === 'main',
      pr.state === 'open',
      pr.draft === false,
      typeof pr.node_id === 'string' && pr.node_id.length > 0,
    ].every(Boolean),
    'Queue candidate identity or readiness changed.'
  );
}
function requireRepository(branch, name) {
  requireEvidence(branch?.repo?.full_name === name, 'Queue candidate repository mismatch.');
}
function queueReceipt(entry, number, head) {
  requireEvidence(Boolean(entry), 'Queue response is missing an entry.');
  requireEvidence(
    typeof entry.id === 'string' && entry.id.length > 0,
    'Queue entry ID is missing.'
  );
  requireEvidence(Boolean(entry.pullRequest), 'Queue member identity is missing.');
  requireEvidence(
    [entry.pullRequest.number === number, entry.pullRequest.headRefOid === head].every(Boolean),
    'Queue response does not identify the expected PR head.'
  );
  return { state: 'QUEUED', number, head, entryId: entry.id };
}
function currentQueueEntry(data, head) {
  const pr = data.repository?.pullRequest;
  requireEvidence(pr?.headRefOid === head, 'PR head changed before queue submission.');
  requireEvidence(Object.hasOwn(pr, 'mergeQueueEntry'), 'Queue entry metadata is missing.');
  const entry = pr.mergeQueueEntry;
  requireEvidence(entry === null || typeof entry === 'object', 'Invalid queue entry metadata.');
  return entry;
}
/** Submit only the captured same-repository main PR head; native rules own integration/merge. */
export async function enqueuePullRequest({ github, repo, number, head }) {
  requireInput(repo, number, head);
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  requireCandidate(pr, repo, number, head);
  const current = await github.graphql(CURRENT, { ...repo, number });
  const entry = currentQueueEntry(current, head);
  if (entry) return queueReceipt(entry, number, head);
  const result = await github.graphql(ENQUEUE, {
    input: { pullRequestId: pr.node_id, expectedHeadOid: head },
  });
  return queueReceipt(result.enqueuePullRequest?.mergeQueueEntry, number, head);
}
