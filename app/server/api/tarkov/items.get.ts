import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_EXTENDED, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonItemsFetcher } from '~/server/utils/tarkov-json';
const ITEMS_CACHE_VERSION = 'json-v1';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `items-${ITEMS_CACHE_VERSION}-${lang}-${gameMode}`;
  const baseFetcher = createTarkovJsonItemsFetcher({ gameMode, lang });
  const fetcher = async () => {
    const response = await baseFetcher();
    return await applyOverlay(response, { bypassCache, gameMode });
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_EXTENDED, {
    cacheKeyPrefix: 'tarkov',
  });
});
