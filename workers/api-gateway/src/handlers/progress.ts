import { getTasks, getHideoutStations } from '../services/tarkov';
import { logger } from '../utils/logger';
import { getMemoryCache, setMemoryCache } from '../utils/memory-cache';
import { extractGameModeData, transformProgress } from '../utils/transform';
import type {
  Env,
  ApiToken,
  UserProgressRow,
  ProgressResponse,
  TaskState,
  BatchTaskUpdate,
  TaskCompletion,
  TarkovTask,
  ApiTaskUpdate,
  ApiUpdateMeta,
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
  dataField: 'pvp_data' | 'pve_data',
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
function getMetaString(metadata: Record<string, unknown>, key: string): string | null {
  return typeof metadata[key] === 'string' ? (metadata[key] as string) : null;
}
function extractUsername(
  userMetadata: Record<string, unknown>,
  email: string | null,
  provider: string | null
): string | null {
  if (provider === 'discord') {
    const globalName = getMetaString(userMetadata, 'global_name');
    const username = getMetaString(userMetadata, 'username');
    const preferredUsername = getMetaString(userMetadata, 'preferred_username');
    const fullName = getMetaString(userMetadata, 'full_name');
    const legacyName = getMetaString(userMetadata, 'name');
    return (
      globalName ||
      username ||
      preferredUsername ||
      fullName ||
      legacyName?.split('#')[0] ||
      email?.split('@')[0] ||
      null
    );
  }
  if (provider === 'twitch') {
    return (
      getMetaString(userMetadata, 'preferred_username') ||
      getMetaString(userMetadata, 'name') ||
      email?.split('@')[0] ||
      null
    );
  }
  return getMetaString(userMetadata, 'name') || email?.split('@')[0] || null;
}
function extractDisplayName(
  userMetadata: Record<string, unknown>,
  provider: string | null,
  username: string | null
): string | null {
  const fullName = getMetaString(userMetadata, 'full_name');
  if (provider === 'discord') {
    return username;
  }
  if (provider === 'twitch') {
    return fullName || username;
  }
  return fullName || username;
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
    const username = extractUsername(userMetadata, email, provider);
    const displayName = extractDisplayName(userMetadata, provider, username);
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
const toTaskState = (complete: boolean, failed: boolean): TaskState => {
  if (failed) return 'failed';
  if (complete) return 'completed';
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
  timestamp: number,
  updates?: Map<string, TaskState>
): void => {
  const previous = taskCompletions[taskId];
  const prevState = toTaskState(previous?.complete === true, previous?.failed === true);
  const nextState = toTaskState(complete, failed);
  taskCompletions[taskId] = { complete, failed, timestamp };
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
        (newState === 'uncompleted' || newState === 'completed')
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
      (otherTaskData?.complete === false ||
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
    const requirements = dependentTask.taskRequirements ?? [];
    if (!requirements.length) continue;
    let shouldUnlock = false;
    let shouldLock = false;
    for (const requirement of requirements) {
      if (requirement?.task?.id !== changedTaskId) continue;
      const requirementStatus = requirement.status ?? [];
      if (!requirementStatus.includes('complete')) continue;
      if (newState === 'completed') {
        shouldUnlock = checkAllRequirementsMet(
          dependentTask,
          changedTaskId,
          newState,
          taskCompletions
        );
      } else {
        shouldLock = true;
      }
    }
    if (shouldUnlock || shouldLock) {
      if (protectedTaskIds?.has(dependentTask.id)) continue;
      setTaskCompletion(taskCompletions, dependentTask.id, false, false, updateTime, updates);
    }
  }
};
const updateAlternativeTasks = (
  changedTask: TarkovTask,
  newState: TaskState,
  taskCompletions: Record<string, TaskCompletion>,
  updateTime: number,
  updates?: Map<string, TaskState>,
  protectedTaskIds?: Set<string>
): void => {
  const alternatives = changedTask.alternatives ?? [];
  if (!alternatives.length) return;
  for (const altTaskId of alternatives) {
    if (!altTaskId) continue;
    if (protectedTaskIds?.has(altTaskId)) continue;
    if (newState === 'completed') {
      setTaskCompletion(taskCompletions, altTaskId, true, true, updateTime, updates);
    } else if (newState !== 'failed') {
      setTaskCompletion(taskCompletions, altTaskId, false, false, updateTime, updates);
    }
  }
};
/**
 * Handle GET /api/progress - Return player progress
 */
export async function handleGetProgress(
  env: Env,
  token: ApiToken,
  gameMode: 'pvp' | 'pve'
): Promise<ProgressResponse> {
  // Fetch user progress from Supabase
  const url = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${token.user_id}&select=*&limit=1`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user progress');
  }
  const rows = (await response.json()) as UserProgressRow[];
  const row = rows[0] || null;
  const gameEdition = row?.game_edition ?? 1;
  // Extract game mode specific data
  const progressData = extractGameModeData(row, gameMode);
  const fallbackDisplayName =
    progressData?.displayName?.trim() || (await getUserDisplayName(env, token.user_id));
  // Fetch task and hideout data (cached)
  const [tasks, hideoutStations] = await Promise.all([getTasks(), getHideoutStations()]);
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
  gameMode: 'pvp' | 'pve'
): Promise<{ level: number; message: string }> {
  const dataField = gameMode === 'pve' ? 'pve_data' : 'pvp_data';
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
  gameMode: 'pvp' | 'pve'
): Promise<{ objectiveId: string; state?: string; count?: number; message: string }> {
  const dataField = gameMode === 'pve' ? 'pve_data' : 'pvp_data';
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
  gameMode: 'pvp' | 'pve'
): Promise<{ taskId: string; state: string; message: string }> {
  const updateTime = Date.now();
  const dataField = gameMode === 'pve' ? 'pve_data' : 'pvp_data';
  const getUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${token.user_id}&select=${dataField}`;
  const getRes = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!getRes.ok) {
    throw new Error(`Failed to fetch current progress (HTTP ${getRes.status})`);
  }
  const rows = (await getRes.json()) as Array<Record<string, unknown>>;
  const currentData = (rows[0]?.[dataField] as Record<string, unknown>) || {};
  const taskCompletions = (currentData.taskCompletions as Record<string, TaskCompletion>) || {};
  const beforeSnapshot = snapshotCompletions(taskCompletions);
  const updateMap = new Map<string, TaskState>();
  setTaskCompletion(
    taskCompletions,
    taskId,
    state === 'completed' || state === 'failed',
    state === 'failed',
    updateTime,
    updateMap
  );
  const tasks = await getTasks();
  if (tasks.length > 0) {
    updateDependentTasks(taskId, state, tasks, taskCompletions, updateTime, updateMap);
    const changedTask = tasks.find((task) => task.id === taskId);
    if (changedTask) {
      updateAlternativeTasks(changedTask, state, taskCompletions, updateTime, updateMap);
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
  gameMode: 'pvp' | 'pve'
): Promise<{ updatedTasks: string[]; message: string }> {
  const dataField = gameMode === 'pve' ? 'pve_data' : 'pvp_data';
  const updateTime = Date.now();
  // Fetch current data
  const getUrl = `${env.SUPABASE_URL}/rest/v1/user_progress?user_id=eq.${token.user_id}&select=${dataField}`;
  const getRes = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!getRes.ok) {
    throw new Error(`Failed to fetch current progress (HTTP ${getRes.status})`);
  }
  const rows = (await getRes.json()) as Array<Record<string, unknown>>;
  const currentData = (rows[0]?.[dataField] as Record<string, unknown>) || {};
  const taskCompletions = (currentData.taskCompletions as Record<string, TaskCompletion>) || {};
  const beforeSnapshot = snapshotCompletions(taskCompletions);
  const updateMap = new Map<string, TaskState>();
  const explicitTaskIds = new Set(updates.map((update) => update.id));
  const tasks = await getTasks();
  for (const update of updates) {
    setTaskCompletion(
      taskCompletions,
      update.id,
      update.state === 'completed' || update.state === 'failed',
      update.state === 'failed',
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
      const changedTask = tasks.find((task) => task.id === update.id);
      if (changedTask) {
        updateAlternativeTasks(
          changedTask,
          update.state,
          taskCompletions,
          updateTime,
          updateMap,
          explicitTaskIds
        );
      }
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
