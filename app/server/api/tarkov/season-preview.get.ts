import { createError, defineEventHandler, setHeader } from 'h3';
import { createLogger } from '@/server/utils/logger';
import { overlayAuthHeaders } from '@/server/utils/overlayAuth';
import { parseSeasonPreview } from '@/server/utils/seasonPreview';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
import type { SeasonPreview } from '@/types/seasonPreview';
const OVERLAY_REVISION = 'a749270dcad82b26334ccf6feb15b8f4a66ff145';
const PREVIEW_URL = `https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/${OVERLAY_REVISION}/src/previews/untar-control.json`;
const TTL_SECONDS = 300;
const logger = createLogger('TarkovSeasonPreview');
// A validated immutable revision can be reused for this isolate's lifetime.
let catalog: Promise<SeasonPreview> | undefined;
async function fetchPreview(): Promise<SeasonPreview> {
  const auth = overlayAuthHeaders(PREVIEW_URL);
  if (!auth.Authorization) throw new Error('Overlay read token unavailable');
  const response = await fetch(PREVIEW_URL, {
    // Workers requires manual mode to return redirects without following them.
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: {
      Accept: 'application/json',
      'User-Agent': TARKOVTRACKER_USER_AGENT,
      ...auth,
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Season preview upstream returned ${response.status}`);
  }
  const preview = parseSeasonPreview(await response.json().catch(() => null));
  if (!preview) throw new Error('Invalid season preview catalog');
  return preview;
}
export default defineEventHandler(async (event) => {
  try {
    const preview = await (catalog ??= fetchPreview().catch((error) => {
      catalog = undefined;
      logger.warn('Season preview fetch failed', error);
      throw error;
    }));
    setHeader(event, 'Cache-Control', `public, max-age=${TTL_SECONDS}`);
    return preview;
  } catch {
    setHeader(event, 'Cache-Control', 'no-store');
    throw createError({ statusCode: 503, statusMessage: 'Season 2 preview unavailable' });
  }
});
