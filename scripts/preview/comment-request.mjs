import { classifyPaths } from '../validation-plan.mjs';
import { ciResultCheck, findLatestPullRun, getPull, listPullPaths } from './github-api.mjs';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const userLogin = (user) => user?.login;
const repositoryName = (repo) => repo?.full_name;
function isPreviewComment(context) {
  const { payload } = context;
  return [
    context.eventName === 'issue_comment',
    payload.action === 'created',
    payload.comment?.body === '/preview',
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
  if (!sameActor) throw new Error('Preview request actor could not be authenticated.');
  const { data: permission } = await github.rest.repos.getCollaboratorPermissionLevel({
    ...repo,
    username: actor,
  });
  if (!['maintain', 'admin'].includes(permission.role_name)) {
    throw new Error('Only repository maintainers and administrators may request a preview.');
  }
}
function requireReadyPull(pull) {
  if (![pull.state === 'open', !pull.draft, pull.base.ref === 'main'].every(Boolean)) {
    throw new Error('Preview requires an open, ready pull request targeting main.');
  }
}
function requireSameRepository(pull, repo) {
  if (repositoryName(pull.head.repo) !== `${repo.owner}/${repo.repo}`) {
    throw new Error('Fork previews retain the existing explicit request and approval path.');
  }
}
function requirePullRevision(pull) {
  if (![pull.head.sha, pull.merge_commit_sha].every((sha) => SHA_PATTERN.test(sha))) {
    throw new Error('GitHub has not prepared the current pull request revision yet.');
  }
}
function requireCurrentPull(pull, repo) {
  requireReadyPull(pull);
  requireSameRepository(pull, repo);
  requirePullRevision(pull);
}
function matchesPullSnapshot(run, pull) {
  const snapshots = run?.pull_requests ?? [];
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
    repositoryName(run.head_repository) === repoName,
    run.status === 'completed',
    run.conclusion === 'success',
    matchesPullSnapshot(run, pull),
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
function requireMatchingCi(run, check, pull, repo) {
  const repoName = `${repo.owner}/${repo.repo}`;
  if (!matchesCiRun(run, pull, repoName)) {
    throw new Error('The current head and base need a successful, matching CI Result first.');
  }
  if (!matchesCiCheck(check, run, repoName)) {
    throw new Error('The current head and base need a successful, matching CI Result first.');
  }
}
async function requireDeployablePaths(github, repo, pull) {
  const paths = await listPullPaths(github, repo, pull.number);
  if (!classifyPaths(paths).previewRequired) {
    throw new Error('This documentation-only pull request does not require a preview.');
  }
}
/** Resolve a maintainer's exact PR command to the current successful CI run, then dispatch. */
export async function requestPreviewFromComment({ github, context }) {
  const { payload, repo } = context;
  if (!isPreviewComment(context)) return null;
  await requireMaintainer(github, context);
  const pull = await getPull(github, repo, payload.issue.number);
  requireCurrentPull(pull, repo);
  await requireDeployablePaths(github, repo, pull);
  const run = await findLatestPullRun(github, repo, pull.head.sha);
  const check = await ciResultCheck(github, repo, pull.head.sha);
  requireMatchingCi(run, check, pull, repo);
  // The trusted default-branch controller repeats every revision, CI, and artifact check.
  await github.rest.actions.createWorkflowDispatch({
    ...repo,
    workflow_id: 'preview.yml',
    ref: 'main',
    inputs: { run_id: String(run.id) },
  });
  return { pullRequest: pull.number, headSha: pull.head.sha, ciRunId: run.id };
}
