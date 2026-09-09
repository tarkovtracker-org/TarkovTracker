import { createLogger } from '~/server/utils/logger';
import { getPrecomputedStore } from '~/server/utils/precomputedTarkov';
const logger = createLogger('TarkovOverlayStatus');
const MANIFEST_KEY = 'overlay-precompute-manifest-json-v4';
export default defineEventHandler(async (event) => {
  const store = getPrecomputedStore(event);
  let manifest: unknown = null;
  try {
    manifest = await store?.get(MANIFEST_KEY, 'json');
  } catch (error) {
    logger.warn(`Precomputed store read failed for ${MANIFEST_KEY}`, error);
  }
  if (!manifest)
    throw createError({ statusCode: 503, statusMessage: 'Precompute manifest unavailable' });
  setHeader(event, 'Cache-Control', 'no-store');
  return manifest;
});
