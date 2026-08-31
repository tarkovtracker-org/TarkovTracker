import {
  extractUserMetadataDisplayName,
  extractUserMetadataUsername,
} from '../../../../app/utils/userMetadata';
import {
  getLegacyModeProgressField,
  hasMaterializedProgress,
  resolveModeProgressData,
  type LegacyModeProgressRow,
} from '../../../../app/utils/modeProgressFallback';
import { getTasks, getHideoutStations } from '../services/tarkov';
import { logger } from '../utils/logger';
import { getGameModeSeasonNumber } from '../utils/gameMode';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import { extractGameModeData, transformProgress } from '../utils/transform';
import type {
  Env,
  ApiToken,
  UserProgressModeRow,
  ProgressResponse,
  TaskState,
  BatchTaskUpdate,
  TaskCompletion,
  TarkovTask,
  ApiTaskUpdate,
  ApiUpdateMeta,
  GameMode,
  ProgressDataField,
  TarkovTaskRequirement,
} from '../types';
const DISPLAY_NAME_CACHE_TTL_SECONDS = 86400;
interface ProgressMergePayload {
  taskCompletions?: Record<string, TaskCompletion>;
  taskObjectives?: Record<string, Record<string, unknown>>;
  set?: Record<string, unknown>;
}
function snapshotCompletions(taskCompletions: Record<string, TaskCompletion>): Map<string, string> {
  return new Map(Object.entries(taskCompletions).map(([id, value]) => [id, JSON.stringify(value)]));
}
function diffCompletions(
  taskCompletions: Record<string, TaskCompletion>,
  before: Map<string, string>
): Record<string, TaskCompletion> {
  const changed: Record<string, TaskCompletion> = {};
  for (const [id, value] of Object.entries(taskCompletions)) {
    if (before.get(id) !== JSON.stringify(value)) {
      changed[id] = value;
    }
  }
  return changed;
}
/**
 * Persist a partial progress update atomically via the merge_progress_data
 * RPC. Only the supplied keys are merged server-side, so concurrent writers
 * cannot overwrite each other's unrelated changes, and a write against a
 * missing progress row fails loudly instead of silently updating nothing.
 */
async function mergeProgressData(
  env: Env,
  token: ApiToken,
  dataField: ProgressDataField,
  payload: ProgressMergePayload,
  logContext: { action: string; taskIds?: string[] }
): Promise<void> {
  const startedAt = Date.now();
  const body = JSON.stringify({
    p_user_id: token.user_id,
    p_field: dataField,
    p_task_completions: payload.taskCompletions ?? null,
    p_task_objectives: payload.taskObjectives ?? null,
    p_set: payload.set ?? null,
  });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/merge_progress_data`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body,
  });
  const logEntry = {
    action: logContext.action,
    userId: token.user_id,
    tokenId: token.token_id,
    taskIds: logContext.taskIds,
    payloadBytes: body.length,
    status: res.status,
    durationMs: Date.now() - startedAt,
  };
  if (!res.ok) {
    logger.error('progress write failed', logEntry);
    throw new Error(`Failed to save progress update (HTTP ${res.status})`);
  }
  const updatedRows = Number(await res.text());
  if (!Number.isFinite(updatedRows) || updatedRows < 1) {
    logger.error('progress write matched no row', logEntry);
    throw new Error('Progress row not found for user');
  }
  logger.info('progress write', logEntry);
}
const getProgressDataField = (gameMode: GameMode): ProgressDataField => {
  if (gameMode === 'pve') return 'pve_data';
  if (gameMode === 'seasonal') return 'seasonal_data';
  return 'pvp_data';
};
const getServiceHeaders = (env: Env) => ({
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
});
async function fetchUserProgressMode(
  env: Env,
  userId: string,
  gameMode: GameMode
): Promise<UserProgressModeRow | null> {
  const seasonNumber = await getGameModeSeasonNumber(env, gameMode);
  const legacyProgressField = getLegacyModeProgressField(gameMode);
  const metadataSelect = ['user_id', 'game_edition', legacyProgressField].filter(Boolean).join(',');
  const modeUrl = `${env.SUPABASE_URL}/rest/v1/user_game_mode_progress?user_id=eq.${userId}&game_mode=eq.${gameMode}&season_number=eq.${seasonNumber}&select=user_id,progress_data&limit=1`;
  const metadataUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${userId}&select=${metadataSelect}&limit=1`;
  const [modeResponse, metadataResponse] = await Promise.all([
    fetch(modeUrl, { headers: getServiceHeaders(env) }),
    fetch(metadataUrl, { headers: getServiceHeaders(env) }),
  ]);
  if (!modeResponse.ok || !metadataResponse.ok) {
    throw new Error('Failed to fetch user progress');
  }
  const modeRows = (await modeResponse.json()) as Array<{
    progress_data: UserProgressModeRow['progress_data'];
    user_id: string;
  }>;
  const metadataRows = (await metadataResponse.json()) as Array<{
    game_edition: number | null;
    pve_data: UserProgressModeRow['progress_data'];
    pvp_data: UserProgressModeRow['progress_data'];
    user_id: string;
  }>;
  const modeRow = modeRows[0];
  const metadataRow = metadataRows[0];
  return {
    user_id: modeRow?.user_id ?? userId,
    game_edition: metadataRow?.game_edition ?? 1,
    progress_data: resolveModeProgressData(gameMode, modeRow?.progress_data, metadataRow),
  };
}
const asProgressRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
type LegacyProgressRecordRow = LegacyModeProgressRow<Record<string, unknown> | null>;
async function fetchLegacyProgressRow(
  env: Env,
  userId: string,
  gameMode: GameMode
): Promise<LegacyProgressRecordRow | null> {
  const legacyProgressField = getLegacyModeProgressField(gameMode);
  if (!legacyProgressField) return null;
  const legacyUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${userId}&select=${legacyProgressField}&limit=1`;
  const legacyResponse = await fetch(legacyUrl, { headers: getServiceHeaders(env) });
  if (!legacyResponse.ok) throw new Error('Failed to fetch user progress');
  const legacyRows = (await legacyResponse.json()) as LegacyProgressRecordRow[];
  return legacyRows[0] ?? null;
}
async function fetchCurrentProgressData(
  env: Env,
  userId: string,
  gameMode: GameMode
): Promise<Record<string, unknown>> {
  const seasonNumber = await getGameModeSeasonNumber(env, gameMode);
  const modeUrl = `${env.SUPABASE_URL}/rest/v1/user_game_mode_progress?user_id=eq.${userId}&game_mode=eq.${gameMode}&season_number=eq.${seasonNumber}&select=progress_data&limit=1`;
  const modeResponse = await fetch(modeUrl, { headers: getServiceHeaders(env) });
  if (!modeResponse.ok) throw new Error('Failed to fetch user progress');
  const modeRows = (await modeResponse.json()) as Array<{
    progress_data: Record<string, unknown> | null;
  }>;
  const modeProgress = modeRows[0]?.progress_data ?? null;
  if (hasMaterializedProgress(modeProgress)) return asProgressRecord(modeProgress);
  const legacyRow = await fetchLegacyProgressRow(env, userId, gameMode);
  return asProgressRecord(resolveModeProgressData(gameMode, modeProgress, legacyRow));
}
async function getUserDisplayName(env: Env, userId: string): Promise<string | null> {
  const cacheKey = `user-display:${userId}`;
  const cached = getMemoryCache<string>(cacheKey);
  if (cached) return cached;
  try {
    const url = `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
      app_metadata?: Record<string, unknown> | null;
    };
    const userMetadata =
      data.user_metadata && typeof data.user_metadata === 'object' ? data.user_metadata : {};
    const appMetadata =
      data.app_metadata && typeof data.app_metadata === 'object' ? data.app_metadata : {};
    const provider = typeof appMetadata.provider === 'string' ? appMetadata.provider : null;
    const email = typeof data.email === 'string' ? data.email : null;
    const username = extractUserMetadataUsername(userMetadata, email, provider);
    const displayName = extractUserMetadataDisplayName(userMetadata, provider, username);
    const resolved = displayName || username || (email ? email.split('@')[0] : null);
    if (resolved) {
      setMemoryCache(cacheKey, resolved, DISPLAY_NAME_CACHE_TTL_SECONDS);
    }
    return resolved;
  } catch (error) {
    logger.error('[getUserDisplayName] Failed to resolve display name:', error);
    return null;
  }
}
const toTaskState = (complete: boolean, failed: boolean, active?: boolean): TaskState => {
  if (failed) return 'failed';
  if (complete) return 'completed';
  if (active === true) return 'active';
  return 'uncompleted';
};
const buildApiUpdateMeta = (updates: ApiTaskUpdate[], timestamp: number): ApiUpdateMeta => {
  return {
    id: crypto.randomUUID(),
    at: timestamp,
    source: 'api',
    tasks: updates,
  };
};
const setTaskCompletion = (
  taskCompletions: Record<string, TaskCompletion>,
  taskId: string,
  complete: boolean,
  failed: boolean,
  active: boolean,
  timestamp: number,
  updates?: Map<string, TaskState>
): void => {
  const previous = taskCompletions[taskId];
  const prevState = toTaskState(
    previous?.complete === true,
    previous?.failed === true,
    previous?.active
  );
  const nextState = toTaskState(complete, failed, active);
  taskCompletions[taskId] = { complete, failed, active, timestamp };
  if (updates && prevState !== nextState) {
    updates.set(taskId, nextState);
  }
};
const checkAllRequirementsMet = (
  dependentTask: TarkovTask,
  changedTaskId: string,
  newState: TaskState,
  taskCompletions: Record<string, TaskCompletion>
): boolean => {
  const requirements = dependentTask.taskRequirements ?? [];
  return requirements.every((requirement) => {
    if (!requirement?.task?.id) return true;
    const reqTaskId = requirement.task.id;
    const requirementStatus = requirement.status ?? [];
    if (reqTaskId === changedTaskId) {
      if (requirementStatus.includes('complete') && newState === 'completed') return true;
      if (requirementStatus.includes('failed') && newState === 'failed') return true;
      if (
        requirementStatus.includes('active') &&
        (newState === 'active' || newState === 'completed')
      ) {
        return true;
      }
      return false;
    }
    const otherTaskData = taskCompletions[reqTaskId];
    if (
      requirementStatus.includes('complete') &&
      otherTaskData?.complete &&
      !otherTaskData?.failed
    ) {
      return true;
    }
    if (
      requirementStatus.includes('active') &&
      (otherTaskData?.active === true ||
        (otherTaskData?.complete === true && !otherTaskData?.failed))
    ) {
      return true;
    }
    if (requirementStatus.includes('failed') && otherTaskData?.failed) {
      return true;
    }
    return false;
  });
};
const stateMeetsRequirement = (state: TaskState, statuses: string[]): boolean => {
  if (statuses.includes('complete') && state === 'completed') return true;
  if (statuses.includes('failed') && state === 'failed') return true;
  return statuses.includes('active') && (state === 'active' || state === 'completed');
};
const findChangedRequirement = (
  requirements: TarkovTask['taskRequirements'] | undefined,
  changedTaskId: string
): TarkovTaskRequirement | undefined =>
  requirements?.find((requirement) => requirement?.task?.id === changedTaskId);
const isTaskStateUpdateAllowed = (
  dependentTask: TarkovTask,
  changedTaskId: string,
  newState: TaskState,
  taskCompletions: Record<string, TaskCompletion>,
  changedRequirement: TarkovTaskRequirement
): boolean =>
  [
    stateMeetsRequirement(newState, changedRequirement.status ?? []),
    checkAllRequirementsMet(dependentTask, changedTaskId, newState, taskCompletions),
    !Object.hasOwn(taskCompletions, dependentTask.id),
  ].every(Boolean);
const canUpdateDependentTask = (
  dependentTask: TarkovTask,
  changedRequirement: TarkovTaskRequirement,
  changedTaskId: string,
  newState: TaskState,
  taskCompletions: Record<string, TaskCompletion>,
  protectedTaskIds?: Set<string>
): boolean => {
  if (protectedTaskIds?.has(dependentTask.id)) return false;
  return isTaskStateUpdateAllowed(
    dependentTask,
    changedTaskId,
    newState,
    taskCompletions,
    changedRequirement
  );
};
const updateDependentTasks = (
  changedTaskId: string,
  newState: TaskState,
  tasks: TarkovTask[],
  taskCompletions: Record<string, TaskCompletion>,
  updateTime: number,
  updates?: Map<string, TaskState>,
  protectedTaskIds?: Set<string>
): void => {
  for (const dependentTask of tasks) {
    const changedRequirement = findChangedRequirement(
      dependentTask.taskRequirements,
      changedTaskId
    );
    if (!changedRequirement) continue;
    if (
      !canUpdateDependentTask(
        dependentTask,
        changedRequirement,
        changedTaskId,
        newState,
        taskCompletions,
        protectedTaskIds
      )
    ) {
      continue;
    }
    setTaskCompletion(taskCompletions, dependentTask.id, false, false, false, updateTime, updates);
  }
};
/**
 * Handle GET /api/progress - Return player progress
 */
export async function handleGetProgress(
  env: Env,
  token: ApiToken,
  gameMode: GameMode
): Promise<ProgressResponse> {
  // Select only the requested game mode's JSONB blob to reduce Supabase egress
  // and Worker memory; the other mode's column is not needed for this response.
  const row = await fetchUserProgressMode(env, token.user_id, gameMode);
  const gameEdition = row?.game_edition ?? 1;
  // Extract game mode specific data
  const progressData = extractGameModeData(row);
  const fallbackDisplayName =
    progressData?.displayName?.trim() || (await getUserDisplayName(env, token.user_id));
  // Fetch task and hideout data (cached)
  const [tasks, hideoutStations] = await Promise.all([
    getTasks(gameMode),
    getHideoutStations(gameMode),
  ]);
  // Transform to API response format
  const data = transformProgress(
    progressData,
    token.user_id,
    gameEdition,
    tasks,
    hideoutStations,
    fallbackDisplayName
  );
  return {
    data,
    meta: {
      self: token.user_id,
      gameMode: gameMode,
    },
  };
}
/**
 * Handle POST /api/progress/level/:levelValue - Update player level
 */
export async function handleUpdateLevel(
  env: Env,
  token: ApiToken,
  level: number,
  gameMode: GameMode
): Promise<{ level: number; message: string }> {
  const dataField = getProgressDataField(gameMode);
  await mergeProgressData(env, token, dataField, { set: { level } }, { action: 'update-level' });
  return { level, message: 'Level updated successfully' };
}
/**
 * Handle POST /api/progress/task/objective/:objectiveId - Update task objective
 */
export async function handleUpdateObjective(
  env: Env,
  token: ApiToken,
  objectiveId: string,
  update: { state?: string; count?: number },
  gameMode: GameMode
): Promise<{ objectiveId: string; state?: string; count?: number; message: string }> {
  const dataField = getProgressDataField(gameMode);
  const updateTime = Date.now();
  // Build the patch from `update` only and let the RPC's per-key objective
  // merge preserve untouched fields server-side. Reading the current objective
  // here would race a concurrent writer and could carry a stale `complete` or
  // `count` back into the merge, reintroducing the lost-update this refactor
  // fixes. Every objective write bumps `timestamp` to mark last touch.
  const objectiveData: Record<string, unknown> = {};
  if (update.state !== undefined) {
    objectiveData.complete = update.state === 'completed';
    objectiveData.timestamp = updateTime;
  }
  if (update.count !== undefined) {
    objectiveData.count = update.count;
    objectiveData.timestamp = updateTime;
  }
  await mergeProgressData(
    env,
    token,
    dataField,
    { taskObjectives: { [objectiveId]: objectiveData } },
    { action: 'update-objective', taskIds: [objectiveId] }
  );
  return {
    objectiveId,
    ...(update.state !== undefined && { state: update.state }),
    ...(update.count !== undefined && { count: update.count }),
    message: 'Task objective updated successfully',
  };
}
/**
 * Handle POST /api/progress/task/:taskId - Update single task
 */
export async function handleUpdateTask(
  env: Env,
  token: ApiToken,
  taskId: string,
  state: TaskState,
  gameMode: GameMode
): Promise<{ taskId: string; state: string; message: string }> {
  const updateTime = Date.now();
  const dataField = getProgressDataField(gameMode);
  const currentData = await fetchCurrentProgressData(env, token.user_id, gameMode);
  const taskCompletions = (currentData.taskCompletions as Record<string, TaskCompletion>) || {};
  const beforeSnapshot = snapshotCompletions(taskCompletions);
  const updateMap = new Map<string, TaskState>();
  setTaskCompletion(
    taskCompletions,
    taskId,
    state === 'completed' || state === 'failed',
    state === 'failed',
    state === 'active',
    updateTime,
    updateMap
  );
  const tasks = await getTasks(gameMode);
  if (tasks.length > 0) {
    updateDependentTasks(taskId, state, tasks, taskCompletions, updateTime, updateMap);
  }
  const changedCompletions = diffCompletions(taskCompletions, beforeSnapshot);
  const set: Record<string, unknown> = {};
  if (updateMap.size > 0) {
    set.lastApiUpdate = buildApiUpdateMeta(
      Array.from(updateMap.entries()).map(([id, taskState]) => ({ id, state: taskState })),
      updateTime
    );
  }
  await mergeProgressData(
    env,
    token,
    dataField,
    { taskCompletions: changedCompletions, ...(updateMap.size > 0 && { set }) },
    { action: 'update-task', taskIds: [taskId] }
  );
  return { taskId, state, message: 'Task updated successfully' };
}
/**
 * Handle POST /api/progress/tasks - Batch update tasks
 */
export async function handleUpdateTasks(
  env: Env,
  token: ApiToken,
  updates: BatchTaskUpdate[],
  gameMode: GameMode
): Promise<{ updatedTasks: string[]; message: string }> {
  const dataField = getProgressDataField(gameMode);
  const updateTime = Date.now();
  // Fetch current data
  const currentData = await fetchCurrentProgressData(env, token.user_id, gameMode);
  const taskCompletions = (currentData.taskCompletions as Record<string, TaskCompletion>) || {};
  const beforeSnapshot = snapshotCompletions(taskCompletions);
  const updateMap = new Map<string, TaskState>();
  const explicitTaskIds = new Set(updates.map((update) => update.id));
  const tasks = await getTasks(gameMode);
  for (const update of updates) {
    setTaskCompletion(
      taskCompletions,
      update.id,
      update.state === 'completed' || update.state === 'failed',
      update.state === 'failed',
      update.state === 'active',
      updateTime,
      updateMap
    );
    if (tasks.length > 0) {
      updateDependentTasks(
        update.id,
        update.state,
        tasks,
        taskCompletions,
        updateTime,
        updateMap,
        explicitTaskIds
      );
    }
  }
  const changedCompletions = diffCompletions(taskCompletions, beforeSnapshot);
  const set: Record<string, unknown> = {};
  if (updateMap.size > 0) {
    set.lastApiUpdate = buildApiUpdateMeta(
      Array.from(updateMap.entries()).map(([id, taskState]) => ({ id, state: taskState })),
      updateTime
    );
  }
  await mergeProgressData(
    env,
    token,
    dataField,
    { taskCompletions: changedCompletions, ...(updateMap.size > 0 && { set }) },
    { action: 'update-tasks', taskIds: updates.map((u) => u.id) }
  );
  return { updatedTasks: updates.map((u) => u.id), message: 'Tasks updated successfully' };
}
