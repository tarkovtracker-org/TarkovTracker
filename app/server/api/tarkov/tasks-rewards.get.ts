import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonTaskRewardsFetcher } from '~/server/utils/tarkov-json';
import { sanitizeTaskRewards } from '~/server/utils/tarkov-sanitization';
const logger = createLogger('TarkovTaskRewards');
const TASK_REWARDS_CACHE_VERSION = 'json-v2';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `tasks-rewards-${TASK_REWARDS_CACHE_VERSION}-${lang}-${gameMode}`;
  const baseFetcher = createTarkovJsonTaskRewardsFetcher({ gameMode, lang });
  const fetcher = async () => {
    try {
      const sanitizedResponse = sanitizeTaskRewards(await baseFetcher());
      return await applyOverlay(sanitizedResponse, { bypassCache, gameMode });
    } catch (error) {
      logger.error('Failed to build tasks rewards response:', error);
      throw error;
    }
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, { cacheKeyPrefix: 'tarkov' });
});
