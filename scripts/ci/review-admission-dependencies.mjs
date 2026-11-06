import { safeLockfileChange } from './review-admission-lock.mjs';
import { requireEvidence } from './review-admission-policy.mjs';
import { safeVersion } from './review-admission-version.mjs';
const GROUP =
  /^dependabot\/npm_and_yarn\/(?:nuxt-ecosystem|lint-and-format|testing-tooling|typescript-and-types|tailwind-tooling|cloudflare-tooling|release-tooling|remaining-npm)-/;
const SENSITIVE_PACKAGE = /(?:supabase|stripe|auth|session|jose|jsonwebtoken|progress-contracts)/i;
function dependencyCandidate(pr, files) {
  return [
    pr.user.id === 49699333,
    pr.head.repo?.full_name === pr.base.repo.full_name,
    GROUP.test(pr.head.ref),
    files.every(dependencyFile),
  ].every(Boolean);
}
function dependencyFile(file) {
  return [
    file.status === 'modified',
    !file.previous_filename,
    ['package.json', 'pnpm-lock.yaml'].includes(file.filename),
  ].every(Boolean);
}
export async function readManifest(github, repository, revision) {
  const [owner, repo] = repository.split('/');
  const { data } = await github.rest.repos.getContent({
    owner,
    repo,
    path: 'package.json',
    ref: revision,
  });
  requireEvidence(
    data.encoding === 'base64' && data.size <= 100000,
    'Dependency manifest encoding/size is unknown.'
  );
  return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}
function withoutDependencies(manifest) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(manifest).filter(([key]) => !['dependencies', 'devDependencies'].includes(key))
    )
  );
}
function dependencySection(before = {}, after = {}) {
  if (Object.keys(before).length !== Object.keys(after).length) return false;
  return Object.entries(after).every(([name, version]) =>
    safeDependency(name, before[name], version)
  );
}
function safeDependency(name, before, after) {
  if (before === after) return true;
  if (SENSITIVE_PACKAGE.test(name)) return false;
  return safeVersion(before, after);
}
export function safeDependencyManifests(before, after) {
  return [
    withoutDependencies(before) === withoutDependencies(after),
    dependencySection(before.dependencies, after.dependencies),
    dependencySection(before.devDependencies, after.devDependencies),
  ].every(Boolean);
}
async function lockContent(github, repository, ref) {
  const [owner, repo] = repository.split('/');
  const { data } = await github.rest.repos.getContent({ owner, repo, ref, path: 'pnpm-lock.yaml' });
  requireEvidence(
    [data.type === 'file', data.encoding === 'base64', data.size <= 1000000].every(Boolean),
    'Unreadable or oversized immutable lockfile.'
  );
  return Buffer.from(data.content, 'base64').toString('utf8');
}
export async function dependencyEligibility(github, pr, files) {
  if (!dependencyCandidate(pr, files)) return false;
  const repository = pr.base.repo.full_name;
  const before = await readManifest(github, repository, pr.base.sha);
  const after = await readManifest(github, repository, pr.head.sha);
  if (!safeDependencyManifests(before, after)) return false;
  const oldLock = await lockContent(github, repository, pr.base.sha);
  const newLock = await lockContent(github, repository, pr.head.sha);
  return safeLockfileChange(oldLock, newLock);
}
