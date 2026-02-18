import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParam,
  setResponseHeader,
  type H3Event,
} from 'h3';
import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { createLogger } from '@/server/utils/logger';
import { computeStreamerKappaMetrics } from '@/server/utils/streamerKappa';
import { API_GAME_MODES, GAME_MODES, type GameMode } from '@/utils/constants';
import type {
  GameEdition,
  TarkovTaskObjectivesQueryResult,
  TarkovTasksCoreQueryResult,
  Task,
} from '@/types/tarkov';
import type { RawTaskCompletion } from '@/utils/taskStatus';
const logger = createLogger('StreamerKappaApi');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITIONS_CACHE_TTL_MS = 60 * 60 * 1000;
const EDITIONS_SHARED_CACHE_PREFIX = 'streamer-kappa-editions';
const EDITIONS_CACHE_KEY = 'overlay-editions';
const OVERLAY_URL =
  'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json';
let cachedEditions: GameEdition[] = [];
let cachedEditionsAt = 0;
let editionsFetchPromise: Promise<GameEdition[]> | null = null;
type TaskObjectiveProgress = {
  complete?: boolean;
  count?: number;
};
type EditionsCachePayload = {
  editions: GameEdition[];
  timestamp: number;
};
type SharedProfileResponse = {
  data: unknown;
  gameEdition: number | null;
  mode: GameMode;
  userId: string;
  visibility: 'owner' | 'public';
};
type SharedProgressData = {
  displayName: string | null;
  pmcFaction: 'BEAR' | 'USEC';
  taskCompletions: Record<string, RawTaskCompletion>;
  taskObjectives: Record<string, TaskObjectiveProgress>;
};
const normalizeMode = (value: string | undefined): GameMode | null => {
  if (value === GAME_MODES.PVE) {
    return GAME_MODES.PVE;
  }
  if (value === GAME_MODES.PVP) {
    return GAME_MODES.PVP;
  }
  return null;
};
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const normalizeSharedProgressData = (value: unknown): SharedProgressData => {
  if (!isRecord(value)) {
    logger.warn('Shared profile data is not a valid record, returning defaults', {
      valueType: typeof value,
      isNull: value === null,
    });
    return {
      displayName: null,
      pmcFaction: 'USEC',
      taskCompletions: {},
      taskObjectives: {},
    };
  }
  return {
    displayName:
      typeof value.displayName === 'string' && value.displayName.trim().length > 0
        ? value.displayName
        : null,
    pmcFaction: value.pmcFaction === 'BEAR' ? 'BEAR' : 'USEC',
    taskCompletions: isRecord(value.taskCompletions)
      ? (value.taskCompletions as Record<string, RawTaskCompletion>)
      : {},
    taskObjectives: isRecord(value.taskObjectives)
      ? (value.taskObjectives as Record<string, TaskObjectiveProgress>)
      : {},
  };
};
const resolveStatusCode = (error: unknown): number => {
  const statusCode =
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status ??
    (error as { response?: { status?: number } }).response?.status;
  return typeof statusCode === 'number' ? statusCode : 500;
};
const resolveStatusMessage = (error: unknown): string => {
  const statusMessage =
    (error as { statusMessage?: string }).statusMessage ??
    (error as { statusText?: string }).statusText ??
    (error as { data?: { statusMessage?: string } }).data?.statusMessage ??
    '';
  return typeof statusMessage === 'string' ? statusMessage : '';
};
const buildSharedProfileRequestHeaders = (event: H3Event): Record<string, string> | undefined => {
  const headerNames = [
    'authorization',
    'cf-connecting-ip',
    'host',
    'x-forwarded-for',
    'x-real-ip',
  ] as const;
  const headers: Record<string, string> = {};
  for (const headerName of headerNames) {
    const headerValue = getRequestHeader(event, headerName);
    if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
      headers[headerName] = headerValue;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
};
const isFreshTimestamp = (timestamp: number): boolean => {
  return Date.now() - timestamp < EDITIONS_CACHE_TTL_MS;
};
const getSharedCache = (): Cache | null => {
  const cacheStorage = (
    globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }
  ).caches;
  return cacheStorage?.default ?? null;
};
const getSharedCacheOrigin = (): { host: string; protocol: string } => {
  const runtimeConfig = useRuntimeConfig();
  const appUrl = runtimeConfig?.public?.appUrl;
  if (!appUrl) {
    return { host: 'tarkovtracker.org', protocol: 'https:' };
  }
  try {
    const parsedAppUrl = new URL(appUrl);
    const hostname = parsedAppUrl.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^127\./.test(hostname);
    if (isLocalhost) {
      return { host: 'tarkovtracker.org', protocol: 'https:' };
    }
    return { host: parsedAppUrl.host, protocol: parsedAppUrl.protocol || 'https:' };
  } catch {
    return { host: 'tarkovtracker.org', protocol: 'https:' };
  }
};
const buildSharedEditionsCacheRequest = (): Request => {
  const { host, protocol } = getSharedCacheOrigin();
  const cacheUrl = new URL(
    `${protocol}//${host}/__edge-cache/${EDITIONS_SHARED_CACHE_PREFIX}/${EDITIONS_CACHE_KEY}`
  );
  return new Request(cacheUrl.toString());
};
const readSharedEditionsCache = async (
  options: { allowStale?: boolean } = {}
): Promise<EditionsCachePayload | null> => {
  const cache = getSharedCache();
  if (!cache) {
    return null;
  }
  try {
    const response = await cache.match(buildSharedEditionsCacheRequest());
    if (!response) {
      return null;
    }
    const payload = (await response.json()) as EditionsCachePayload | null;
    if (!payload || !Array.isArray(payload.editions) || typeof payload.timestamp !== 'number') {
      return null;
    }
    if (!options.allowStale && !isFreshTimestamp(payload.timestamp)) {
      return null;
    }
    return payload;
  } catch (error) {
    logger.warn('Failed to read shared editions cache', error);
    return null;
  }
};
const writeSharedEditionsCache = async (entry: EditionsCachePayload): Promise<void> => {
  const cache = getSharedCache();
  if (!cache) {
    return;
  }
  const ttlSeconds = Math.max(1, Math.floor(EDITIONS_CACHE_TTL_MS / 1000));
  try {
    const response = new Response(JSON.stringify(entry), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
      },
    });
    await cache.put(buildSharedEditionsCacheRequest(), response);
  } catch (error) {
    logger.warn('Failed to write shared editions cache', error);
  }
};
const readInMemoryEditionsCache = (
  options: { allowStale?: boolean } = {}
): EditionsCachePayload | null => {
  if (cachedEditions.length === 0 || cachedEditionsAt <= 0) {
    return null;
  }
  if (!options.allowStale && !isFreshTimestamp(cachedEditionsAt)) {
    return null;
  }
  return { editions: cachedEditions, timestamp: cachedEditionsAt };
};
const updateInMemoryEditionsCache = (entry: EditionsCachePayload): void => {
  cachedEditions = entry.editions;
  cachedEditionsAt = entry.timestamp;
};
const getEditions = async (): Promise<GameEdition[]> => {
  const localCached = readInMemoryEditionsCache();
  if (localCached) {
    return localCached.editions;
  }
  const sharedCached = await readSharedEditionsCache();
  if (sharedCached) {
    updateInMemoryEditionsCache(sharedCached);
    return sharedCached.editions;
  }
  if (editionsFetchPromise) {
    return editionsFetchPromise;
  }
  editionsFetchPromise = (async () => {
    try {
      const overlay = await $fetch<{ editions?: Record<string, GameEdition> }>(OVERLAY_URL);
      const editions = overlay?.editions ? Object.values(overlay.editions) : [];
      if (editions.length > 0) {
        const entry: EditionsCachePayload = {
          editions,
          timestamp: Date.now(),
        };
        updateInMemoryEditionsCache(entry);
        await writeSharedEditionsCache(entry);
        return editions;
      }
      logger.warn('Editions overlay returned no editions; using cached fallback');
    } catch (error) {
      logger.warn('Failed to fetch editions overlay for streamer metrics', error);
    }
    const staleSharedCached = await readSharedEditionsCache({ allowStale: true });
    if (staleSharedCached) {
      updateInMemoryEditionsCache(staleSharedCached);
      return staleSharedCached.editions;
    }
    const staleLocalCached = readInMemoryEditionsCache({ allowStale: true });
    if (staleLocalCached) {
      return staleLocalCached.editions;
    }
    return [];
  })().finally(() => {
    editionsFetchPromise = null;
  });
  return editionsFetchPromise;
};
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  const forwardedHeaders = buildSharedProfileRequestHeaders(event);
  const userId = (getRouterParam(event, 'userId') || '').trim();
  const mode = normalizeMode(getRouterParam(event, 'mode'));
  if (!mode) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile mode' });
  }
  if (!UUID_REGEX.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile id' });
  }
  let sharedProfile: SharedProfileResponse;
  try {
    sharedProfile = await $fetch<SharedProfileResponse>(`/api/profile/${userId}/${mode}`, {
      headers: forwardedHeaders,
    });
  } catch (error) {
    const statusCode = resolveStatusCode(error);
    const statusMessage = resolveStatusMessage(error);
    const isPrivateProfileError =
      statusCode === 403 && statusMessage === 'Profile is private for this mode';
    const mappedStatusCode = statusCode === 403 && !isPrivateProfileError ? 503 : statusCode;
    throw createError({
      statusCode: mappedStatusCode,
      statusMessage: isPrivateProfileError
        ? 'Profile is private for this mode'
        : mappedStatusCode === 404
          ? 'Profile not found'
          : mappedStatusCode === 503
            ? 'Shared profiles unavailable'
            : 'Failed to load shared profile',
    });
  }
  const profileData = normalizeSharedProgressData(sharedProfile.data);
  const gameMode = API_GAME_MODES[mode];
  try {
    const [tasksCoreResponse, tasksObjectivesResponse, editions] = await Promise.all([
      $fetch<{ data: TarkovTasksCoreQueryResult }>('/api/tarkov/tasks-core', {
        headers: forwardedHeaders,
        query: { gameMode, lang: 'en' },
      }),
      $fetch<{ data: TarkovTaskObjectivesQueryResult }>('/api/tarkov/tasks-objectives', {
        headers: forwardedHeaders,
        query: { gameMode, lang: 'en' },
      }),
      getEditions(),
    ]);
    const tasksCore = tasksCoreResponse.data;
    const tasksObjectives = tasksObjectivesResponse.data;
    const objectivesByTaskId = new Map(
      (tasksObjectives.tasks ?? []).map((task) => [task.id, task] as const)
    );
    const mergedTasks: Task[] = (tasksCore.tasks ?? []).map((task) => {
      const objectiveTask = objectivesByTaskId.get(task.id);
      return {
        ...task,
        failConditions: objectiveTask?.failConditions,
        objectives: objectiveTask?.objectives,
      };
    });
    const { processTaskData } = useGraphBuilder();
    const processedTaskData = processTaskData(mergedTasks);
    const metrics = computeStreamerKappaMetrics({
      editions,
      gameEdition: typeof sharedProfile.gameEdition === 'number' ? sharedProfile.gameEdition : 1,
      neededItemTaskObjectives: processedTaskData.neededItemTaskObjectives,
      pmcFaction: profileData.pmcFaction,
      taskCompletions: profileData.taskCompletions,
      taskObjectives: profileData.taskObjectives,
      tasks: processedTaskData.tasks,
    });
    return {
      displayName: profileData.displayName,
      generatedAt: Date.now(),
      items: metrics.items,
      mode,
      tasks: metrics.tasks,
      userId,
      visibility: sharedProfile.visibility,
    };
  } catch (error) {
    logger.error('Failed to compute streamer metrics', {
      error,
      mode,
      userId,
    });
    throw createError({ statusCode: 500, statusMessage: 'Failed to compute streamer metrics' });
  }
});
