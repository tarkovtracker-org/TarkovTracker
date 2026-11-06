// Queue candidates are temporary integration commits, never PR heads. Reuse the trusted
// preview uploader only while the exact queue ref and CI attempt remain live.
import { verifiedFormatterChange } from '../ci/formatter-validation.mjs';
import { classifyQueuePaths } from '../ci/validation-plan.mjs';
import { PRODUCTION_BRANCH } from './profile.mjs';
const SHA = /^[0-9a-f]{40}$/;
export class QueueValidationError extends Error {}
const PREFIX = `gh-readonly-queue/${PRODUCTION_BRANCH}/`;
function isQueueBranch(branch) {
  return typeof branch === 'string' && branch.startsWith(PREFIX);
}
function requireQueueIdentity(context, candidate) {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (candidate.headRepo !== repository || !isQueueBranch(candidate.headBranch))
    throw new QueueValidationError(
      'Queue candidate must belong to this repository and target main.'
    );
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
    throw new QueueValidationError('Queue base is no longer current main.');
  if (!SHA.test(String(queueTree(commit))))
    throw new QueueValidationError('Queue tree is missing.');
  return { baseSha, treeSha: commit.tree.sha };
}
async function queueRef(github, repo, ref) {
  try {
    return await github.rest.git.getRef({ ...repo, ref });
  } catch (error) {
    if ([404, 422].includes(error.status))
      throw new QueueValidationError(
        'Queue ref is no longer available; wait for a fresh queue run.'
      );
    throw error;
  }
}
export async function queueRevision(github, context, candidate) {
  requireQueueIdentity(context, candidate);
  const { data: ref } = await queueRef(github, context.repo, `heads/${candidate.headBranch}`);
  if (ref.object.sha !== candidate.headSha) throw new QueueValidationError('Queue revision moved.');
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
  if (results.length !== 1)
    throw new QueueValidationError('Queue CI Result is missing or ambiguous.');
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
    throw new QueueValidationError('Queue CI Result did not succeed for this attempt.');
}
function comparisonRange(data, baseSha) {
  return [
    data.status === 'ahead',
    data.ahead_by === 1,
    data.behind_by === 0,
    data.total_commits === 1,
    data.base_commit?.sha === baseSha,
    data.merge_base_commit?.sha === baseSha,
  ].every(Boolean);
}
function comparisonParent(parents, baseSha) {
  if (!Array.isArray(parents) || parents.length !== 1) return false;
  return parents[0]?.sha === baseSha;
}
function comparisonHead(commits, headSha, baseSha) {
  if (!Array.isArray(commits) || commits.length !== 1) return false;
  const commit = commits[0] ?? {};
  return [commit.sha === headSha, comparisonParent(commit.parents, baseSha)].every(Boolean);
}
function exactQueueComparison(data, candidate, revision) {
  return [
    comparisonRange(data, revision.baseSha),
    comparisonHead(data.commits, candidate.headSha, revision.baseSha),
  ].every(Boolean);
}
function comparisonName(path) {
  return typeof path === 'string' && path.length > 0;
}
function comparisonFilePaths(file) {
  const { status, filename, previous_filename } = file ?? {};
  const paths = ['renamed', 'copied'].includes(status) ? [filename, previous_filename] : [filename];
  return [
    ['added', 'modified', 'removed', 'renamed', 'copied'].includes(status),
    paths.every(comparisonName),
  ].every(Boolean)
    ? paths
    : null;
}
function comparisonPaths(files) {
  // Compare returns at most 300 files on page one; at the cap completeness is unknown.
  if (!Array.isArray(files) || files.length >= 300) return [];
  const paths = files.map(comparisonFilePaths);
  return paths.includes(null) ? [] : paths.flat();
}
async function comparisonRequiresPreview(github, context, data, candidate, revision) {
  const paths = exactQueueComparison(data ?? {}, candidate, revision)
    ? comparisonPaths(data.files)
    : [];
  const formatterOnly = await verifiedFormatterChange(
    github,
    context.repo,
    revision.baseSha,
    candidate.headSha,
    paths
  );
  return classifyQueuePaths(paths, { formatterOnly }).previewRequired;
}
export async function queueRequiresPreview(github, context, candidate, revision) {
  try {
    const { data } = await github.rest.repos.compareCommits({
      ...context.repo,
      base: revision.baseSha,
      head: candidate.headSha,
      per_page: 100,
      page: 1,
    });
    return await comparisonRequiresPreview(github, context, data, candidate, revision);
  } catch (error) {
    if ([404, 422].includes(error.status))
      throw new QueueValidationError(
        'Queue comparison is no longer available; wait for a fresh queue run.'
      );
    throw error;
  }
}
