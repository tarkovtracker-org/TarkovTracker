import { overlayAuthHeaders } from '@/server/utils/overlayAuth';
import { parseSeasonPreview } from '@/server/utils/seasonPreview';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
import type { SeasonPreview } from '@/types/seasonPreview';
const OVERLAY_REVISION = '66a3280cc51251b177c384005b00dbb55e285d7f';
const PREVIEW_URL = `https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/${OVERLAY_REVISION}/src/previews/untar-control.json`;
const TTL_SECONDS = 300;
let cached: { preview: SeasonPreview; expiresAt: number } | undefined;
async function fetchPreview(): Promise<SeasonPreview> {
  const response = await fetch(PREVIEW_URL, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      Accept: 'application/json',
      'User-Agent': TARKOVTRACKER_USER_AGENT,
      ...overlayAuthHeaders(PREVIEW_URL),
    },
  });
  const preview = response.ok ? parseSeasonPreview(await response.json()) : null;
  if (!preview) throw new Error('Season preview is unavailable or invalid');
  return preview;
}
async function loadPreview(): Promise<SeasonPreview> {
  if (cached && Date.now() < cached.expiresAt) return cached.preview;
  const preview = await fetchPreview();
  cached = { preview, expiresAt: Date.now() + TTL_SECONDS * 1000 };
  return preview;
}
export default defineEventHandler(async (event) => {
  try {
    const preview = await loadPreview();
    setHeader(event, 'Cache-Control', `public, max-age=${TTL_SECONDS}`);
    return preview;
  } catch {
    setHeader(event, 'Cache-Control', 'no-store');
    throw createError({ statusCode: 503, statusMessage: 'Season 2 preview unavailable' });
  }
});
