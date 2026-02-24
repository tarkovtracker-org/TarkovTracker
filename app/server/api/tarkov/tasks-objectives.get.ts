import type { TarkovTaskObjectivesQueryResult } from '~/types/tarkov';
import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { validateAndThrow } from '~/server/utils/graphql-validation';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { TARKOV_TASKS_OBJECTIVES_QUERY } from '~/server/utils/tarkov-queries';
import { createTarkovFetcher } from '~/server/utils/tarkovFetcher';
const logger = createLogger('TarkovTaskObjectives');
const TASK_OBJECTIVES_CACHE_VERSION = 'v2';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `tasks-objectives-${TASK_OBJECTIVES_CACHE_VERSION}-${lang}-${gameMode}`;
  const baseFetcher = createTarkovFetcher(TARKOV_TASKS_OBJECTIVES_QUERY, { lang, gameMode });
  const fetcher = async () => {
    const rawResponse = await baseFetcher();
    validateAndThrow<TarkovTaskObjectivesQueryResult>(rawResponse, logger, true);
    try {
      return await applyOverlay(rawResponse, { bypassCache, gameMode });
    } catch (overlayError) {
      logger.error('Failed to apply overlay:', overlayError);
      throw overlayError;
    }
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, { cacheKeyPrefix: 'tarkov' });
});
