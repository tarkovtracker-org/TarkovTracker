import type { TarkovTaskObjectivesQueryResult } from '~/types/tarkov';
import { createTarkovFetcher, edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { GraphQLResponseError, validateGraphQLResponse } from '~/server/utils/graphql-validation';
import { createLogger } from '~/server/utils/logger';
import { applyOverlay } from '~/server/utils/overlay';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { TARKOV_TASKS_OBJECTIVES_QUERY } from '~/server/utils/tarkov-queries';
import { API_SUPPORTED_LANGUAGES } from '~/utils/constants';
const logger = createLogger('TarkovTaskObjectives');
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const bypassCache = shouldBypassCache(event);
  // Validate and sanitize inputs
  let lang = (query.lang as string)?.toLowerCase() || 'en';
  const gameMode = validateGameMode(query.gameMode as string);
  // Ensure valid language (fallback to English if unsupported)
  if (!API_SUPPORTED_LANGUAGES.includes(lang as (typeof API_SUPPORTED_LANGUAGES)[number])) {
    lang = 'en';
  }
  const cacheKey = `tasks-objectives-${lang}-${gameMode}`;
  const baseFetcher = createTarkovFetcher(TARKOV_TASKS_OBJECTIVES_QUERY, { lang, gameMode });
  const fetcher = async () => {
    const rawResponse = await baseFetcher();
    try {
      validateGraphQLResponse<TarkovTaskObjectivesQueryResult>(
        rawResponse,
        logger,
        /* allowPartialData */ true
      );
    } catch (error) {
      if (error instanceof GraphQLResponseError) {
        logger.error('GraphQL validation failed:', error.message);
        if (error.errors) {
          logger.error('GraphQL errors detail:', JSON.stringify(error.errors, null, 2));
        }
      }
      throw error;
    }
    try {
      return await applyOverlay(rawResponse, { bypassCache });
    } catch (overlayError) {
      logger.error('Failed to apply overlay:', overlayError);
      throw overlayError;
    }
  };
  return await edgeCache(event, cacheKey, fetcher, CACHE_TTL_DEFAULT, { cacheKeyPrefix: 'tarkov' });
});
