import { edgeCache } from '~/server/utils/edgeCache';
import { createLogger } from '~/server/utils/logger';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonBootstrapFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovBootstrap');
// Player levels have no translatable text: one entry per game mode, any `lang` is ignored.
const BOOTSTRAP_CACHE_VERSION = 'json-v2';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `bootstrap-${BOOTSTRAP_CACHE_VERSION}-${gameMode}`;
  const fetcher = createTarkovJsonBootstrapFetcher({ gameMode });
  try {
    return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
  } catch (error) {
    logger.error('Failed to fetch bootstrap data:', error);
    throw error;
  }
});
