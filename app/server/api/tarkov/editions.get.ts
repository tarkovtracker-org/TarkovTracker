import { edgeCache, shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { fetchOverlay } from '~/server/utils/overlay';
import { projectEditions, projectStoryChapters } from '~/server/utils/overlayProjectors';
import { setOverlayResponseHeaders } from '~/server/utils/overlayResponseHeaders';
import { adaptSeasonalPerks, projectSeasonalPerks } from '~/server/utils/seasonalPerks';
import { CACHE_TTL_DEFAULT, validateGameMode } from '~/server/utils/tarkov-cache-config';
import { fetchTarkovJsonEndpoint } from '~/server/utils/tarkov-json';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const { overlay, meta } = await fetchOverlay(shouldBypassCache(event));
  if (!overlay)
    throw createError({ statusCode: 503, statusMessage: 'Progression metadata unavailable' });
  const perks =
    gameMode === 'pvp-season'
      ? await edgeCache(
          event,
          `seasonal-perks-json-v1-${lang}-${gameMode}`,
          async () =>
            adaptSeasonalPerks(await fetchTarkovJsonEndpoint('season', { lang, gameMode })),
          CACHE_TTL_DEFAULT,
          { cacheKeyPrefix: 'tarkov' }
        )
      : [];
  const response = {
    data: {
      editions: projectEditions(overlay, gameMode),
      storyChapters: projectStoryChapters(overlay, gameMode, lang),
      seasonalPerks: projectSeasonalPerks(overlay, gameMode, perks),
    },
    dataOverlay: meta,
  };
  setOverlayResponseHeaders(event, response);
  return response;
});
