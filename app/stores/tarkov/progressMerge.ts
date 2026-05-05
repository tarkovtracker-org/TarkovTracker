import {
  defaultState,
  type ApiTaskUpdate,
  type ApiUpdateMeta,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import { GAME_MODES, type GameMode } from '@/utils/constants';
import { sanitizeOwnedProgressData } from '@/utils/progressSanitizers';
import type { RawTaskCompletion } from '@/utils/taskStatus';
const API_UPDATE_HISTORY_LIMIT = 50;
type CountableEntry = { count?: number; complete?: boolean; timestamp?: number };
type HideoutModuleEntry = UserProgressData['hideoutModules'][string];
type StoryChapterEntry = UserProgressData['storyChapters'][string];
type StoryObjectiveEntry = NonNullable<StoryChapterEntry['objectives']>[string];
type TimestampedCompletionEntry = { complete?: boolean; timestamp?: number };
export const coerceGameMode = (mode?: string | null): GameMode => {
  return mode === GAME_MODES.PVE ? GAME_MODES.PVE : GAME_MODES.PVP;
};
export const hasProgress = (data: unknown): boolean => {
  const state = data as UserState;
  if (!state) return false;
  const modeHasData = (mode: UserProgressData | undefined) =>
    mode &&
    (mode.level > 1 ||
      Object.keys(mode.taskCompletions || {}).length > 0 ||
      Object.keys(mode.taskObjectives || {}).length > 0 ||
      Object.keys(mode.hideoutParts || {}).length > 0 ||
      Object.keys(mode.hideoutModules || {}).length > 0 ||
      Object.keys(mode.storyChapters || {}).length > 0);
  return Boolean(modeHasData(state.pvp) || modeHasData(state.pve));
};
export const buildUpsertPayload = (
  userId: string,
  state: UserState,
  partial?: Partial<{ pvp_data: UserProgressData; pve_data: UserProgressData }>
) => ({
  user_id: userId,
  current_game_mode: state.currentGameMode || GAME_MODES.PVP,
  game_edition: state.gameEdition || defaultState.gameEdition,
  tarkov_uid: state.tarkovUid ?? null,
  pvp_data: sanitizeOwnedProgressData(partial?.pvp_data ?? state.pvp ?? defaultState.pvp),
  pve_data: sanitizeOwnedProgressData(partial?.pve_data ?? state.pve ?? defaultState.pve),
});
export const toProgressEpoch = (modeData: UserProgressData | undefined): number => {
  if (
    !modeData ||
    typeof modeData.progressEpoch !== 'number' ||
    !Number.isFinite(modeData.progressEpoch)
  ) {
    return 0;
  }
  return Math.max(0, Math.trunc(modeData.progressEpoch));
};
export const getNextProgressEpoch = (modeData: UserProgressData | undefined): number => {
  return Math.min(2147483647, toProgressEpoch(modeData) + 1);
};
export const mergeTimestampedCompletion = <T extends TimestampedCompletionEntry>(
  local: T | undefined,
  remote: T | undefined
): T | undefined => {
  if (!local && !remote) return undefined;
  if (!local) return { ...remote } as T;
  if (!remote) return { ...local } as T;
  const localTs = local.timestamp ?? 0;
  const remoteTs = remote.timestamp ?? 0;
  const newer = remoteTs >= localTs ? remote : local;
  const older = newer === remote ? local : remote;
  const merged: TimestampedCompletionEntry = {};
  if (typeof newer.complete === 'boolean') {
    merged.complete = newer.complete;
  } else if (typeof older.complete === 'boolean') {
    merged.complete = older.complete;
  }
  const latestTimestamp = Math.max(localTs, remoteTs);
  if (latestTimestamp > 0) {
    merged.timestamp = latestTimestamp;
  }
  return merged as T;
};
export const mergeStoryChapterProgress = (
  local: UserProgressData['storyChapters'] | undefined,
  remote: UserProgressData['storyChapters'] | undefined
): UserProgressData['storyChapters'] => {
  const allChapterIds = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const merged: UserProgressData['storyChapters'] = {};
  for (const chapterId of allChapterIds) {
    const localChapter = local?.[chapterId];
    const remoteChapter = remote?.[chapterId];
    const mergedChapter = mergeTimestampedCompletion<StoryChapterEntry>(
      localChapter,
      remoteChapter
    );
    if (!mergedChapter) continue;
    const allObjectiveIds = new Set([
      ...Object.keys(localChapter?.objectives || {}),
      ...Object.keys(remoteChapter?.objectives || {}),
    ]);
    if (allObjectiveIds.size > 0) {
      const mergedObjectives: NonNullable<StoryChapterEntry['objectives']> = {};
      for (const objectiveId of allObjectiveIds) {
        const mergedObjective = mergeTimestampedCompletion<StoryObjectiveEntry>(
          localChapter?.objectives?.[objectiveId],
          remoteChapter?.objectives?.[objectiveId]
        );
        if (mergedObjective) {
          mergedObjectives[objectiveId] = mergedObjective;
        }
      }
      mergedChapter.objectives = mergedObjectives;
    }
    merged[chapterId] = mergedChapter;
  }
  return merged;
};
const mergeHideoutModules = (
  local: UserProgressData['hideoutModules'] | undefined,
  remote: UserProgressData['hideoutModules'] | undefined
): UserProgressData['hideoutModules'] => {
  const allModuleIds = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const merged: UserProgressData['hideoutModules'] = {};
  for (const moduleId of allModuleIds) {
    const resolved = mergeTimestampedCompletion<HideoutModuleEntry>(
      local?.[moduleId],
      remote?.[moduleId]
    );
    if (resolved) {
      merged[moduleId] = resolved;
    }
  }
  return merged;
};
export const mergeCountableObjects = <T extends Record<string, CountableEntry>>(
  local: T | undefined,
  remote: T | undefined
): T => {
  const merged = { ...local, ...remote } as T;
  for (const id of Object.keys(merged)) {
    const l = local?.[id];
    const r = remote?.[id];
    if (l && r) {
      const localTs = l.timestamp ?? 0;
      const remoteTs = r.timestamp ?? 0;
      const newer = remoteTs >= localTs ? r : l;
      const older = newer === r ? l : r;
      const newerHasComplete = typeof newer.complete === 'boolean';
      const olderHasComplete = typeof older.complete === 'boolean';
      merged[id as keyof T] = {
        complete: newerHasComplete ? newer.complete : olderHasComplete ? older.complete : false,
        count: Math.max(l.count || 0, r.count || 0),
        timestamp: Math.max(localTs, remoteTs) || undefined,
      } as T[keyof T];
    }
  }
  return merged;
};
export const normalizeTaskCompletionEntry = (
  completion: RawTaskCompletion
): { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean } | undefined => {
  if (completion === null || completion === undefined) return undefined;
  if (typeof completion === 'boolean') {
    return { complete: completion, failed: false };
  }
  const normalized: { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean } =
    {
      complete: completion.complete === true,
      failed: completion.failed === true,
    };
  if (typeof completion.timestamp === 'number') {
    normalized.timestamp = completion.timestamp;
  }
  if (typeof completion.manual === 'boolean') {
    normalized.manual = completion.manual;
  }
  return normalized;
};
export const normalizeTaskCompletionsMap = (
  taskCompletions: Record<string, RawTaskCompletion> | undefined
): number => {
  if (!taskCompletions) return 0;
  let migrated = 0;
  for (const [taskId, completion] of Object.entries(taskCompletions)) {
    if (typeof completion !== 'boolean') continue;
    const normalized = normalizeTaskCompletionEntry(completion);
    if (!normalized) continue;
    taskCompletions[taskId] = normalized;
    migrated += 1;
  }
  return migrated;
};
const API_TASK_STATES = ['completed', 'failed', 'uncompleted'] as const;
const isApiTaskState = (state: unknown): state is ApiTaskUpdate['state'] => {
  return API_TASK_STATES.includes(state as ApiTaskUpdate['state']);
};
export const normalizeApiTaskUpdates = (updates: ApiUpdateMeta['tasks']): ApiTaskUpdate[] => {
  if (!Array.isArray(updates)) return [];
  return updates.filter(
    (update): update is ApiTaskUpdate =>
      Boolean(update) && typeof update.id === 'string' && isApiTaskState(update.state)
  );
};
export const normalizeApiUpdateMetaEntry = (value: unknown): ApiUpdateMeta | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ApiUpdateMeta>;
  if (
    candidate.source !== 'api' ||
    typeof candidate.id !== 'string' ||
    !candidate.id ||
    typeof candidate.at !== 'number' ||
    !Number.isFinite(candidate.at)
  ) {
    return null;
  }
  const tasks = normalizeApiTaskUpdates(candidate.tasks);
  return {
    at: candidate.at,
    id: candidate.id,
    source: 'api',
    ...(tasks.length ? { tasks } : {}),
  };
};
export const normalizeApiUpdateHistoryEntries = (value: unknown): ApiUpdateMeta[] => {
  if (!Array.isArray(value)) return [];
  const deduped = new Map<string, ApiUpdateMeta>();
  for (const entry of value) {
    const normalized = normalizeApiUpdateMetaEntry(entry);
    if (!normalized) continue;
    const existing = deduped.get(normalized.id);
    if (!existing || normalized.at >= existing.at) {
      deduped.set(normalized.id, normalized);
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.at - a.at)
    .slice(0, API_UPDATE_HISTORY_LIMIT);
};
export const buildApiUpdateHistory = (data: UserProgressData | undefined): ApiUpdateMeta[] => {
  if (!data) return [];
  const history = normalizeApiUpdateHistoryEntries(data.apiUpdateHistory);
  const latest = normalizeApiUpdateMetaEntry(data.lastApiUpdate);
  if (!latest || history.some((entry) => entry.id === latest.id)) {
    return history;
  }
  return normalizeApiUpdateHistoryEntries([latest, ...history]);
};
export const mergeApiUpdateHistory = (
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): ApiUpdateMeta[] => {
  return normalizeApiUpdateHistoryEntries([
    ...buildApiUpdateHistory(local),
    ...buildApiUpdateHistory(remote),
  ]);
};
export function mergeProgressData(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): UserProgressData {
  if (!local && !remote) return {} as UserProgressData;
  if (!local) return structuredClone(remote!);
  if (!remote) return structuredClone(local);
  const localEpoch = toProgressEpoch(local);
  const remoteEpoch = toProgressEpoch(remote);
  if (remoteEpoch > localEpoch) {
    return { ...structuredClone(remote), progressEpoch: remoteEpoch };
  }
  if (localEpoch > remoteEpoch) {
    return { ...structuredClone(local), progressEpoch: localEpoch };
  }
  const mergeTaskCompletion = (
    localComp: RawTaskCompletion,
    remoteComp: RawTaskCompletion
  ): { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean } | undefined => {
    const normalizedLocal = normalizeTaskCompletionEntry(localComp);
    const normalizedRemote = normalizeTaskCompletionEntry(remoteComp);
    if (!normalizedLocal) return normalizedRemote;
    if (!normalizedRemote) return normalizedLocal;
    const localTs = normalizedLocal.timestamp ?? 0;
    const remoteTs = normalizedRemote.timestamp ?? 0;
    const base = remoteTs >= localTs ? normalizedRemote : normalizedLocal;
    const other = remoteTs >= localTs ? normalizedLocal : normalizedRemote;
    const merged = { ...other, ...base };
    const newerExplicitlySetsFalse =
      Object.prototype.hasOwnProperty.call(base, 'complete') && base.complete === false;
    if ((normalizedLocal.complete || normalizedRemote.complete) && !newerExplicitlySetsFalse) {
      merged.complete = true;
    }
    merged.timestamp = Math.max(localTs, remoteTs);
    return merged;
  };
  const resolveApiUpdate = (
    localUpdate?: ApiUpdateMeta,
    remoteUpdate?: ApiUpdateMeta
  ): ApiUpdateMeta | undefined => {
    const normalizedLocal = normalizeApiUpdateMetaEntry(localUpdate);
    const normalizedRemote = normalizeApiUpdateMetaEntry(remoteUpdate);
    if (!normalizedLocal) return normalizedRemote ?? undefined;
    if (!normalizedRemote) return normalizedLocal;
    return normalizedRemote.at >= normalizedLocal.at ? normalizedRemote : normalizedLocal;
  };
  const mergedState: UserProgressData = {
    ...local,
    ...remote,
    progressEpoch: localEpoch,
    level: Math.max(local.level || 1, remote.level || 1),
    prestigeLevel: Math.max(local.prestigeLevel || 0, remote.prestigeLevel || 0),
    displayName: remote.displayName || local.displayName,
    pmcFaction: remote.pmcFaction || local.pmcFaction,
    xpOffset: remote.xpOffset !== undefined ? remote.xpOffset : local.xpOffset,
    lastApiUpdate: resolveApiUpdate(local.lastApiUpdate, remote.lastApiUpdate),
    apiUpdateHistory: mergeApiUpdateHistory(local, remote),
    taskCompletions: (() => {
      const allKeys = new Set([
        ...Object.keys(local.taskCompletions || {}),
        ...Object.keys(remote.taskCompletions || {}),
      ]);
      const merged: UserProgressData['taskCompletions'] = {};
      for (const id of allKeys) {
        const resolved = mergeTaskCompletion(
          local.taskCompletions?.[id],
          remote.taskCompletions?.[id]
        );
        if (resolved) {
          merged[id] = resolved;
        }
      }
      return merged;
    })(),
    taskObjectives: mergeCountableObjects(local.taskObjectives, remote.taskObjectives),
    hideoutModules: mergeHideoutModules(local.hideoutModules, remote.hideoutModules),
    hideoutParts: mergeCountableObjects(local.hideoutParts, remote.hideoutParts),
    storyChapters: mergeStoryChapterProgress(local.storyChapters, remote.storyChapters),
    traders: {
      ...local.traders,
      ...remote.traders,
      ...Object.fromEntries(
        Object.entries({ ...local.traders, ...remote.traders }).map(([traderId, trader]) => {
          const localTrader = local.traders?.[traderId];
          const remoteTrader = remote.traders?.[traderId];
          if (localTrader && remoteTrader) {
            return [
              traderId,
              {
                level: Math.max(localTrader.level || 1, remoteTrader.level || 1),
                reputation: Math.max(localTrader.reputation || 0, remoteTrader.reputation || 0),
              },
            ];
          }
          return [traderId, trader];
        })
      ),
    },
    skills: {
      ...local.skills,
      ...remote.skills,
      ...Object.fromEntries(
        Object.entries({ ...local.skills, ...remote.skills }).map(([skillName, skillLevel]) => {
          const localSkill = local.skills?.[skillName];
          const remoteSkill = remote.skills?.[skillName];
          if (localSkill !== undefined && remoteSkill !== undefined) {
            return [skillName, Math.max(localSkill, remoteSkill)];
          }
          return [skillName, skillLevel];
        })
      ),
    },
    skillOffsets: {
      ...local.skillOffsets,
      ...remote.skillOffsets,
    },
  };
  return Object.fromEntries(
    Object.entries(mergedState).filter(([, value]) => value !== undefined)
  ) as UserProgressData;
}
