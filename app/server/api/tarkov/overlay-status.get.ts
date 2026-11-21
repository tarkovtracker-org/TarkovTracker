import { CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import { createLogger } from '~/server/utils/logger';
import { getPrecomputedStore } from '~/server/utils/precomputedTarkov';
const logger = createLogger('TarkovOverlayStatus');
export default defineEventHandler(async (event) => {
  const store = getPrecomputedStore(event);
  let manifest: unknown = null;
  try {
    manifest = await store?.get(CATALOG_MANIFEST_KEY, 'json');
  } catch (error) {
    logger.warn(`Precomputed store read failed for ${CATALOG_MANIFEST_KEY}`, error);
  }
  if (!manifest)
    throw createError({ statusCode: 503, statusMessage: 'Precompute manifest unavailable' });
  setHeader(event, 'Cache-Control', 'no-store');
  return manifest;
});
