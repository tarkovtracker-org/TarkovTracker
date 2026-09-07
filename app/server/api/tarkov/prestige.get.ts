import { scheduleBackgroundTask } from '~/server/utils/backgroundTask';
import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { fetchOverlay } from '~/server/utils/overlay';
import { projectRawPrestige } from '~/server/utils/overlayProjectors';
import { setOverlayResponseHeaders } from '~/server/utils/overlayResponseHeaders';
import { CACHE_TTL_EXTENDED, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { createTarkovJsonPrestigeFetcher } from '~/server/utils/tarkov-json';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const fetcher = async () => {
    const { overlay, meta } = await fetchOverlay(shouldBypassCache(event), (task) =>
      scheduleBackgroundTask(event, task)
    );
    if (!overlay)
      throw createError({ statusCode: 503, statusMessage: 'Prestige corrections unavailable' });
    const baseFetcher = createTarkovJsonPrestigeFetcher({
      lang,
      gameMode,
      project: (payload) => projectRawPrestige(payload, overlay, gameMode, lang),
    });
    return { ...(await baseFetcher()), dataOverlay: meta };
  };
  const response = await edgeCache(
    event,
    `prestige-json-v3-${lang}-${gameMode}`,
    fetcher,
    CACHE_TTL_EXTENDED,
    { cacheKeyPrefix: 'tarkov' }
  );
  setOverlayResponseHeaders(event, response);
  return response;
});
