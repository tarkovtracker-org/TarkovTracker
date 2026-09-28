import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
// Only the current process's successful prepare pass can register this proof. Commit subjects,
// changed assets, and manifest versions are authored data and cannot establish it themselves.
const preparedVersions = new Map();
export function clearPreparedVersion({ cwd }) {
  preparedVersions.delete(resolve(cwd));
}
export function recordPreparedVersion({ cwd, nextRelease }, sha) {
  preparedVersions.set(resolve(cwd), { sha, version: nextRelease.version });
}
const VERSION_ASSETS = ['CHANGELOG.md', 'package.json'];
const isVersionAssets = (assets) =>
  VERSION_ASSETS.length === assets.length &&
  VERSION_ASSETS.every((asset) => assets.includes(asset));
function headInfo(cwd) {
  const [sha, subject] = execFileSync('git', ['log', '-1', '--format=%H%n%s'], {
    cwd,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const assets = execFileSync('git', ['show', '--format=', '--name-only', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  const manifest = JSON.parse(
    execFileSync('git', ['show', '--format=', 'HEAD:package.json'], { cwd, encoding: 'utf8' })
  );
  return { sha, subject, assets, version: manifest?.version };
}
const isVersionCommit = ({ subject, assets, version }, releaseVersion) =>
  subject === `chore(release): ${releaseVersion}` &&
  isVersionAssets(assets) &&
  version === releaseVersion;
const matchingPreparation = (marker, version) => Boolean(marker) && marker.version === version;
const matchesPreparedHead = (head, marker) =>
  head.sha === marker.sha && isVersionCommit(head, marker.version);
/** True only after this run prepared and committed its version, before publication. */
export function versionCommitted({ cwd, nextRelease }) {
  const version = nextRelease?.version;
  try {
    const marker = preparedVersions.get(resolve(cwd));
    if (!matchingPreparation(marker, version)) return false;
    return matchesPreparedHead(headInfo(cwd), marker);
  } catch {
    return false;
  }
}
