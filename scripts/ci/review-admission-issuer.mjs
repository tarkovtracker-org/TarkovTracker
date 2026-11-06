// The dedicated issuer key belongs only in the protected main-only admission environment.
import { createPrivateKey, sign } from 'node:crypto';
import { CONTEXT, requireEvidence, SHA } from './review-admission-policy.mjs';
const IDS = [
  'REVIEW_ADMISSION_APP_ID',
  'REVIEW_ADMISSION_BOT_ID',
  'REVIEW_ADMISSION_INSTALLATION_ID',
];
const LEGACY = Object.freeze({
  appId: 15368,
  botId: 41898282,
  installationId: null,
  queueAllowed: false,
});
export function publisherConfig(env = process.env) {
  const values = IDS.map((name) => env[name] ?? '');
  if (values.every((value) => value === '')) return null;
  requireEvidence(
    values.every((value) => /^[1-9]\d*$/.test(String(value))),
    'Review publisher configuration is incomplete or invalid.'
  );
  const ids = values.map(Number);
  requireEvidence(
    ids.every(Number.isSafeInteger),
    'Review publisher IDs exceed supported integer range.'
  );
  requireEvidence(
    ids[0] !== LEGACY.appId && ids[1] !== LEGACY.botId,
    'Review publisher must have a dedicated App and bot identity.'
  );
  return { appId: ids[0], botId: ids[1], installationId: ids[2], queueAllowed: true };
}
export function expectedPublisherBot(env = process.env) {
  return publisherConfig(env)?.botId ?? LEGACY.botId;
}
export function requireQueueIssuer(github) {
  requireEvidence(
    github.reviewAdmissionIssuer?.queueAllowed === true,
    'Queue admission requires the dedicated protected App publisher.'
  );
}
export function requireReceiptIssuer(receipt, env = process.env) {
  const expected = publisherConfig(env);
  if (!expected) return;
  const actual = receipt.issuer;
  requireEvidence(actual && typeof actual === 'object', 'Admission receipt issuer is missing.');
  requireEvidence(
    [
      actual.appId === expected.appId,
      actual.botId === expected.botId,
      actual.installationId === expected.installationId,
      actual.queueAllowed === true,
    ].every(Boolean),
    'Admission receipt issuer does not match configured App.'
  );
}
function mask(core, value) {
  if (core) core.setSecret(value);
}
function requireMainContext(context) {
  requireEvidence(
    context.ref === 'refs/heads/main',
    'App publisher must execute from trusted main.'
  );
  requireEvidence(
    ['pull_request_target', 'workflow_run', 'issue_comment', 'workflow_dispatch'].includes(
      context.eventName
    ),
    'App publisher event is not trusted.'
  );
}
function jwt(config, pem, core) {
  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new Error('Review publisher private key is invalid.');
  }
  requireEvidence(key.asymmetricKeyType === 'rsa', 'Review publisher requires an RSA key.');
  requireEvidence(
    key.asymmetricKeyDetails.modulusLength >= 2048,
    'Review publisher RSA key is too small.'
  );
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: String(config.appId) })}`;
  const value = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
  mask(core, value);
  return value;
}
async function appApi(fetchImpl, method, path, token, body) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'TarkovTracker-review-admission',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(apiFailure(method, path));
  }
  requireEvidence(response.ok, apiFailure(method, path, response.status, response.headers));
  try {
    return await response.json();
  } catch {
    throw new Error('Review publisher API response is invalid.');
  }
}
function apiFailure(method, path, status, headers) {
  const validStatus = Number.isInteger(status) && status >= 100 && status <= 599;
  const outcome = validStatus ? `returned HTTP ${status}` : 'request failed';
  return `Review publisher API ${method} ${path} ${outcome}${providerDiagnostics(headers)}.`;
}
function providerDiagnostics(headers) {
  const fields = [
    ['x-github-request-id', /^[A-Fa-f0-9:]{1,100}$/],
    ['x-ratelimit-limit', /^\d{1,12}$/],
    ['x-ratelimit-remaining', /^\d{1,12}$/],
    ['x-ratelimit-reset', /^\d{1,12}$/],
    ['retry-after', /^\d{1,12}$/],
  ];
  const details = fields.flatMap(([name, pattern]) => {
    const value = diagnosticHeader(headers, name);
    return typeof value === 'string' && pattern.test(value) ? [`${name}=${value}`] : [];
  });
  return details.length ? ` (${details.join('; ')})` : '';
}
function diagnosticHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name];
}
function statusesOnly(permissions) {
  requireEvidence(permissions.statuses === 'write', 'App needs commit-status write permission.');
  const unexpected = Object.keys(permissions).filter(
    (name) => !['statuses', 'metadata'].includes(name)
  );
  requireEvidence(
    unexpected.length === 0,
    'Review App/token permissions exceed statuses-only scope.'
  );
  requireMetadataPermission(permissions);
}
function requireMetadataPermission(permissions) {
  if (!Object.hasOwn(permissions, 'metadata')) return;
  requireEvidence(
    permissions.metadata === 'read',
    'Review publisher metadata permission is invalid.'
  );
}
async function verifiedApp(fetchImpl, config, token, github) {
  const app = await appApi(fetchImpl, 'GET', '/app', token);
  requireEvidence(app.id === config.appId, 'Review publisher App ID mismatch.');
  requireEvidence(/^[a-z0-9-]+$/.test(app.slug), 'Review publisher App slug is invalid.');
  statusesOnly(app.permissions);
  const bot = await publisherBot(github, `${app.slug}[bot]`);
  requireEvidence(
    bot.id === config.botId && bot.type === 'Bot',
    'Review publisher bot identity mismatch.'
  );
}
async function publisherBot(github, username) {
  try {
    const { data } = await github.rest.users.getByUsername({
      username,
      request: { signal: AbortSignal.timeout(15000) },
    });
    return data;
  } catch (error) {
    throw new Error(
      apiFailure(
        'GET',
        `/users/${encodeURIComponent(username)}`,
        error?.status,
        error?.response?.headers
      )
    );
  }
}
function installationIdentity(data, config, repo) {
  requireEvidence(
    data.id === config.installationId && data.app_id === config.appId,
    'Review publisher installation identity mismatch.'
  );
  requireEvidence(
    data.account.login.toLowerCase() === repo.owner.toLowerCase(),
    'Review publisher installation account mismatch.'
  );
  requireEvidence(
    data.repository_selection === 'selected',
    'Review publisher must use a selected-repository installation.'
  );
  requireEvidence(
    data.suspended_at === null,
    'Review publisher installation is suspended or unknown.'
  );
}
async function verifiedInstallation(fetchImpl, config, repo, token) {
  const installation = await appApi(
    fetchImpl,
    'GET',
    `/app/installations/${config.installationId}`,
    token
  );
  installationIdentity(installation, config, repo);
  const selected = await appApi(
    fetchImpl,
    'GET',
    `/repos/${repo.owner}/${repo.repo}/installation`,
    token
  );
  installationIdentity(selected, config, repo);
}
function tokenIdentity(token, repository) {
  requireEvidence(
    token.repository_selection === 'selected',
    'App token repository scope is not selected.'
  );
  requireEvidence(
    Array.isArray(token.repositories) && token.repositories.length === 1,
    'App token must target exactly one repository.'
  );
  requireEvidence(
    token.repositories[0].id === repository.id &&
      token.repositories[0].full_name === repository.full_name,
    'App token repository identity mismatch.'
  );
  statusesOnly(token.permissions);
}
function tokenExpiry(token) {
  requireEvidence(
    typeof token.token === 'string' && token.token.length > 0,
    'Review publisher token is missing.'
  );
  const remaining = Date.parse(token.expires_at) - Date.now();
  requireEvidence(
    [Number.isFinite(remaining), remaining > 0, remaining <= 3900000].every(Boolean),
    'Review publisher token expiry is invalid.'
  );
}
async function restrictedToken(fetchImpl, config, repository, jwtToken, core) {
  const token = await appApi(
    fetchImpl,
    'POST',
    `/app/installations/${config.installationId}/access_tokens`,
    jwtToken,
    { repository_ids: [repository.id], permissions: { statuses: 'write' } }
  );
  tokenExpiry(token);
  mask(core, token.token);
  tokenIdentity(token, repository);
  return token.token;
}
function requireStatusTarget(params, repo) {
  requireEvidence(
    params.owner === repo.owner && params.repo === repo.repo,
    'App status target repository mismatch.'
  );
  requireEvidence(SHA.test(params.sha), 'App status target revision is invalid.');
  requireEvidence(
    params.context === CONTEXT,
    'App publisher status context is outside its job scope.'
  );
}
function statusPublisher(fetchImpl, repo, token) {
  return async (params) => {
    requireStatusTarget(params, repo);
    const { owner, repo: name, sha, ...body } = params;
    const data = await appApi(
      fetchImpl,
      'POST',
      `/repos/${owner}/${name}/statuses/${sha}`,
      token,
      body
    );
    return { data };
  };
}
function wrappedGithub(github, issuer, publish) {
  return {
    ...github,
    reviewAdmissionIssuer: issuer,
    rest: { ...github.rest, repos: { ...github.rest.repos, createCommitStatus: publish } },
  };
}
async function repositoryIdentity(github, repo) {
  const { data } = await github.rest.repos.get(repo);
  requireEvidence(
    data.full_name === `${repo.owner}/${repo.repo}`,
    'App repository metadata mismatch.'
  );
  requireEvidence(Number.isSafeInteger(data.id) && data.id > 0, 'App repository ID is invalid.');
  return data;
}
export async function createReviewPublisher({
  github,
  context,
  core,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = publisherConfig(env);
  if (!config) return legacyPublisher(github, env);
  requireMainContext(context);
  const pem = env.REVIEW_ADMISSION_PRIVATE_KEY;
  requireEvidence(
    typeof pem === 'string' && pem.length > 0,
    'Protected review publisher private key is missing.'
  );
  mask(core, pem);
  const token = jwt(config, pem, core);
  await verifiedApp(fetchImpl, config, token, github);
  await verifiedInstallation(fetchImpl, config, context.repo, token);
  const repository = await repositoryIdentity(github, context.repo);
  const access = await restrictedToken(fetchImpl, config, repository, token, core);
  return wrappedGithub(github, config, statusPublisher(fetchImpl, context.repo, access));
}
function legacyPublisher(github, env) {
  requireEvidence(
    !env.REVIEW_ADMISSION_PRIVATE_KEY,
    'Private publisher key exists without public App configuration.'
  );
  return wrappedGithub(github, LEGACY, github.rest.repos.createCommitStatus);
}
