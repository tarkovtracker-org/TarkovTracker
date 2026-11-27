import { previewAccessCookieHeaders } from './access.mjs';
const MAX_CATALOG_AGE_MS = 6 * 24 * 60 * 60 * 1000;
const CATALOG_PROBE_PATH = '/api/tarkov/hideout?gameMode=regular';
function isCurrentRelease(value, now) {
  const timestamp = Number(value);
  return (
    Number.isSafeInteger(timestamp) &&
    timestamp > 0 &&
    timestamp <= now &&
    now - timestamp <= MAX_CATALOG_AGE_MS
  );
}
function requirePrecomputed(response) {
  const source = response.headers.get('X-Cache-Status');
  if (response.status !== 200 || source !== 'PRECOMPUTE') {
    throw new Error(
      `Preview catalog unavailable (HTTP ${response.status}, source ${source ?? 'unknown'}). Check the preview catalog refresh in Precompute Tarkov Data.`
    );
  }
}
export async function assertPreviewCatalog(origin, { fetchImpl = fetch, now = Date.now } = {}) {
  const headers = await previewAccessCookieHeaders(origin, fetchImpl);
  const response = await fetchImpl(origin + CATALOG_PROBE_PATH, {
    redirect: 'manual',
    headers,
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  requirePrecomputed(response);
  const release = response.headers.get('X-Catalog-Release');
  if (!isCurrentRelease(release, now())) {
    throw new Error(
      'Preview catalog timestamp is missing, invalid, or older than six days. Check the preview catalog refresh in Precompute Tarkov Data.'
    );
  }
  return Number(release);
}
