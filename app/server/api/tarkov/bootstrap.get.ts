import { edgeCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonBootstrapFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovBootstrap');
const BOOTSTRAP_CACHE_VERSION = 'json-v1';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `bootstrap-${BOOTSTRAP_CACHE_VERSION}-${lang}-${gameMode}`;
  const fetcher = createTarkovJsonBootstrapFetcher({ gameMode, lang });
  try {
    return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
  } catch (error) {
    logger.error('Failed to fetch bootstrap data:', error);
    throw error;
  }
});
