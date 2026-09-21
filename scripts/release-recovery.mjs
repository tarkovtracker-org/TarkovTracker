import { isDeepStrictEqual } from 'node:util';
/** Read immutable release assets; non-file and oversized API responses fail closed. */
async function readAsset(github, repo, ref, path) {
  const { data } = await github.rest.repos.getContent({ ...repo, ref, path });
  if (data.type !== 'file' || data.encoding !== 'base64')
    throw new Error('Unreadable release asset.');
  return Buffer.from(data.content, 'base64').toString('utf8');
}
/** Require direct descent from the original validated main revision. */
function singleParent(commit, baseSha) {
  return commit.parents.length === 1 && commit.parents[0].sha === baseSha;
}
/** Recognize the one-parent, version-only commit produced by release preparation. */
function versionCommit(commit, baseSha) {
  if (!singleParent(commit, baseSha)) return null;
  const match = /^chore\(release\): (\d+\.\d+\.\d+)\s*$/.exec(commit.commit.message);
  if (!match) return null;
  const files = commit.files.map((file) => `${file.status}:${file.filename}`).sort();
  return isDeepStrictEqual(files, ['modified:CHANGELOG.md', 'modified:package.json'])
    ? match[1]
    : null;
}
/** Reconstruct the exact appended release notes without accepting other manifest changes. */
async function recoveryAssets(github, repo, baseSha, sha, version) {
  const [oldManifest, newManifest, oldLog, newLog] = await Promise.all([
    readAsset(github, repo, baseSha, 'package.json'),
    readAsset(github, repo, sha, 'package.json'),
    readAsset(github, repo, baseSha, 'CHANGELOG.md'),
    readAsset(github, repo, sha, 'CHANGELOG.md'),
  ]);
  verifyManifest(oldManifest, newManifest, version);
  return releaseNotes(oldLog, newLog, version);
}
/** Permit only the version field to change in the generated manifest. */
function verifyManifest(oldManifest, newManifest, version) {
  const before = JSON.parse(oldManifest);
  const after = JSON.parse(newManifest);
  if (after.version !== version) throw new Error('Release version mismatch.');
  before.version = version;
  if (!isDeepStrictEqual(before, after)) throw new Error('Release changed more than the version.');
}
/** Extract the prepended notes while preserving the complete previous changelog. */
function releaseNotes(oldLog, newLog, version) {
  const suffix = `\n\n${oldLog.trim()}`;
  const content = newLog.trim();
  if (!content.endsWith(suffix)) throw new Error('Release rewrote existing changelog content.');
  const notes = content.slice(0, -suffix.length).trim();
  const versionPattern = version.replaceAll('.', String.raw`\.`);
  if (!new RegExp(String.raw`^#{1,2} \[${versionPattern}\]`).test(notes)) {
    throw new Error('Release notes do not match the version.');
  }
  return notes;
}
/** Require successful latest CI from the configured provider on the promoted version SHA. */
async function validatedCi(github, repo, sha) {
  const checks = await github.paginate(github.rest.checks.listForRef, {
    ...repo,
    ref: sha,
    check_name: 'CI Result',
    filter: 'latest',
    per_page: 100,
  });
  const check = checks
    .filter((item) => item.app.id === 15368 && item.head_sha === sha)
    .sort((left, right) => right.id - left.id)[0];
  return check?.status === 'completed' && check.conclusion === 'success';
}
/** The controller path only the trusted preview workflow may report from. */
const PREVIEW_CONTROLLER_PATH = '.github/workflows/preview.yml';
/** Controller runs are only trusted when executed from the default-branch workflow revision. */
const TRUSTED_CONTROLLER_REF = 'main';
/** Authorize a run as the trusted controller: exact path and the default-branch workflow ref. */
function trustedControllerRun(run) {
  if (typeof run.path !== 'string') return false;
  const at = run.path.indexOf('@');
  return (
    run.path.slice(0, at) === PREVIEW_CONTROLLER_PATH &&
    run.path.slice(at + 1) === TRUSTED_CONTROLLER_REF
  );
}
/** The controller job that publishes authoritative `Preview Result` statuses. */
const PREVIEW_RESULT_JOB = 'Publish preview result';
/** Extract the controller run id from a `Preview Result` target; null when it points elsewhere. */
function controllerRunId(status) {
  const match = /\/actions\/runs\/(\d+)(?:\?|$)/.exec(status.target_url ?? '');
  return match ? Number(match[1]) : null;
}
/** The newest `Preview Result` on the SHA; later reports supersede earlier ones. */
function newestPreviewStatus(statuses) {
  return statuses
    .filter((item) => item.context === 'Preview Result')
    .sort((left, right) => right.id - left.id)[0];
}
/** The evidence is a success reported on the exact version SHA. */
function previewSuccessOnSha(status, sha) {
  return status.state === 'success' && status.sha === sha;
}
/** Fetch the run behind the status target; unresolvable runs fail closed like any other gate. */
async function controllerRun(github, repo, runId) {
  if (!runId) return null;
  const run = await optionalResource(() =>
    github.rest.actions.getWorkflowRun({ ...repo, run_id: runId })
  );
  if (!run || !trustedControllerRun(run)) return null;
  return run;
}
/** The controller must have finished its authoritative result publication for this evidence. */
async function resultJobCompleted(github, repo, run) {
  if (run.conclusion !== 'success') return false;
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...repo,
    run_id: run.id,
    per_page: 100,
  });
  const result = jobs.find((job) => job.name === PREVIEW_RESULT_JOB);
  return result?.conclusion === 'success';
}
/**
 * Require the newest `Preview Result` to bind to a successful controller result publication:
 * the status must succeed on the exact SHA and point at a run of the trusted preview workflow
 * whose result job completed successfully for a candidate (never an `ignore` no-op).
 */
async function validatedPreview(github, repo, sha) {
  const statuses = await github.paginate(github.rest.repos.listCommitStatusesForRef, {
    ...repo,
    ref: sha,
    per_page: 100,
  });
  const status = newestPreviewStatus(statuses);
  if (!status || !previewSuccessOnSha(status, sha)) return false;
  const run = await controllerRun(github, repo, controllerRunId(status));
  if (!run) return false;
  return resultJobCompleted(github, repo, run);
}
/** Interrupted recovery requires both gates on the exact version commit, like staging did. */
async function validatedVersion(github, repo, sha) {
  return (await validatedCi(github, repo, sha)) && (await validatedPreview(github, repo, sha));
}
/** On explicit reruns, recover only a validated version child of the original main CI commit. */
export async function findReleaseRecovery({ github, context, baseSha, sha }) {
  const { data: commit } = await github.rest.repos.getCommit({ ...context.repo, ref: sha });
  const version = versionCommit(commit, baseSha);
  if (!version || !(await validatedVersion(github, context.repo, sha))) return null;
  const notes = await recoveryAssets(github, context.repo, baseSha, sha, version);
  return { sha, version, notes };
}
/** Treat only not-found as absence, preserving permission and service failures. */
async function optionalResource(request) {
  try {
    return (await request()).data;
  } catch (error) {
    if (error.status !== 404) throw error;
    return null;
  }
}
/** Create a missing lightweight tag, and never replace an existing tag target. */
async function ensureTag(github, repo, tag, sha) {
  const existing = await optionalResource(() =>
    github.rest.git.getRef({ ...repo, ref: `tags/${tag}` })
  );
  if (!existing) {
    await github.rest.git.createRef({ ...repo, ref: `refs/tags/${tag}`, sha });
    return;
  }
  if (existing.object.type !== 'commit' || existing.object.sha !== sha) {
    throw new Error('Existing release tag points at another commit.');
  }
}
/** Resume tag/publication idempotently after the caller revalidates current main and CI. */
export async function publishRecoveredRelease({ github, context, recovery }) {
  const tag = `v${recovery.version}`;
  await ensureTag(github, context.repo, tag, recovery.sha);
  const existing = await optionalResource(() =>
    github.rest.repos.getReleaseByTag({ ...context.repo, tag })
  );
  if (existing) {
    if (existing.draft || existing.prerelease)
      throw new Error('Existing release is not a stable publication.');
    return;
  }
  await github.rest.repos.createRelease({
    ...context.repo,
    tag_name: tag,
    target_commitish: recovery.sha,
    name: tag,
    body: recovery.notes,
    draft: false,
    prerelease: false,
  });
}
