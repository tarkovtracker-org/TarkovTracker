import { classifyPaths } from '../validation-plan.mjs';
import {
  ciResultCheck,
  findLatestPullRun,
  getPull,
  listPullPaths,
  previewDispatchInputs,
} from './github-api.mjs';
import {
  isPreviewMaintainer,
  previewCommand,
  previewStopReceipt,
  readPreviewRequest,
} from './request-authorization.mjs';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const userLogin = (user) => user?.login;
const repositoryName = (repo) => repo?.full_name;
export class PreviewRequestDenied extends Error {}
function isPreviewComment(context) {
  const { payload } = context;
  return [
    context.eventName === 'issue_comment',
    payload.action === 'created',
    previewCommand(payload.comment?.body) !== null,
    Boolean(payload.issue?.pull_request),
  ].every(Boolean);
}
async function requireMaintainer(github, context) {
  const { actor, payload, repo } = context;
  const sameActor = [
    Boolean(actor),
    actor !== 'ghost',
    userLogin(payload.sender) === actor,
    userLogin(payload.comment.user) === actor,
  ].every(Boolean);
  if (!sameActor)
    throw new PreviewRequestDenied('Preview request actor could not be authenticated.');
  if (!(await isPreviewMaintainer(github, repo, actor))) {
    throw new PreviewRequestDenied(
      'Only repository maintainers and administrators may request a preview.'
    );
  }
}
function requireOpenPull(pull) {
  if (![pull.state === 'open', pull.base.ref === 'main'].every(Boolean)) {
    throw new Error('Preview requires an open pull request targeting main.');
  }
}
function pullReady(pull) {
  return (
    !pull.draft && [pull.head.sha, pull.merge_commit_sha].every((sha) => SHA_PATTERN.test(sha))
  );
}
function matchesPullSnapshot(run, pull, repoName) {
  const snapshots = run?.pull_requests ?? [];
  // Fork CI omits snapshots. The trusted controller verifies the artifact's current base and
  // test merge before upload; bind run selection to the fork's repository, branch and head here.
  if ([repositoryName(pull.head.repo) !== repoName, snapshots.length === 0].every(Boolean))
    return true;
  return (
    snapshots.filter((item) =>
      [
        item.number === pull.number,
        item.head?.sha === pull.head.sha,
        item.base?.sha === pull.base.sha,
      ].every(Boolean)
    ).length === 1
  );
}
function matchesCiRun(run, pull, repoName) {
  if (!run) return false;
  return [
    run.path === '.github/workflows/ci.yml',
    run.event === 'pull_request',
    run.head_sha === pull.head.sha,
    repositoryName(run.head_repository) === repositoryName(pull.head.repo),
    run.head_branch === pull.head.ref,
    run.status === 'completed',
    run.conclusion === 'success',
    matchesPullSnapshot(run, pull, repoName),
  ].every(Boolean);
}
function matchesCiCheck(check, run, repoName) {
  if (!check) return false;
  const detailsPrefix = `https://github.com/${repoName}/actions/runs/${run.id}/job/`;
  const detailsUrl = String(check.details_url);
  return [
    check.status === 'completed',
    check.conclusion === 'success',
    detailsUrl.startsWith(detailsPrefix),
    /^[1-9][0-9]*$/.test(detailsUrl.slice(detailsPrefix.length)),
  ].every(Boolean);
}
function hasMatchingCi(run, check, pull, repo) {
  const repoName = `${repo.owner}/${repo.repo}`;
  return matchesCiRun(run, pull, repoName) && matchesCiCheck(check, run, repoName);
}
async function hasDeployablePaths(github, repo, pull) {
  const paths = await listPullPaths(github, repo, pull.number);
  return classifyPaths(paths).previewRequired;
}
function matchesPullBranch(run, pull, repo) {
  return [
    repositoryName(run.head_repository) === repositoryName(pull.head.repo),
    run.head_branch === pull.head.ref,
    matchesPullSnapshot(run, pull, `${repo.owner}/${repo.repo}`),
  ].every(Boolean);
}
async function dispatchCurrentPreview(github, repo, pull, result, request) {
  const run = await findLatestPullRun(github, repo, pull.head.sha, (item) =>
    matchesPullBranch(item, pull, repo)
  );
  const check = await ciResultCheck(github, repo, pull.head.sha);
  if (!hasMatchingCi(run, check, pull, repo)) return result;
  // The trusted default-branch controller repeats every revision, CI, and artifact check.
  await github.rest.actions.createWorkflowDispatch({
    ...repo,
    workflow_id: 'preview.yml',
    ref: 'main',
    inputs: previewDispatchInputs(run.id, request),
  });
  return { ...result, ciRunId: run.id };
}
async function currentCommand(github, context) {
  const request = await readPreviewRequest(github, context.repo, context.payload.issue.number);
  if (request?.commentId !== context.payload.comment.id)
    throw new Error(
      'This command is inactive: check rollout configuration, edits, or a newer preview command.'
    );
  return request;
}
function previewIntent(pull, body) {
  return {
    pullRequest: pull.number,
    headSha: pull.head.sha,
    enabled: previewCommand(body),
    automatic: pull.user?.id !== 49699333,
    ciRunId: null,
  };
}
/** Enable previews for this PR, dispatch now if CI is ready, or let CI completion request it. */
export async function requestPreviewFromComment({ github, context }) {
  const { payload, repo } = context;
  if (!isPreviewComment(context)) return null;
  await requireMaintainer(github, context);
  const request = await currentCommand(github, context);
  const pull = await getPull(github, repo, payload.issue.number);
  const result = previewIntent(pull, payload.comment.body);
  if (!result.enabled) return { ...result, stopCommentId: request.commentId };
  requireOpenPull(pull);
  result.previewRequired = await hasDeployablePaths(github, repo, pull);
  if (![result.previewRequired, pullReady(pull)].every(Boolean)) return result;
  return dispatchCurrentPreview(github, repo, pull, result, request);
}
function currentPreviewMessage(request) {
  if (request.previewRequired === false) return 'This revision does not require a preview.';
  if (request.ciRunId) return 'The current preview was requested.';
  return 'The next successful CI run will request a preview. Drafts remain paused.';
}
export function previewRequestMessage(request, runs) {
  if (!request.enabled) {
    // The bot receipt proves this stop was accepted after verifying the author's maintain/admin
    // access, so it stays a revocation barrier even if the author later loses the role.
    const receipt = request.stopCommentId ? `\n${previewStopReceipt(request.stopCommentId)}` : '';
    return `Preview opt-in disabled for this PR. Comment \`/preview\` to enable it again. Dependabot keeps its separate automation.${receipt}`;
  }
  if (!request.automatic) {
    const current = request.ciRunId
      ? 'The current preview was requested.'
      : 'No current preview was requested.';
    return `Dependabot keeps its existing preview automation. ${current} [View Preview runs](${runs}).`;
  }
  return `Automatic previews enabled for this PR, including future commits. ${currentPreviewMessage(request)} [View Preview runs](${runs}); **Preview Result** updates after deployment and smoke tests. Comment \`/preview stop\` to disable automatic previews.`;
}
