import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParam,
  setResponseHeader,
  type H3Event,
} from 'h3';
import { createLogger } from '@/server/utils/logger';
import {
  consumeSharedRateLimit,
  createSharedCacheHandle,
  readSharedCache,
  writeSharedCache,
  type SharedCacheHandle,
} from '@/server/utils/sharedEdgeStore';
import { createTarkovFetcher } from '@/server/utils/tarkovFetcher';
import { API_GAME_MODES, GAME_MODES, type GameMode } from '@/utils/constants';
import {
  isRecord,
  sanitizeDisplayName,
  sanitizeFaction,
  sanitizeHideoutModuleMap,
  sanitizeNumberMap,
  sanitizeObjectiveProgressMap,
  sanitizeTaskCompletionMap,
  sanitizeTraderMap,
  toFiniteNumber,
} from '@/utils/progressSanitizers';
const logger = createLogger('SharedProfileApi');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REST_FETCH_TIMEOUT_MS = 8000;
const RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_SHARED_PROFILE_CACHE_TTL_MS = 5000;
const SHARED_PROFILE_CACHE_PREFIX = 'shared-profile';
const SHARED_PROFILE_RATE_LIMIT_PREFIX = 'shared-profile-rate';
const TASK_FAILURE_METADATA_CACHE_TTL_MS = 60 * 60 * 1000;
const TASK_FAILURE_METADATA_QUERY = `
  query SharedProfileTaskFailureMetadata($gameMode: GameMode) {
    tasks(gameMode: $gameMode) {
      id
      failConditions {
        __typename
        ... on TaskObjectiveTaskStatus {
          status
          task {
            id
          }
        }
      }
    }
  }
`;
const isTestEnvironment = process.env.NODE_ENV === 'test';
const isProductionEnvironment = process.env.NODE_ENV === 'production';
type TaskFailureObjective = {
  __typename?: string | null;
  status?: string[] | null;
  task?: { id?: string | null } | null;
};
type TaskFailureMetadataTask = {
  id?: string | null;
  failConditions?: TaskFailureObjective[] | null;
};
type TaskFailureMetadataQueryResult = {
  tasks?: TaskFailureMetadataTask[] | null;
};
type PreferencesRow = {
  streamer_mode?: boolean | null;
  profile_share_pve_public?: boolean | null;
  profile_share_pvp_public?: boolean | null;
};
type ProgressRow = {
  game_edition?: number | null;
  pve_data?: unknown | null;
  pvp_data?: unknown | null;
  user_id: string;
};
type SanitizedTaskCompletion = {
  complete?: boolean;
  failed?: boolean;
  manual?: boolean;
  timestamp?: number;
};
type SanitizedObjectiveProgress = {
  complete?: boolean;
  count?: number;
  timestamp?: number;
};
type SanitizedHideoutModule = {
  complete?: boolean;
  timestamp?: number;
};
type SanitizedTrader = {
  level: number;
  reputation: number;
};
type SanitizedApiTaskUpdate = {
  id: string;
  state: 'completed' | 'failed' | 'uncompleted';
};
type SanitizedApiUpdateMeta = {
  id: string;
  at: number;
  source: 'api';
  tasks?: SanitizedApiTaskUpdate[];
};
type SanitizedProgressData = Partial<{
  displayName: string;
  hideoutModules: Record<string, SanitizedHideoutModule>;
  hideoutParts: Record<string, SanitizedObjectiveProgress>;
  lastApiUpdate: SanitizedApiUpdateMeta;
  level: number;
  pmcFaction: 'BEAR' | 'USEC';
  prestigeLevel: number;
  skillOffsets: Record<string, number>;
  skills: Record<string, number>;
  taskCompletions: Record<string, SanitizedTaskCompletion>;
  taskObjectives: Record<string, SanitizedObjectiveProgress>;
  traders: Record<string, SanitizedTrader>;
  xpOffset: number;
}>;
type SharedProfilePayload = {
  data: SanitizedProgressData | null;
  gameEdition: number;
  mode: GameMode;
  userId: string;
  visibility: 'owner' | 'public';
};
type TaskFailureSourcesMap = Record<string, string[]>;
type TaskFailureSourcesCacheEntry = {
  expiresAt: number;
  value: TaskFailureSourcesMap;
};
const taskFailureSourcesCache: Partial<Record<GameMode, TaskFailureSourcesCacheEntry>> = {};
const taskFailureSourcesPromises: Partial<Record<GameMode, Promise<TaskFailureSourcesMap | null>>> =
  {};
const normalizeMode = (value: string | undefined): GameMode | null => {
  if (value === GAME_MODES.PVE) {
    return GAME_MODES.PVE;
  }
  if (value === GAME_MODES.PVP) {
    return GAME_MODES.PVP;
  }
  return null;
};
const toCleanString = (value: unknown, maxLength = 128): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, maxLength);
};
const sanitizeApiUpdateMeta = (value: unknown): SanitizedApiUpdateMeta | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = toCleanString(value.id, 64);
  const at = toFiniteNumber(value.at);
  if (!id || at === null || value.source !== 'api') {
    return null;
  }
  const sanitized: SanitizedApiUpdateMeta = {
    id,
    at: Math.max(0, Math.trunc(at)),
    source: 'api',
  };
  if (Array.isArray(value.tasks)) {
    const tasks: SanitizedApiTaskUpdate[] = [];
    for (const task of value.tasks) {
      if (!isRecord(task)) {
        continue;
      }
      const taskId = toCleanString(task.id, 128);
      const state = task.state;
      if (!taskId || (state !== 'completed' && state !== 'failed' && state !== 'uncompleted')) {
        continue;
      }
      tasks.push({ id: taskId, state });
    }
    if (tasks.length > 0) {
      sanitized.tasks = tasks;
    }
  }
  return sanitized;
};
const sanitizeProgressPayload = (
  value: unknown,
  options: { includeDisplayName: boolean }
): SanitizedProgressData | null => {
  if (!isRecord(value)) {
    return null;
  }
  const sanitized: SanitizedProgressData = {};
  if (options.includeDisplayName) {
    const displayName = sanitizeDisplayName(value.displayName);
    if (displayName) {
      sanitized.displayName = displayName;
    }
  }
  const level = toFiniteNumber(value.level);
  if (level !== null) {
    sanitized.level = Math.max(1, Math.trunc(level));
  }
  if (value.pmcFaction === 'BEAR' || value.pmcFaction === 'USEC') {
    sanitized.pmcFaction = sanitizeFaction(value.pmcFaction);
  }
  const xpOffset = toFiniteNumber(value.xpOffset);
  if (xpOffset !== null) {
    sanitized.xpOffset = Math.trunc(xpOffset);
  }
  const taskCompletions = sanitizeTaskCompletionMap(value.taskCompletions);
  if (Object.keys(taskCompletions).length > 0) {
    sanitized.taskCompletions = taskCompletions;
  }
  const taskObjectives = sanitizeObjectiveProgressMap(value.taskObjectives);
  if (Object.keys(taskObjectives).length > 0) {
    sanitized.taskObjectives = taskObjectives;
  }
  const hideoutParts = sanitizeObjectiveProgressMap(value.hideoutParts);
  if (Object.keys(hideoutParts).length > 0) {
    sanitized.hideoutParts = hideoutParts;
  }
  const hideoutModules = sanitizeHideoutModuleMap(value.hideoutModules);
  if (Object.keys(hideoutModules).length > 0) {
    sanitized.hideoutModules = hideoutModules;
  }
  const traders = sanitizeTraderMap(value.traders);
  if (Object.keys(traders).length > 0) {
    sanitized.traders = traders;
  }
  const skills = sanitizeNumberMap(value.skills);
  if (Object.keys(skills).length > 0) {
    sanitized.skills = skills;
  }
  const skillOffsets = sanitizeNumberMap(value.skillOffsets);
  if (Object.keys(skillOffsets).length > 0) {
    sanitized.skillOffsets = skillOffsets;
  }
  const prestigeLevel = toFiniteNumber(value.prestigeLevel);
  if (prestigeLevel !== null) {
    sanitized.prestigeLevel = Math.max(0, Math.min(6, Math.trunc(prestigeLevel)));
  }
  const lastApiUpdate = sanitizeApiUpdateMeta(value.lastApiUpdate);
  if (lastApiUpdate) {
    sanitized.lastApiUpdate = lastApiUpdate;
  }
  return sanitized;
};
const normalizeStatusList = (statuses: unknown): string[] => {
  if (!Array.isArray(statuses)) {
    return [];
  }
  return statuses
    .filter((status): status is string => typeof status === 'string')
    .map((status) => status.toLowerCase());
};
const hasCompleteStatus = (statuses: unknown): boolean => {
  const normalizedStatuses = normalizeStatusList(statuses);
  return normalizedStatuses.includes('complete') || normalizedStatuses.includes('completed');
};
const buildTaskFailureSourcesMap = (tasks: TaskFailureMetadataTask[]): TaskFailureSourcesMap => {
  const sourcesByTarget: TaskFailureSourcesMap = {};
  for (const task of tasks) {
    const targetTaskId = toCleanString(task?.id, 128);
    if (!targetTaskId) {
      continue;
    }
    const failConditions = Array.isArray(task?.failConditions) ? task.failConditions : [];
    for (const objective of failConditions) {
      if (objective?.__typename !== 'TaskObjectiveTaskStatus') {
        continue;
      }
      const sourceTaskId = toCleanString(objective.task?.id, 128);
      if (!sourceTaskId || !hasCompleteStatus(objective.status)) {
        continue;
      }
      if (!sourcesByTarget[targetTaskId]) {
        sourcesByTarget[targetTaskId] = [];
      }
      if (!sourcesByTarget[targetTaskId]!.includes(sourceTaskId)) {
        sourcesByTarget[targetTaskId]!.push(sourceTaskId);
      }
    }
  }
  return sourcesByTarget;
};
const getTaskFailureSources = async (mode: GameMode): Promise<TaskFailureSourcesMap | null> => {
  const cached = taskFailureSourcesCache[mode];
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const pending = taskFailureSourcesPromises[mode];
  if (pending) {
    return pending;
  }
  const requestPromise = (async () => {
    try {
      const fetchFailureMetadata = createTarkovFetcher<{ data?: TaskFailureMetadataQueryResult }>(
        TASK_FAILURE_METADATA_QUERY,
        {
          gameMode: API_GAME_MODES[mode],
        }
      );
      const response = await fetchFailureMetadata();
      const tasks = response?.data?.tasks;
      if (!Array.isArray(tasks)) {
        return null;
      }
      const sourcesByTarget = buildTaskFailureSourcesMap(tasks);
      taskFailureSourcesCache[mode] = {
        expiresAt: now + TASK_FAILURE_METADATA_CACHE_TTL_MS,
        value: sourcesByTarget,
      };
      return sourcesByTarget;
    } catch (error) {
      logger.warn('Failed to fetch task failure metadata', {
        error: error instanceof Error ? error.message : String(error),
        mode,
      });
      return null;
    } finally {
      taskFailureSourcesPromises[mode] = undefined;
    }
  })();
  taskFailureSourcesPromises[mode] = requestPromise;
  return requestPromise;
};
const getCompletionTimestamp = (
  completion: SanitizedTaskCompletion | undefined
): number | undefined =>
  typeof completion?.timestamp === 'number' ? completion.timestamp : undefined;
const isTaskSuccessfullyCompleted = (completion: SanitizedTaskCompletion | undefined): boolean =>
  completion?.complete === true && completion?.failed !== true;
const applyDerivedTaskFailures = (
  taskCompletions: Record<string, SanitizedTaskCompletion>,
  failureSourcesByTask: TaskFailureSourcesMap
): { changed: boolean; value: Record<string, SanitizedTaskCompletion> } => {
  let changed = false;
  const mergedTaskCompletions: Record<string, SanitizedTaskCompletion> = Object.fromEntries(
    Object.entries(taskCompletions).map(([taskId, completion]) => [taskId, { ...completion }])
  );
  for (const [targetTaskId, sourceTaskIds] of Object.entries(failureSourcesByTask)) {
    const targetCompletion = mergedTaskCompletions[targetTaskId];
    if (
      targetCompletion?.failed === true ||
      !Array.isArray(sourceTaskIds) ||
      sourceTaskIds.length === 0
    ) {
      continue;
    }
    let triggerTimestamp: number | undefined;
    let shouldFailTarget = false;
    for (const sourceTaskId of sourceTaskIds) {
      const sourceCompletion = mergedTaskCompletions[sourceTaskId];
      if (!isTaskSuccessfullyCompleted(sourceCompletion)) {
        continue;
      }
      if (targetCompletion?.complete === true) {
        const targetTimestamp = getCompletionTimestamp(targetCompletion);
        const sourceTimestamp = getCompletionTimestamp(sourceCompletion);
        if (targetTimestamp === undefined || sourceTimestamp === undefined) {
          continue;
        }
        if (targetTimestamp < sourceTimestamp) {
          continue;
        }
      }
      triggerTimestamp = getCompletionTimestamp(sourceCompletion);
      shouldFailTarget = true;
      break;
    }
    if (!shouldFailTarget) {
      continue;
    }
    const nextCompletion: SanitizedTaskCompletion = {
      ...(targetCompletion ?? {}),
      complete: true,
      failed: true,
    };
    if (nextCompletion.timestamp === undefined && triggerTimestamp !== undefined) {
      nextCompletion.timestamp = triggerTimestamp;
    }
    mergedTaskCompletions[targetTaskId] = nextCompletion;
    changed = true;
  }
  return { changed, value: mergedTaskCompletions };
};
const enrichProgressTaskFailures = async (
  progressData: SanitizedProgressData | null,
  mode: GameMode
): Promise<SanitizedProgressData | null> => {
  if (!progressData?.taskCompletions || Object.keys(progressData.taskCompletions).length === 0) {
    return progressData;
  }
  const failureSourcesByTask = await getTaskFailureSources(mode);
  if (!failureSourcesByTask || Object.keys(failureSourcesByTask).length === 0) {
    return progressData;
  }
  const { changed, value } = applyDerivedTaskFailures(
    progressData.taskCompletions,
    failureSourcesByTask
  );
  if (!changed) {
    return progressData;
  }
  return {
    ...progressData,
    taskCompletions: value,
  };
};
const isAbortError = (error: unknown): boolean => {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError')
  );
};
const toPositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : fallback;
};
const isSharedProfilePayload = (value: unknown): value is SharedProfilePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as SharedProfilePayload;
  return (
    typeof candidate.userId === 'string' &&
    (candidate.mode === GAME_MODES.PVP || candidate.mode === GAME_MODES.PVE) &&
    (candidate.visibility === 'owner' || candidate.visibility === 'public') &&
    typeof candidate.gameEdition === 'number'
  );
};
const consumeRateLimit = async (
  handle: SharedCacheHandle,
  key: string,
  limit: number
): Promise<boolean> => {
  return consumeSharedRateLimit(
    handle,
    SHARED_PROFILE_RATE_LIMIT_PREFIX,
    key,
    limit,
    RATE_LIMIT_WINDOW_MS,
    ({ action, error, key: failedKey }) => {
      logger.warn('Shared profile rate-limit cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
};
const getCachedProfile = async (
  handle: SharedCacheHandle,
  key: string
): Promise<SharedProfilePayload | null> => {
  const payload = await readSharedCache<unknown>(
    handle,
    SHARED_PROFILE_CACHE_PREFIX,
    key,
    ({ action, error, key: failedKey }) => {
      logger.warn('Shared profile cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
  return isSharedProfilePayload(payload) ? payload : null;
};
const setCachedProfile = async (
  handle: SharedCacheHandle,
  key: string,
  payload: SharedProfilePayload,
  ttlMs: number
): Promise<void> => {
  await writeSharedCache(
    handle,
    SHARED_PROFILE_CACHE_PREFIX,
    key,
    payload,
    ttlMs,
    ({ action, error, key: failedKey }) => {
      logger.warn('Shared profile cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
};
const getClientIdentifier = (event: H3Event): string => {
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for');
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    const token = forwardedFor.split(',')[0]?.trim();
    if (token) {
      return token.slice(0, 128);
    }
  }
  const cfConnectingIp = getRequestHeader(event, 'cf-connecting-ip');
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim().length > 0) {
    return cfConnectingIp.trim().slice(0, 128);
  }
  const remoteAddress = event.node?.req?.socket?.remoteAddress;
  if (typeof remoteAddress === 'string' && remoteAddress.trim().length > 0) {
    return remoteAddress.trim().slice(0, 128);
  }
  return 'unknown';
};
const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw createError({ statusCode: 504, statusMessage: timeoutMessage });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
const resolveRequesterUserId = async (
  authHeader: string | undefined,
  supabaseAnonKey: string,
  supabaseUrl: string | null | undefined
): Promise<string | null> => {
  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ') ||
    typeof supabaseUrl !== 'string' ||
    supabaseUrl.trim().length === 0
  ) {
    return null;
  }
  try {
    const authResponse = await fetchWithTimeout(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          Authorization: authHeader,
          apikey: supabaseAnonKey,
        },
      },
      REST_FETCH_TIMEOUT_MS,
      'Timed out while validating shared profile access'
    );
    if (!authResponse.ok) {
      logger.warn('Auth validation returned non-OK status', { status: authResponse.status });
      return null;
    }
    const user = (await authResponse.json()) as { id?: string };
    return typeof user.id === 'string' && UUID_REGEX.test(user.id) ? user.id : null;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      (error as { statusCode?: unknown }).statusCode === 504
    ) {
      throw error;
    }
    logger.warn('Failed to resolve requester auth context', error);
    return null;
  }
};
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  const userId = (getRouterParam(event, 'userId') || '').trim();
  const mode = normalizeMode(getRouterParam(event, 'mode'));
  if (!mode) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile mode' });
  }
  if (!UUID_REGEX.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile id' });
  }
  const config = useRuntimeConfig(event);
  const supabaseUrl = config.supabaseUrl as string;
  const supabaseAnonKey = config.supabaseAnonKey as string;
  const supabaseServiceKey = (config.supabaseServiceKey as string) || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing Supabase configuration for shared profiles',
    });
  }
  const sharedProfileRateLimitPerMinute = toPositiveInteger(
    config.sharedProfileRateLimitPerMinute,
    DEFAULT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE
  );
  const sharedProfileCacheTtlMs = toPositiveInteger(
    config.sharedProfileCacheTtlMs,
    DEFAULT_SHARED_PROFILE_CACHE_TTL_MS
  );
  const sharedCacheHandle = createSharedCacheHandle(
    (config as { public?: { appUrl?: string } }).public?.appUrl
  );
  if (!isTestEnvironment && isProductionEnvironment && !sharedCacheHandle.cache) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Shared profile cache is unavailable in this environment',
    });
  }
  const clientIdentifier = getClientIdentifier(event);
  if (!isTestEnvironment) {
    const preAuthRateLimitKey = `shared-profile:ip:${clientIdentifier}:${userId}:${mode}`;
    if (
      !(await consumeRateLimit(
        sharedCacheHandle,
        preAuthRateLimitKey,
        sharedProfileRateLimitPerMinute
      ))
    ) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests' });
    }
  }
  const authHeader = getRequestHeader(event, 'authorization');
  const requesterUserId = await resolveRequesterUserId(authHeader, supabaseAnonKey, supabaseUrl);
  const requesterKey = requesterUserId ?? clientIdentifier;
  if (!isTestEnvironment) {
    const requesterRateLimitKey = `shared-profile:requester:${requesterKey}:${userId}:${mode}`;
    if (
      !(await consumeRateLimit(
        sharedCacheHandle,
        requesterRateLimitKey,
        sharedProfileRateLimitPerMinute
      ))
    ) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests' });
    }
  }
  const sharedProfileCacheKey = `${userId}:${mode}:${requesterKey}`;
  if (!isTestEnvironment) {
    const cached = await getCachedProfile(sharedCacheHandle, sharedProfileCacheKey);
    if (cached) {
      return cached;
    }
  }
  const hasServiceKey = supabaseServiceKey.length > 0;
  if (!hasServiceKey && requesterUserId !== userId) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Shared profiles unavailable on this environment',
    });
  }
  const restApiKey = hasServiceKey ? supabaseServiceKey : supabaseAnonKey;
  const restAuthorization = hasServiceKey ? `Bearer ${supabaseServiceKey}` : authHeader;
  if (!restAuthorization) {
    throw createError({ statusCode: 401, statusMessage: 'Missing auth token' });
  }
  const restFetch = async (path: string, signal?: AbortSignal) => {
    const url = `${supabaseUrl}/rest/v1/${path}`;
    return fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: restAuthorization,
        'Content-Type': 'application/json',
        apikey: restApiKey,
      },
      signal,
    });
  };
  const progressController = new AbortController();
  const preferencesController = new AbortController();
  const progressTimeout = setTimeout(() => {
    progressController.abort();
  }, REST_FETCH_TIMEOUT_MS);
  const preferencesTimeout = setTimeout(() => {
    preferencesController.abort();
  }, REST_FETCH_TIMEOUT_MS);
  let progressResponse: Response;
  let preferencesResponse: Response;
  try {
    [progressResponse, preferencesResponse] = await Promise.all([
      restFetch(
        `user_progress?select=user_id,game_edition,pvp_data,pve_data&user_id=eq.${userId}&limit=1`,
        progressController.signal
      ),
      restFetch(
        `user_preferences?select=profile_share_pvp_public,profile_share_pve_public,streamer_mode&user_id=eq.${userId}&limit=1`,
        preferencesController.signal
      ),
    ]);
  } catch (error) {
    progressController.abort();
    preferencesController.abort();
    if (isAbortError(error)) {
      throw createError({
        statusCode: 504,
        statusMessage: 'Timed out while loading shared profile data',
      });
    }
    logger.error('Failed to load shared profile resources', { error, userId });
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to load shared profile data',
    });
  } finally {
    clearTimeout(progressTimeout);
    clearTimeout(preferencesTimeout);
  }
  if (!progressResponse.ok) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load profile data' });
  }
  const progressRows = (await progressResponse.json()) as ProgressRow[];
  const progressRow = progressRows[0];
  if (!progressRow) {
    throw createError({ statusCode: 404, statusMessage: 'Profile not found' });
  }
  let preferencesRow: PreferencesRow | null = null;
  if (preferencesResponse.ok) {
    const preferenceRows = (await preferencesResponse.json()) as PreferencesRow[];
    preferencesRow = preferenceRows[0] ?? null;
  } else {
    logger.warn('Failed to load profile sharing preferences', {
      status: preferencesResponse.status,
      userId,
    });
  }
  const isOwner = requesterUserId === userId;
  const isModePublic =
    mode === GAME_MODES.PVE
      ? preferencesRow?.profile_share_pve_public === true
      : preferencesRow?.profile_share_pvp_public === true;
  if (!isOwner && !isModePublic) {
    throw createError({ statusCode: 403, statusMessage: 'Profile is private for this mode' });
  }
  const profileData =
    mode === GAME_MODES.PVE ? (progressRow.pve_data ?? null) : (progressRow.pvp_data ?? null);
  const hideDisplayName = !isOwner && preferencesRow?.streamer_mode === true;
  const sanitizedData = sanitizeProgressPayload(profileData, {
    includeDisplayName: !hideDisplayName,
  });
  const payload: SharedProfilePayload = {
    data: await enrichProgressTaskFailures(sanitizedData, mode),
    gameEdition: typeof progressRow.game_edition === 'number' ? progressRow.game_edition : 1,
    mode,
    userId,
    visibility: isOwner ? 'owner' : 'public',
  };
  if (!isTestEnvironment) {
    await setCachedProfile(
      sharedCacheHandle,
      sharedProfileCacheKey,
      payload,
      sharedProfileCacheTtlMs
    );
  }
  return payload;
});
