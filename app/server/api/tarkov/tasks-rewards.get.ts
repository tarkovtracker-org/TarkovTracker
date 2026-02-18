import type { TarkovTaskRewardsQueryResult } from '~/types/tarkov';
import { createTarkovFetcher, edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { validateAndThrow } from '~/server/utils/graphql-validation';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { TARKOV_TASKS_REWARDS_QUERY } from '~/server/utils/tarkov-queries';
import { sanitizeTaskRewards } from '~/server/utils/tarkov-sanitization';
const logger = createLogger('TarkovTaskRewards');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `tasks-rewards-${lang}-${gameMode}`;
  const baseFetcher = createTarkovFetcher(TARKOV_TASKS_REWARDS_QUERY, { lang, gameMode });
  const fetcher = async () => {
    const rawResponse = await baseFetcher();
    validateAndThrow<TarkovTaskRewardsQueryResult>(rawResponse, logger, true);
    const sanitizedResponse = sanitizeTaskRewards(rawResponse);
    try {
      return await applyOverlay(sanitizedResponse, { bypassCache, gameMode });
    } catch (overlayError) {
      logger.error('Failed to apply overlay:', overlayError);
      throw overlayError;
    }
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, { cacheKeyPrefix: 'tarkov' });
});
