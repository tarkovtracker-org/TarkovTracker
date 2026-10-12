import { createError } from 'h3';
import { TASK_OBJECTIVES_CACHE_VERSION } from '@/utils/taskCatalogCache';
import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { precomputedOverlayIdentity } from '~/server/utils/precomputedTarkov';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonTaskObjectivesFetcher } from '~/server/utils/tarkov-json';
const logger = createLogger('TarkovTaskObjectives');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const cacheKey = `tasks-objectives-${TASK_OBJECTIVES_CACHE_VERSION}-${lang}-${gameMode}`;
  const baseFetcher = createTarkovJsonTaskObjectivesFetcher({ gameMode, lang });
  const fetcher = async () => {
    let baseResponse: Awaited<ReturnType<typeof baseFetcher>>;
    try {
      baseResponse = await baseFetcher();
    } catch (error) {
      logger.error('Failed to fetch task objectives data:', error);
      throw error;
    }
    const corrected = await applyOverlay(baseResponse, { bypassCache, gameMode, locale: lang });
    // A cold private-overlay failure must not become a successful 12-hour catalog entry.
    // Throwing also preserves a good stale entry during edgeCache's background refresh.
    if (!precomputedOverlayIdentity(corrected)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Task objective metadata unavailable',
      });
    }
    return corrected;
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, { cacheKeyPrefix: 'tarkov' });
});
