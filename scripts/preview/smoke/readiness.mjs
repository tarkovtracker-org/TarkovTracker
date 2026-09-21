// Bounded startup window for a freshly uploaded Pages deployment. Persistent failure after the
// window blocks the preview gate; the window never extends for an individual failing check.
const STARTUP_WINDOW_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for preview smoke tests.`);
  return value;
}
export function previewOrigin() {
  const url = new URL(requiredEnv('PREVIEW_URL'));
  if (url.protocol !== 'https:') throw new Error('Preview URL must be HTTPS.');
  return url.origin;
}
async function probeOnce(origin, fetchImpl) {
  try {
    const response = await fetchImpl(`${origin}/`, { redirect: 'manual' });
    const type = response.headers.get('content-type') || '';
    return response.status === 200 && type.includes('text/html');
  } catch {
    return false;
  }
}
function defaultWait() {
  return (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}
function startupElapsed(windowMs) {
  return `Deployment did not serve the application within ${windowMs / 1000}s.`;
}
function pollDeadline(now, deadline) {
  return now() + POLL_INTERVAL_MS > deadline;
}
async function pollAttempt(origin, fetchImpl, now, deadline) {
  if (await probeOnce(origin, fetchImpl)) return 'ready';
  return pollDeadline(now, deadline) ? 'expired' : 'retry';
}
/** Poll until the deployment serves HTML or the startup window closes. */
export async function waitForDeployment(
  origin,
  { fetchImpl = fetch, now = Date.now, sleep = defaultWait(), windowMs = STARTUP_WINDOW_MS } = {}
) {
  const deadline = now() + windowMs;
  let attempts = 0;
  while (now() <= deadline) {
    attempts += 1;
    const outcome = await pollAttempt(origin, fetchImpl, now, deadline);
    if (outcome === 'ready') return attempts;
    if (outcome === 'expired') break;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(startupElapsed(windowMs));
}
// Production services the anonymous preview must never contact from the browser.
const FORBIDDEN_HOST_PATTERNS = [
  /\.supabase\.co$/i,
  /(^|\.)stripe\.com$/i,
  /(^|\.)stripe\.network$/i,
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)analytics\.google\.com$/i,
  /(^|\.)clarity\.ms$/i,
  /(^|\.)doubleclick\.net$/i,
];
export function isForbiddenRequest(url) {
  try {
    const { hostname } = new URL(url);
    return FORBIDDEN_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
