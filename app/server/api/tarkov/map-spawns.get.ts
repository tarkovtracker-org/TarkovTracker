import type { TarkovMapSpawnsQueryResult } from '~/types/tarkov';
import { edgeCache } from '~/server/utils/edgeCache';
import { validateAndThrow } from '~/server/utils/graphql-validation';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { TARKOV_MAP_SPAWNS_QUERY } from '~/server/utils/tarkov-queries';
import { createTarkovFetcher } from '~/server/utils/tarkovFetcher';
const logger = createLogger('TarkovMapSpawns');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `map-spawns-${lang}-${gameMode}`;
  const baseFetcher = createTarkovFetcher(TARKOV_MAP_SPAWNS_QUERY, { lang, gameMode });
  const fetcher = async () => {
    const rawResponse = await baseFetcher();
    validateAndThrow<TarkovMapSpawnsQueryResult>(rawResponse, logger, true);
    return rawResponse;
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, {
    cacheKeyPrefix: 'tarkov',
  });
});
