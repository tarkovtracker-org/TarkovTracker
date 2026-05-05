import { edgeCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonMapSpawnsFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovMapSpawns');
const MAP_SPAWNS_CACHE_VERSION = 'json-v1';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `map-spawns-${MAP_SPAWNS_CACHE_VERSION}-${lang}-${gameMode}`;
  const fetcher = createTarkovJsonMapSpawnsFetcher({ gameMode, lang });
  try {
    return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
  } catch (error) {
    logger.error('Failed to fetch map spawns data:', { cacheKey, error });
    throw error;
  }
});
