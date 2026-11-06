import { isDeepStrictEqual } from 'node:util';
import { readManifest } from './review-admission-dependencies.mjs';
import { requireEvidence } from './review-admission-policy.mjs';
const BRANCH =
  /^wip\/release-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-([1-9]\d*)-([1-9]\d*)$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
function generatedAsset(file) {
  return [
    file.status === 'modified',
    !file.previous_filename,
    ['package.json', 'CHANGELOG.md'].includes(file.filename),
  ].every(Boolean);
}
function releaseCandidate(pr, files) {
  return [
    pr.user.id === 41898282,
    pr.user.type === 'Bot',
    pr.head.repo.full_name === pr.base.repo.full_name,
    isDeepStrictEqual(files.map((file) => file.filename).toSorted(), [
      'CHANGELOG.md',
      'package.json',
    ]),
    files.every(generatedAsset),
  ].every(Boolean);
}
function canonicalVersion(version) {
  if (!VERSION.test(version)) return false;
  return version.split('.').map(Number).every(Number.isSafeInteger);
}
function newerVersion(before, after) {
  const oldVersion = before.split('.').map(Number);
  const newVersion = after.split('.').map(Number);
  const differing = oldVersion.findIndex((part, index) => part !== newVersion[index]);
  return differing >= 0 && newVersion[differing] > oldVersion[differing];
}
export function safeReleaseManifest(before, after, version) {
  if (!canonicalVersion(before.version)) return false;
  if (!canonicalVersion(version)) return false;
  return [
    after.version === version,
    newerVersion(before.version, version),
    isDeepStrictEqual({ ...before, version }, after),
  ].every(Boolean);
}
export async function requireReleaseSource(github, repo, pr, group, files) {
  if (!releaseCandidate(pr, files)) return;
  if (!BRANCH.test(pr.head.ref)) return;
  const { data: commit } = await github.rest.git.getCommit({ ...repo, commit_sha: pr.head.sha });
  requireEvidence(
    commit.parents.length === 1,
    'Generated release candidate must have one source parent.'
  );
  requireEvidence(
    commit.parents[0].sha === group.base_sha,
    'Generated release assets have a stale source; regenerate before queue promotion.'
  );
}
export async function releaseAssetsEligibility(github, pr, files) {
  if (!releaseCandidate(pr, files)) return false;
  const branch = BRANCH.exec(pr.head.ref);
  if (!branch) return false;
  const repository = pr.base.repo.full_name;
  const before = await readManifest(github, repository, pr.base.sha);
  const after = await readManifest(github, repository, pr.head.sha);
  return safeReleaseManifest(before, after, branch[1]);
}
