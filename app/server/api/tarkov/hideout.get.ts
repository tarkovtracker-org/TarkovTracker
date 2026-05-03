import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonHideoutFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovHideout');
const HIDEOUT_CACHE_VERSION = 'json-v3';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `hideout-${HIDEOUT_CACHE_VERSION}-${lang}-${gameMode}`;
  const baseFetcher = createTarkovJsonHideoutFetcher({ gameMode, lang });
  const fetcher = async () => {
    const response = await baseFetcher();
    return await applyOverlay(response, { bypassCache, gameMode });
  };
  try {
    return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
  } catch (error) {
    logger.error('Failed to fetch hideout data:', error);
    throw error;
  }
});
