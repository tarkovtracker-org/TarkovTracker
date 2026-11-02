import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  dependencyFingerprint,
  githubJson,
  githubPages,
  remoteFingerprint,
  requireEvidence,
  SHA,
} from './dependency-evidence.mjs';
import { latestSocketChecks, verifySocket } from './dependency-socket.mjs';
import { checkReleaseAge } from './release-age-exceptions.mjs';
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
function localFingerprint() {
  return dependencyFingerprint(readJson('package.json'), readFileSync('pnpm-lock.yaml', 'utf8'));
}
async function baseFingerprint(base, repository) {
  if (!SHA.test(base)) return null;
  const identity = execFileSync('git', ['cat-file', '--batch-check'], {
    input: `${base}^{commit}\n`,
    encoding: 'utf8',
  }).trim();
  // Only an absent commit in a shallow/fork checkout triggers the immutable API fallback.
  if (identity === `${base}^{commit} missing`) return remoteFingerprint(repository, base);
  requireEvidence(
    new RegExp(`^${base} commit [0-9]+$`).test(identity),
    'Unexpected git object identity'
  );
  const read = (file) =>
    execFileSync('git', ['show', `${base}:${file}`], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 ** 2,
    });
  return dependencyFingerprint(JSON.parse(read('package.json')), read('pnpm-lock.yaml'));
}
const immutableBase = (event) =>
  [event.pull_request?.base.sha, event.merge_group?.base_sha, event.before].find(Boolean);
export async function eventBase(event, repository, request = githubJson) {
  const immutable = immutableBase(event);
  if (immutable) return immutable;
  const current = await request(`repos/${repository}/commits/main`);
  requireEvidence(
    SHA.test(current.sha),
    'Cannot resolve trusted main for a dispatch or scheduled audit'
  );
  return current.sha;
}
function eventPayload() {
  const file = process.env.GITHUB_EVENT_PATH;
  return file ? readJson(file) : {};
}
async function queueHead(event, repository, request) {
  const match = /^refs\/heads\/gh-readonly-queue\/main\/pr-([1-9][0-9]*)-[a-f0-9]{40}$/.exec(
    event.merge_group.head_ref
  );
  requireEvidence(match, 'Unknown merge-queue branch identity');
  const pull = await request(`repos/${repository}/pulls/${match[1]}`);
  requireEvidence(
    [
      pull.state === 'open',
      pull.base.ref === 'main',
      pull.base.repo.full_name === repository,
      SHA.test(pull.head.sha),
    ].every(Boolean),
    'Queue member identity changed'
  );
  return pull.head.sha;
}
async function mergedHead(event, repository, request) {
  const pulls = await request(`repos/${repository}/commits/${event.after}/pulls`);
  const merged = pulls.filter((pull) =>
    [
      Boolean(pull.merged_at),
      pull.merge_commit_sha === event.after,
      pull.base.ref === 'main',
    ].every(Boolean)
  );
  requireEvidence(merged.length <= 1, 'Ambiguous merged Socket scan source');
  return merged[0]?.head.sha || event.after;
}
export async function socketHead(event, repository, fallback, request = githubJson) {
  if (event.pull_request) return event.pull_request.head.sha;
  if (event.merge_group) return queueHead(event, repository, request);
  if (SHA.test(event.after)) return mergedHead(event, repository, request);
  return fallback;
}
async function waitForSocket(repository, head) {
  const deadline = Date.now() + 4 * 60_000;
  while (true) {
    const runs = await githubPages(
      `repos/${repository}/commits/${head}/check-runs?filter=latest`,
      'check_runs'
    );
    const checks = latestSocketChecks(runs);
    if (checks.every((check) => check?.status === 'completed')) return;
    requireEvidence(
      Date.now() < deadline,
      'Socket reports are missing or did not complete within four minutes'
    );
    console.log(
      'Waiting for the Socket app to finish this revision (before dependency installation).'
    );
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
function reviewData() {
  const file = new URL('./dependency-reviews.json', import.meta.url);
  return existsSync(file) ? readJson(file) : {};
}
const scanCandidate = (reviews) =>
  SHA.test(process.env.GITHUB_SHA) ? process.env.GITHUB_SHA : reviews.socket?.head;
const warningReviews = (reviews) => reviews.socket?.warnings ?? [];
export function queueComposition(event, base) {
  if (
    ![Boolean(event.merge_group), Boolean(event.pull_request), SHA.test(event.after)].some(Boolean)
  )
    return undefined;
  return {
    base,
    candidate: { manifest: readJson('package.json'), lock: readFileSync('pnpm-lock.yaml', 'utf8') },
  };
}
function repositoryIdentity() {
  const repository = process.env.GITHUB_REPOSITORY || 'tarkovtracker-org/TarkovTracker';
  requireEvidence(/^[\w.-]+\/[\w.-]+$/.test(repository), 'Invalid repository identity');
  return repository;
}
async function reviewedSocket(event, repository, base, fingerprint) {
  const reviews = reviewData();
  const head = await socketHead(event, repository, scanCandidate(reviews));
  requireEvidence(SHA.test(head), 'No immutable Socket scan revision is recorded');
  if ([process.env.GITHUB_ACTIONS === 'true', Boolean(event.pull_request)].every(Boolean))
    await waitForSocket(repository, head);
  return verifySocket(
    repository,
    head,
    fingerprint,
    warningReviews(reviews),
    Date.now(),
    queueComposition(event, base)
  );
}
export async function checkDependencySecurity() {
  const status = await checkReleaseAge();
  requireEvidence(status === 0, 'Release-age evidence failed');
  const fingerprint = localFingerprint();
  const event = eventPayload();
  const repository = repositoryIdentity();
  const base = await eventBase(event, repository);
  if ((await baseFingerprint(base, repository)) === fingerprint) {
    console.log(
      'Dependency Security: dependency graph unchanged from the trusted event base; live audits still run.'
    );
    return;
  }
  const warnings = await reviewedSocket(event, repository, base, fingerprint);
  console.log(
    `Dependency Security passed: Socket reports cover the graph; ${warnings.length} reviewed informational warning(s).`
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await checkDependencySecurity();
  } catch (error) {
    console.error(`::error title=Dependency Security::${error.message}`);
    process.exitCode = 1;
  }
}
