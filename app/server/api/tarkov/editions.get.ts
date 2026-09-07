import { scheduleBackgroundTask } from '~/server/utils/backgroundTask';
import { shouldBypassCache } from '~/server/utils/edgeCache';
import { getValidatedLanguage } from '~/server/utils/language-helpers';
import { fetchOverlay } from '~/server/utils/overlay';
import {
  projectEditions,
  projectSeasonalPerks,
  projectStoryChapters,
} from '~/server/utils/overlayProjectors';
import { setOverlayResponseHeaders } from '~/server/utils/overlayResponseHeaders';
import { validateGameMode } from '~/server/utils/tarkov-cache-config';
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lang = getValidatedLanguage(query);
  const gameMode = validateGameMode(query.gameMode);
  const { overlay, meta } = await fetchOverlay(shouldBypassCache(event), (task) =>
    scheduleBackgroundTask(event, task)
  );
  if (!overlay)
    throw createError({ statusCode: 503, statusMessage: 'Progression metadata unavailable' });
  const response = {
    data: {
      editions: projectEditions(overlay, gameMode),
      storyChapters: projectStoryChapters(overlay, gameMode, lang),
      seasonalPerks: projectSeasonalPerks(overlay, gameMode),
    },
    dataOverlay: meta,
  };
  setOverlayResponseHeaders(event, response);
  return response;
});
