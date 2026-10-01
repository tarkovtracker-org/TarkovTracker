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
const EXCHANGE_TIMEOUT_MS = 15000;
async function exchangeServiceTokenWithFetch(origin, fetchImpl, headers, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${origin}/`, { redirect: 'manual', headers, signal });
  } catch {
    // Transport diagnostics can contain reusable credentials. Never retain the original error
    // (including its cause) in Playwright reports or runner poll logs.
    throw new Error('Preview Access session exchange failed.');
  }
  try {
    const cookies = response.headers.getSetCookie?.() ?? [];
    const headersArray = cookies.map((value) => ({ name: 'set-cookie', value }));
    return acceptedAccessSession(response.status, headersArray);
  } finally {
    // Only headers are needed. Cancel rather than consume a potentially stalled response body.
    cancelPreviewResponse(response);
  }
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
  const session = await cachedExchange(sessions, origin, () =>
    exchangeServiceTokenWithFetch(origin, fetchImpl, headers, timeoutMs)
  );
  return { cookie: `${ACCESS_SESSION_COOKIE}=${session}` };
}
// Keep reusable credentials out of Playwright's instrumented request client entirely.
export async function previewAccessSession(origin, env = process.env, fetchImpl = fetch) {
  const headers = await previewAccessCookieHeaders(origin, fetchImpl, env);
  return headers.cookie?.slice(`${ACCESS_SESSION_COOKIE}=`.length) ?? '';
}
function cancelPreviewResponse(response) {
  try {
    void response?.body?.cancel().catch(() => {});
  } catch {
    // Disposal diagnostics must not retain authenticated request headers either.
  }
}
function bufferedPreviewResponse(status, text) {
  // The smoke assertions use only status and JSON. Buffer within the request deadline so
  // response parsing and disposal cannot expose transport errors after this helper returns.
  return {
    status: () => status,
    json: async () => {
      try {
        if (text === null) throw new Error();
        return JSON.parse(text);
      } catch {
        throw new Error('Preview response JSON is unavailable or invalid.');
      }
    },
    dispose: async () => {
      text = null;
    },
  };
}
async function authenticatedPreviewGet(url, headers, fetchImpl, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return bufferedPreviewResponse(response.status, await response.text());
  } catch {
    throw new Error('Authenticated preview request failed.');
  } finally {
    cancelPreviewResponse(response);
  }
}
export async function previewGet(request, url, origin, fetchImpl = fetch, timeoutMs = 30000) {
  assertPreviewTarget(url, origin);
  const session = await previewAccessSession(origin);
  const headers = session ? { cookie: `${ACCESS_SESSION_COOKIE}=${session}` } : {};
  // Even an expiring Access cookie is a credential. Never pass it to the instrumented client:
  // catching its error afterward cannot remove already recorded Playwright call logs.
  if (session) return authenticatedPreviewGet(url, headers, fetchImpl, timeoutMs);
  return request.get(url, { headers, maxRedirects: 0 });
}
export async function protectPreviewBrowser(page, request, origin) {
  const session = await previewAccessSession(origin);
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
