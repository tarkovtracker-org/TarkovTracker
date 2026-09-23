// Default-branch, read-only planner for an opt-in final build rehearsal. This does not publish a
// merge result: candidate-controlled CI jobs are useful evidence, but not an authenticated gate.
import { classifyPaths } from '../validation-plan.mjs';
import { lstatSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildManifest, digestDirectory } from './manifest.mjs';
import { verifyManifest } from './controller.mjs';
import { MANIFEST_FILE, previewAppUrl, previewBranchName } from './profile.mjs';
import { listPullPaths } from './github-api.mjs';
const SHA = /^[0-9a-f]{40}$/;
const CI_PATH = '.github/workflows/ci.yml';
function positive(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function fail(message) {
  throw new Error(`Finalization shadow refused: ${message}`);
}
function requireAll(checks, message) {
  if (!checks.every(Boolean)) fail(message);
}
function sameRepository(left, right) {
  return left?.toLowerCase() === right?.toLowerCase();
}
function fullName(record) {
  return record?.full_name;
}
function assertPull(pull, repoName, number) {
  requireAll(
    [pull.number === number, pull.state === 'open', pull.draft === false, pull.base.ref === 'main'],
    'the pull request is closed, draft, or no longer targets main'
  );
  if (!sameRepository(pull.base.repo?.full_name, repoName)) fail('the base repository changed');
  requireAll(
    [pull.head.sha, pull.base.sha, pull.merge_commit_sha].map((sha) => SHA.test(sha)),
    'the current head/base/test merge is unavailable'
  );
}
function assertRunOutcome(run, runId) {
  requireAll(
    [
      run.id === runId,
      run.path === CI_PATH,
      run.event === 'pull_request',
      run.status === 'completed',
      run.conclusion === 'success',
      positive(run.run_attempt),
    ],
    'the selected CI run is not a successful pull-request CI run'
  );
}
function assertRunHead(run, pull, repoName) {
  if (!sameRepository(fullName(run.repository), repoName)) fail('the CI repository differs');
  requireAll(
    [
      run.head_sha === pull.head.sha,
      run.head_branch === pull.head.ref,
      sameRepository(fullName(run.head_repository), fullName(pull.head.repo)),
    ],
    'the CI run does not match the current head'
  );
}
function assertRunSnapshot(run, pull, number) {
  // Associated-commit lookups lack the run-time base snapshot. Without that snapshot a base move
  // could reuse CI from the same head against an older merge basis, so an empty list fails closed.
  const snapshots = Array.isArray(run.pull_requests) ? run.pull_requests : [];
  const snapshot = snapshots.find((item) => item.number === number);
  if (!snapshot) fail('the CI run has no pull request base snapshot');
  requireAll(
    [
      snapshot.base.sha === pull.base.sha,
      snapshot.head.sha === pull.head.sha,
      snapshot.base.ref === pull.base.ref,
      snapshot.head.ref === pull.head.ref,
    ],
    'the CI run did not validate the current pull request base and head'
  );
}
function assertRun(run, pull, repoName, number, runId) {
  assertRunOutcome(run, runId);
  assertRunHead(run, pull, repoName);
  assertRunSnapshot(run, pull, number);
}
function assertMerge(commit, pull) {
  const parents = Array.isArray(commit.parents) ? commit.parents : [];
  if (parents.length !== 2) fail('the test merge does not have two parents');
  requireAll(
    [
      commit.sha === pull.merge_commit_sha,
      SHA.test(commit.commit?.tree?.sha),
      parents[0].sha === pull.base.sha,
      parents[1].sha === pull.head.sha,
    ],
    'the test merge no longer represents the current base and head'
  );
}
function assertCiJob(jobs, run) {
  const results = jobs.filter((job) => job.name === 'CI Result');
  if (results.length !== 1) fail('the selected run attempt lacks exactly one CI Result job');
  const job = results[0];
  requireAll(
    [
      job.run_id === run.id,
      job.run_attempt === run.run_attempt,
      job.head_sha === run.head_sha,
      job.status === 'completed',
      job.conclusion === 'success',
    ],
    'the selected run attempt lacks its successful CI Result job'
  );
}
export function validateShadowEvidence({
  pull,
  run,
  commit,
  jobs,
  paths,
  latestRuns,
  repoName,
  number,
  runId,
}) {
  assertPull(pull, repoName, number);
  assertRun(run, pull, repoName, number, runId);
  assertMerge(commit, pull);
  assertCiJob(jobs, run);
  if (!Array.isArray(paths)) fail('the changed-file list is unreadable');
  // A missing PR association on a newer run is ambiguous: reject instead of reusing old success.
  const newer = latestRuns
    .filter((item) => item.event === 'pull_request' && item.head_sha === pull.head.sha)
    .some(
      (item) =>
        item.id > run.id &&
        (!item.pull_requests?.length || item.pull_requests.some((pr) => pr.number === number))
    );
  if (newer) fail('a newer CI run superseded the selected run');
  const classification = classifyPaths(paths);
  const previewBranch = previewBranchName({ pullRequest: number });
  return {
    pullRequest: number,
    ciRunId: run.id,
    ciRunAttempt: run.run_attempt,
    headSha: pull.head.sha,
    baseSha: pull.base.sha,
    mergeSha: pull.merge_commit_sha,
    treeSha: commit.commit.tree.sha,
    previewRequired: classification.previewRequired,
    previewBranch,
    appUrl: previewAppUrl(previewBranch),
    fork: !sameRepository(pull.head.repo?.full_name, repoName),
  };
}
async function snapshot(github, repo, number, runId) {
  const [pullResponse, runResponse] = await Promise.all([
    github.rest.pulls.get({ ...repo, pull_number: number }),
    github.rest.actions.getWorkflowRun({ ...repo, run_id: runId }),
  ]);
  const pull = pullResponse.data;
  const run = runResponse.data;
  // Read the exact attempt's jobs. A same-named check on the commit is not sufficient evidence.
  const [commitResponse, jobs, paths, latestResponse] = await Promise.all([
    github.rest.repos.getCommit({ ...repo, ref: pull.merge_commit_sha }),
    github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
      ...repo,
      run_id: runId,
      attempt_number: run.run_attempt,
      per_page: 100,
    }),
    listPullPaths(github, repo, number),
    github.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: 'ci.yml',
      event: 'pull_request',
      head_sha: pull.head.sha,
      per_page: 100,
    }),
  ]);
  return {
    pull,
    run,
    commit: commitResponse.data,
    jobs,
    paths,
    latestRuns: latestResponse.data.workflow_runs,
    repoName: `${repo.owner}/${repo.repo}`,
    number,
    runId,
  };
}
export async function planShadow({ github, context, inputs }) {
  if (context.ref !== 'refs/heads/main') fail('dispatch must use the default branch');
  await authorizeShadowRequester(github, context);
  const number = positive(inputs.pull_request);
  const runId = positive(inputs.ci_run_id);
  if (!number || !runId) fail('positive pull request and CI run ids are required');
  return validateShadowEvidence(await snapshot(github, context.repo, number, runId));
}
export async function recheckShadow({ github, context, expected }) {
  if (context.ref !== 'refs/heads/main') fail('dispatch must use the default branch');
  await authorizeShadowRequester(github, context);
  const current = validateShadowEvidence(
    await snapshot(github, context.repo, expected.pullRequest, expected.ciRunId)
  );
  for (const key of Object.keys(current)) {
    if (current[key] !== expected[key]) fail(`${key} changed while finalization ran`);
  }
  return current;
}
export async function authorizeShadowRequester(github, context) {
  // A candidate workflow can grant itself actions:write and dispatch workflows with GITHUB_TOKEN.
  // Reruns retain the original actor's privileges, so check the triggering actor as well.
  requireAll(
    [context.actor, context.triggeringActor].map(
      (actor) => typeof actor === 'string' && actor.length > 0 && !actor.endsWith('[bot]')
    ),
    'a maintainer must request finalization'
  );
  for (const username of new Set([context.actor, context.triggeringActor])) {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo,
      username,
    });
    // GitHub maps the maintain role to legacy `permission: write`; use the full role_name.
    if (!['admin', 'maintain'].includes(data.role_name))
      fail('the requester must have maintain or admin permission');
  }
}
function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}
// The artifact uploader runs on the host before the separate verifier sees its archive. Reject
// links and special files first so candidate output cannot make that uploader read host files.
function requireShadowRoot(root) {
  if (!lstatSync(root).isDirectory()) fail('Pages output root is not a directory');
}
function scanShadowEntry(path, pending) {
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    pending.push(path);
    return 0;
  }
  if (stat.isFile()) return stat.size;
  return fail(`unsupported Pages output entry: ${path}`);
}
function requireArtifactLimits(entries, bytes) {
  if (entries > 50_000 || bytes > 1024 * 1024 * 1024) fail('Pages output exceeds artifact limits');
}
export function validateShadowOutput(root) {
  requireShadowRoot(root);
  const pending = [root];
  let entries = 0;
  let bytes = 0;
  while (pending.length) {
    const directory = pending.pop();
    for (const name of readdirSync(directory)) {
      entries += 1;
      bytes += scanShadowEntry(join(directory, name), pending);
      requireArtifactLimits(entries, bytes);
    }
  }
  return { entries, bytes };
}
export function sealShadowArtifact(directory, expected) {
  for (const path of ['index.html', '_worker.js/index.js']) {
    if (!isRegularFile(join(directory, path))) fail(`missing Pages output: ${path}`);
  }
  const digest = digestDirectory(directory);
  const manifest = buildManifest({ ...expected, digest });
  const errors = verifyManifest(manifest, expected, digest);
  if (errors.length) fail(`artifact claims are invalid: ${errors.join('; ')}`);
  writeFileSync(join(directory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
