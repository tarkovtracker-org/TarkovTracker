import type { TarkovBootstrapQueryResult } from '~/types/tarkov';
import { edgeCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { CACHE_TTL_DEFAULT } from '~/server/utils/tarkov-cache-config';
import { TARKOV_BOOTSTRAP_QUERY } from '~/server/utils/tarkov-queries';
import { createTarkovFetcher } from '~/server/utils/tarkovFetcher';
const logger = createLogger('TarkovBootstrap');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const cacheKey = `bootstrap-${lang}`;
  const fetcher = createTarkovFetcher<TarkovBootstrapQueryResult>(TARKOV_BOOTSTRAP_QUERY, {});
  try {
    return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
      cacheKeyPrefix: 'tarkov',
    });
  } catch (error) {
    logger.error('Failed to fetch bootstrap data:', error);
    throw error;
  }
});
