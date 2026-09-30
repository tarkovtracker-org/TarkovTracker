// The reusable service token is sent by the trusted runner exactly once per origin, to exchange
// it for Access's host-scoped, expiring CF_Authorization session. Browser and API smoke traffic
// carries only that session, never the service token itself.
const ACCESS_SESSION_COOKIE = 'CF_Authorization';
const sessions = new Map();
export function previewAccessHeaders(env = process.env) {
  const id = env.PREVIEW_ACCESS_CLIENT_ID?.trim();
  const secret = env.PREVIEW_ACCESS_CLIENT_SECRET?.trim();
  if (Boolean(id) !== Boolean(secret))
    throw new Error('Both preview Access credentials are required.');
  return id ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret } : {};
}
export function assertPreviewTarget(url, origin) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.origin !== origin) {
    throw new Error('Access credentials are restricted to the exact preview origin.');
  }
}
export function readAccessSessionCookie(headersArray) {
  const prefix = `${ACCESS_SESSION_COOKIE}=`;
  const header = headersArray.find(
    ({ name, value }) => name.toLowerCase() === 'set-cookie' && value.startsWith(prefix)
  );
  return header ? header.value.slice(prefix.length).split(';')[0] : '';
}
const ACCESS_DENIED_STATUSES = new Set([401, 403]);
// Access can attach a cookie to a denied response, so the exchange also requires an accepted status.
function acceptedAccessSession(status, headersArray) {
  const session = readAccessSessionCookie(headersArray);
  if (ACCESS_DENIED_STATUSES.has(status) || !session) {
    throw new Error(`Access did not issue a preview session for the service token (${status}).`);
  }
  return session;
}
// Sessions are re-exchanged well inside Access's shortest session duration (15 minutes), and
// failed exchanges are evicted, so a later attempt can retry within its own bounded window.
const SESSION_REUSE_MS = 5 * 60 * 1000;
function cachedExchange(cache, origin, exchange, now = Date.now) {
  const cached = cache.get(origin);
  if (cached && now() - cached.at < SESSION_REUSE_MS) return cached.pending;
  const pending = exchange();
  cache.set(origin, { pending, at: now() });
  pending.catch(() => cache.delete(origin));
  return pending;
}
async function exchangeServiceToken(request, origin, headers) {
  const response = await request.get(`${origin}/`, { headers, maxRedirects: 0 });
  return acceptedAccessSession(response.status(), response.headersArray());
}
export async function previewAccessSession(request, origin, env = process.env) {
  const headers = previewAccessHeaders(env);
  if (!Object.keys(headers).length) return '';
  return cachedExchange(sessions, origin, () => exchangeServiceToken(request, origin, headers));
}
const fetchSessions = new Map();
const EXCHANGE_TIMEOUT_MS = 15000;
async function exchangeServiceTokenWithFetch(origin, fetchImpl, headers, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(`${origin}/`, { redirect: 'manual', headers, signal });
  const cookies = response.headers.getSetCookie?.() ?? [];
  const headersArray = cookies.map((value) => ({ name: 'set-cookie', value }));
  return acceptedAccessSession(response.status, headersArray);
}
/** Fetch-based variant for runner polls: a bounded exchange per origin, then only the session. */
export async function previewAccessCookieHeaders(
  origin,
  fetchImpl = fetch,
  env = process.env,
  timeoutMs = EXCHANGE_TIMEOUT_MS
) {
  const headers = previewAccessHeaders(env);
  if (!Object.keys(headers).length) return {};
  const session = await cachedExchange(fetchSessions, origin, () =>
    exchangeServiceTokenWithFetch(origin, fetchImpl, headers, timeoutMs)
  );
  return { cookie: `${ACCESS_SESSION_COOKIE}=${session}` };
}
export async function previewGet(request, url, origin) {
  assertPreviewTarget(url, origin);
  const session = await previewAccessSession(request, origin);
  const headers = session ? { cookie: `${ACCESS_SESSION_COOKIE}=${session}` } : {};
  return request.get(url, { headers, maxRedirects: 0 });
}
export async function protectPreviewBrowser(page, request, origin) {
  const session = await previewAccessSession(request, origin);
  if (!session) return;
  const { hostname } = new URL(origin);
  await page.context().addCookies([
    {
      name: ACCESS_SESSION_COOKIE,
      value: session,
      domain: hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
