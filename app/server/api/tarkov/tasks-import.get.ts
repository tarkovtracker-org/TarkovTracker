import { createError } from 'h3';
import { createLogger } from '~/server/utils/logger';
import { setOverlayResponseHeaders } from '~/server/utils/overlayResponseHeaders';
import { getPrecomputedStore } from '~/server/utils/precomputedTarkov';
import { validateGameMode } from '~/server/utils/tarkov-cache-config';
import { buildTaskImportKey, isTaskImportSnapshot } from '~/server/utils/taskImportSnapshot';
const logger = createLogger('TarkovTasksImport');
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store');
  const gameMode = validateGameMode(getQuery(event).gameMode);
  const key = buildTaskImportKey(gameMode);
  const store = getPrecomputedStore(event);
  let snapshot: unknown;
  try {
    snapshot = await store?.get(key, 'json');
  } catch (error) {
    logger.warn(`Import snapshot read failed for ${key}`, error);
  }
  if (!isTaskImportSnapshot(snapshot, gameMode)) {
    throw createError({ statusCode: 503, statusMessage: 'Task import snapshot unavailable' });
  }
  setHeader(event, 'X-Cache-Status', 'PRECOMPUTE');
  setOverlayResponseHeaders(event, snapshot.payload);
  return snapshot.payload;
});
