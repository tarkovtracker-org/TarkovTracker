const MAX_RETRIES = 3;
const MAX_ELAPSED_MS = 8 * 60 * 1000;
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
function header(error, name) {
  // Octokit response headers are a lower-case keyed object.
  const headers = error.response?.headers ?? {};
  return headers[name];
}
function secondsHeader(error, name) {
  const value = header(error, name);
  return /^\d{1,12}$/.test(String(value)) ? Number(value) * 1000 : null;
}
function primaryWait(error, now) {
  const reset = secondsHeader(error, 'x-ratelimit-reset');
  if (header(error, 'x-ratelimit-remaining') !== '0' || reset === null) return null;
  // Reset is an epoch in seconds. Allow a second for the boundary/clock skew.
  return Math.max(0, reset - now) + 1000;
}
function secondaryLimit(error) {
  const message = error.response?.data?.message ?? error.message;
  return error.status === 429 || /secondary rate limit|abuse detection/i.test(message);
}
function secondaryWait(error, attempt) {
  // Exhausted primary quota needs a valid reset or Retry-After, never a guessed secondary wait.
  if (header(error, 'x-ratelimit-remaining') === '0') return null;
  return secondaryLimit(error) ? 60_000 * 2 ** attempt : null;
}
function retryDelay(error, now, attempt) {
  if (![403, 429].includes(error.status)) return null;
  const waits = [primaryWait(error, now), secondsHeader(error, 'retry-after')].filter(
    Number.isFinite
  );
  if (waits.length) return Math.max(1000, ...waits);
  return secondaryWait(error, attempt);
}
function mayRetry(attempt, delay, elapsed) {
  return [
    attempt < MAX_RETRIES,
    Number.isFinite(delay),
    delay > 0,
    elapsed + delay <= MAX_ELAPSED_MS,
  ].every(Boolean);
}
/** Retry the complete attestation, so every wait is followed by fresh revision checks. */
export async function withGitHubRateLimitRetry(
  operation,
  { now = Date.now, sleep: wait = sleep, warn = console.warn } = {}
) {
  const started = now();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = retryDelay(error, now(), attempt);
      if (!mayRetry(attempt, delay, now() - started)) throw error;
      warn(
        `GitHub CI publication rate limited; waiting ${Math.ceil(delay / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}.`
      );
      await wait(delay);
    }
  }
}
