// Queue candidates are temporary integration commits, never PR heads. Reuse the trusted
// preview uploader only while the exact queue ref and CI attempt remain live.
import { PRODUCTION_BRANCH } from './profile.mjs';
const SHA = /^[0-9a-f]{40}$/;
const PREFIX = `gh-readonly-queue/${PRODUCTION_BRANCH}/`;
function isQueueBranch(branch) {
  return typeof branch === 'string' && branch.startsWith(PREFIX);
}
function requireQueueIdentity(context, candidate) {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (candidate.headRepo !== repository || !isQueueBranch(candidate.headBranch))
    throw new Error('Queue candidate must belong to this repository and target main.');
}
function queueParent(commit) {
  return commit.parents?.[0]?.sha;
}
function queueTree(commit) {
  return commit.tree?.sha;
}
function checkedRevision(commit, main) {
  const baseSha = queueParent(commit);
  if (!SHA.test(String(baseSha)) || baseSha !== main.object.sha)
    throw new Error('Queue base is no longer current main.');
  if (!SHA.test(String(queueTree(commit)))) throw new Error('Queue tree is missing.');
  return { baseSha, treeSha: commit.tree.sha };
}
export async function queueRevision(github, context, candidate) {
  requireQueueIdentity(context, candidate);
  const { data: ref } = await github.rest.git.getRef({
    ...context.repo,
    ref: `heads/${candidate.headBranch}`,
  });
  if (ref.object.sha !== candidate.headSha) throw new Error('Queue revision moved.');
  const { data: commit } = await github.rest.git.getCommit({
    ...context.repo,
    commit_sha: candidate.headSha,
  });
  const { data: main } = await github.rest.git.getRef({
    ...context.repo,
    ref: `heads/${PRODUCTION_BRANCH}`,
  });
  return checkedRevision(commit, main);
}
export async function requireQueueCi(github, context, run) {
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
    ...context.repo,
    run_id: run.id,
    attempt_number: run.run_attempt,
    per_page: 100,
  });
  const results = jobs.filter((job) => job.name === 'CI Result');
  if (results.length !== 1) throw new Error('Queue CI Result is missing or ambiguous.');
  const result = results[0];
  if (
    ![
      result.head_sha === run.head_sha,
      result.run_id === run.id,
      result.run_attempt === run.run_attempt,
      result.status === 'completed',
      result.conclusion === 'success',
    ].every(Boolean)
  )
    throw new Error('Queue CI Result did not succeed for this attempt.');
}
