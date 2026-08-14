import { edgeCache, setOverlayResponseHeaders, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonHideoutFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovHideout');
const HIDEOUT_CACHE_VERSION = 'json-v4';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `hideout-${HIDEOUT_CACHE_VERSION}-${lang}-${gameMode}`;
  const baseFetcher = createTarkovJsonHideoutFetcher({ gameMode, lang });
  try {
    const baseResponse = await edgeCache(event, cacheKey, baseFetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
    const response = await applyOverlay(baseResponse, { bypassCache, gameMode, locale: lang });
    setOverlayResponseHeaders(event, response);
    return response;
  } catch (error) {
    logger.error('Failed to fetch hideout data:', error);
    throw error;
  }
});
