import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { buildTasksCorePrecomputedKey } from '~/server/utils/precomputedTarkov';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonTasksCoreFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovTasksCore');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassOverlayCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  // Shared with scripts/precompute, which writes the same key to KV.
  const cacheKey = buildTasksCorePrecomputedKey(lang, gameMode);
  const baseFetcher = createTarkovJsonTasksCoreFetcher({ gameMode, lang });
  const fetcherWithOverlay = async () => {
    try {
      return await applyOverlay(await baseFetcher(), { bypassCache: bypassOverlayCache, gameMode });
    } catch (overlayError) {
      logger.error('Failed to apply overlay:', overlayError);
      throw overlayError;
    }
  };
  return await edgeCache(event, cacheKey, fetcherWithOverlay, CACHE_TTL_DEFAULT, {
    cacheKeyPrefix: 'tarkov',
    precomputed: true,
  });
});
