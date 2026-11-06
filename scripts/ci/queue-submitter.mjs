// GitHub starts no workflows for job-token (GITHUB_TOKEN) events, so a queue entry submitted by
// automation with the job token never receives merge_group CI. The dedicated Queue Submitter App
// mints a short-lived, single-repository token for the guarded enqueue helper. Its key belongs
// only in the main-only `merge-queue` environment.
import { createPrivateKey, sign } from 'node:crypto';
import { requireEvidence } from './review-admission-policy.mjs';
const PERMISSIONS = Object.freeze({ contents: 'write', pull_requests: 'write' });
const CONFIG = ['QUEUE_SUBMITTER_APP_ID', 'QUEUE_SUBMITTER_PRIVATE_KEY'];
/**
 * Returns null when unconfigured so local maintainers keep their inherited gh credential.
 * Automation sets QUEUE_SUBMITTER_REQUIRED=true and fails closed instead of using the job token.
 */
export function queueSubmitterConfig(env = process.env) {
  const [appId, key] = CONFIG.map((name) => env[name] ?? '');
  if ([appId, key].every((value) => value === '')) return unconfigured(env);
  requireEvidence(
    [/^[1-9]\d{0,11}$/.test(appId), key.length > 0].every(Boolean),
    'Queue submitter App configuration is incomplete or invalid.'
  );
  return { appId: Number(appId), key };
}
function unconfigured(env) {
  requireEvidence(
    env.QUEUE_SUBMITTER_REQUIRED !== 'true',
    'Queue submitter App is required; a job-token queue entry would start no merge_group CI.'
  );
  return null;
}
function appJwt(config) {
  let key;
  try {
    key = createPrivateKey(config.key);
  } catch {
    throw new Error('Queue submitter private key is invalid.');
  }
  requireEvidence(key.asymmetricKeyType === 'rsa', 'Queue submitter requires an RSA key.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = { iat: now - 60, exp: now + 540, iss: String(config.appId) };
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
}
async function appRequest(fetchImpl, method, path, jwt, body) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'User-Agent': 'TarkovTracker-queue-submitter',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const init = { method, headers, redirect: 'error', signal: AbortSignal.timeout(15000) };
  if (body) init.body = JSON.stringify(body);
  try {
    return await fetchImpl(`https://api.github.com${path}`, init);
  } catch {
    throw new Error(`Queue submitter API ${method} ${path} request failed.`);
  }
}
async function appApi(fetchImpl, method, path, jwt, body) {
  const response = await appRequest(fetchImpl, method, path, jwt, body);
  requireEvidence(
    response.ok,
    `Queue submitter API ${method} ${path} returned ${response.status}.`
  );
  try {
    return await response.json();
  } catch {
    throw new Error('Queue submitter API response is invalid.');
  }
}
function requireInstallation(installation, config, repo) {
  requireEvidence(
    [
      installation.app_id === config.appId,
      Number.isSafeInteger(installation.id),
      installation.repository_selection === 'selected',
      installation.suspended_at === null,
      installation.account?.login?.toLowerCase() === repo.owner.toLowerCase(),
    ].every(Boolean),
    'Queue submitter installation identity mismatch.'
  );
}
function exactPermissions(permissions = {}) {
  const extra = Object.keys(permissions).filter(
    (name) => !['metadata', ...Object.keys(PERMISSIONS)].includes(name)
  );
  return [
    extra.length === 0,
    [undefined, 'read'].includes(permissions.metadata),
    Object.entries(PERMISSIONS).every(([name, level]) => permissions[name] === level),
  ].every(Boolean);
}
function requireToken(token, repo) {
  const repositories = Array.isArray(token.repositories) ? token.repositories : [];
  requireEvidence(
    [
      typeof token.token === 'string' && token.token.length > 0,
      token.repository_selection === 'selected',
      repositories.length === 1,
      repositories[0]?.full_name === `${repo.owner}/${repo.repo}`,
      exactPermissions(token.permissions),
    ].every(Boolean),
    'Queue submitter token scope is invalid.'
  );
}
/** Mint a contents/pull-requests token limited to this repository; null when unconfigured. */
export async function queueSubmitterToken({ repo, env = process.env, fetchImpl = fetch }) {
  const config = queueSubmitterConfig(env);
  if (!config) return null;
  const jwt = appJwt(config);
  const installation = await appApi(
    fetchImpl,
    'GET',
    `/repos/${repo.owner}/${repo.repo}/installation`,
    jwt
  );
  requireInstallation(installation, config, repo);
  const token = await appApi(
    fetchImpl,
    'POST',
    `/app/installations/${installation.id}/access_tokens`,
    jwt,
    { repositories: [repo.repo], permissions: PERMISSIONS }
  );
  requireToken(token, repo);
  return token.token;
}
