import { edgeCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { TARKOV_HIDEOUT_QUERY } from '~/server/utils/tarkov-queries';
import { createTarkovFetcher } from '~/server/utils/tarkovFetcher';
const logger = createLogger('TarkovHideout');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `hideout-${lang}-${gameMode}`;
  const fetcher = createTarkovFetcher(TARKOV_HIDEOUT_QUERY, { lang, gameMode });
  try {
    return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
  } catch (error) {
    logger.error('Failed to fetch hideout data:', error);
    throw error;
  }
});
