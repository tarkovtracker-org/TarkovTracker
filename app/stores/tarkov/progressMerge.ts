import { capApiTaskUpdates, isApiTaskUpdateEntry } from '@shared/utils/apiTaskUpdates';
import {
  defaultState,
  type ApiTaskUpdate,
  type ApiUpdateMeta,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { GAME_MODES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { hasMaterializedProgress } from '@/utils/modeProgressFallback';
import {
  sanitizeManualActivityEpoch,
  sanitizeManualActivityHistory,
  sanitizeOwnedProgressData,
} from '@/utils/progressSanitizers';
import { mergeTaskAvailability } from '@/utils/taskAvailabilityConfirmation';
import type { ManualActivityEntry, TaskCompletion } from '@/types/progress';
import type { RawTaskCompletion } from '@/utils/taskStatus';
const API_UPDATE_HISTORY_LIMIT = 50;
type CountableEntry = { count?: number; complete?: boolean; timestamp?: number };
type HideoutModuleEntry = UserProgressData['hideoutModules'][string];
type StoryChapterEntry = UserProgressData['storyChapters'][string];
type StoryObjectiveEntry = NonNullable<StoryChapterEntry['objectives']>[string];
type TimestampedCompletionEntry = { complete?: boolean; timestamp?: number };
export const coerceGameMode = (mode?: string | null): GameMode => {
  return Object.values(GAME_MODES).includes(mode as GameMode) ? (mode as GameMode) : GAME_MODES.PVP;
};
const RESET_CLOCK_KEYS = new Set(['progressEpoch', 'manualActivityEpoch']);
const DEFAULT_MODE_PROGRESS = defaultState.pvp as unknown as Record<string, unknown>;
/** True when a mode differs from default progress in anything but its reset clocks. */
export const hasRetainableModeProgress = (modeData: UserProgressData | undefined): boolean =>
  hasMaterializedProgress(modeData) &&
  Object.entries(modeData as UserProgressData).some(
    ([key, value]) => !RESET_CLOCK_KEYS.has(key) && !deepEqual(value, DEFAULT_MODE_PROGRESS[key])
  );
export const hasProgress = (data: unknown): boolean => {
  const state = data as UserState;
  if (!state) return false;
  return [state.pvp, state.pve, state.seasonal].some(modeHasData);
};
const PROGRESS_MAP_KEYS = [
  'taskCompletions',
  'taskObjectives',
  'hideoutParts',
  'hideoutModules',
  'storyChapters',
  'taskAvailability',
] as const;
const hasEntries = (value: object | undefined): boolean => Object.keys(value ?? {}).length > 0;
const hasCounterProgress = (mode: UserProgressData): boolean =>
  [
    mode.level > 1,
    (mode.prestigeLevel ?? 0) > 0,
    (mode.progressEpoch ?? 0) > 0,
    (mode.manualActivityHistory?.length ?? 0) > 0,
    sanitizeManualActivityEpoch(mode.manualActivityEpoch) > 0,
  ].some(Boolean);
/** Any tracked value, including a confirmation-only map, makes a mode worth syncing and adopting. */
const modeHasData = (mode: UserProgressData | undefined): boolean =>
  Boolean(mode) &&
  (hasCounterProgress(mode!) || PROGRESS_MAP_KEYS.some((key) => hasEntries(mode![key])));
export const buildUpsertPayload = (
  userId: string,
  state: UserState,
  partial?: Partial<{
    pvp_data: UserProgressData;
    pve_data: UserProgressData;
    seasonal_data: UserProgressData;
  }>
) => ({
  user_id: userId,
  current_game_mode: state.currentGameMode || GAME_MODES.PVP,
  game_edition: state.gameEdition || defaultState.gameEdition,
  tarkov_uid: state.tarkovUid ?? null,
  pvp_data: sanitizeOwnedProgressData(partial?.pvp_data ?? state.pvp ?? defaultState.pvp),
  pve_data: sanitizeOwnedProgressData(partial?.pve_data ?? state.pve ?? defaultState.pve),
  seasonal_data: sanitizeOwnedProgressData(
    partial?.seasonal_data ?? state.seasonal ?? defaultState.seasonal
  ),
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
// Contract: progressEpoch is bumped ONLY by a full progress reset/prestige wipe
// (resetOnlineProfile, performReset, buildPrestigeResetData). mergeProgressData
// treats a higher epoch as an authoritative win and discards the losing side's
// data, including storyChapters. Bumping it for a non-wiping change (e.g. a
// prestige-level-only edit) silently loses the other device's storyline progress.
export const getNextProgressEpoch = (modeData: UserProgressData | undefined): number => {
  return Math.min(2147483647, toProgressEpoch(modeData) + 1);
};
const countStoryChapters = (chapters: UserProgressData['storyChapters'] | undefined): number =>
  chapters ? Object.keys(chapters).length : 0;
const warnDroppedStoryChapters = (
  winner: 'local' | 'remote',
  dropped: UserProgressData['storyChapters'] | undefined,
  kept: UserProgressData['storyChapters'] | undefined,
  localEpoch: number,
  remoteEpoch: number
): void => {
  const droppedCount = countStoryChapters(dropped);
  if (droppedCount === 0) return;
  logger.warn('[progressMerge] epoch early-return dropped non-empty storyChapters', {
    winner,
    droppedStoryChapters: droppedCount,
    keptStoryChapters: countStoryChapters(kept),
    localEpoch,
    remoteEpoch,
  });
};
const mergeTimestampedCompletion = <T extends TimestampedCompletionEntry>(
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
const mergeCountableObjects = <T extends Record<string, CountableEntry>>(
  local: T | undefined,
  remote: T | undefined,
  preferNewerCount = false
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
        count: preferNewerCount
          ? (newer.count ?? older.count ?? 0)
          : Math.max(l.count || 0, r.count || 0),
        timestamp: Math.max(localTs, remoteTs) || undefined,
      } as T[keyof T];
    }
  }
  return merged;
};
const normalizeTaskCompletionEntry = (
  completion: RawTaskCompletion
): TaskCompletion | undefined => {
  if (completion === null || completion === undefined) return undefined;
  if (typeof completion === 'boolean') {
    return { complete: completion, failed: false };
  }
  const normalized: TaskCompletion = {
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
export const normalizeApiTaskUpdates = (updates: ApiUpdateMeta['tasks']): ApiTaskUpdate[] =>
  Array.isArray(updates) ? updates.filter(isApiTaskUpdateEntry) : [];
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
  const { tasks, taskCount } = capApiTaskUpdates(candidate.tasks, candidate.taskCount);
  return {
    at: candidate.at,
    id: candidate.id,
    source: 'api',
    ...(tasks.length ? { tasks } : {}),
    ...(taskCount !== undefined ? { taskCount } : {}),
  };
};
const normalizeApiUpdateHistoryEntries = (value: unknown): ApiUpdateMeta[] => {
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
const buildApiUpdateHistory = (data: UserProgressData | undefined): ApiUpdateMeta[] => {
  if (!data) return [];
  const history = normalizeApiUpdateHistoryEntries(data.apiUpdateHistory);
  const latest = normalizeApiUpdateMetaEntry(data.lastApiUpdate);
  if (!latest || history.some((entry) => entry.id === latest.id)) {
    return history;
  }
  return normalizeApiUpdateHistoryEntries([latest, ...history]);
};
const mergeApiUpdateHistory = (
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): ApiUpdateMeta[] => {
  return normalizeApiUpdateHistoryEntries([
    ...buildApiUpdateHistory(local),
    ...buildApiUpdateHistory(remote),
  ]);
};
const manualActivityEntries = (data: UserProgressData | undefined): ManualActivityEntry[] =>
  Array.isArray(data?.manualActivityHistory) ? data.manualActivityHistory : [];
const manualActivityEpoch = (data: UserProgressData | undefined): number =>
  sanitizeManualActivityEpoch(data?.manualActivityEpoch);
/** A clear advances only the history epoch; stale devices cannot restore cleared rows. */
export const mergeManualActivityHistory = (
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): Pick<UserProgressData, 'manualActivityHistory' | 'manualActivityEpoch'> => {
  const localEpoch = manualActivityEpoch(local);
  const remoteEpoch = manualActivityEpoch(remote);
  const epoch = Math.max(localEpoch, remoteEpoch);
  return {
    manualActivityEpoch: epoch,
    manualActivityHistory: sanitizeManualActivityHistory([
      ...(localEpoch === epoch ? manualActivityEntries(local) : []),
      ...(remoteEpoch === epoch ? manualActivityEntries(remote) : []),
    ]),
  };
};
export function mergeProgressData(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined,
  preferNewerCount = false
): UserProgressData {
  if (!local && !remote) return {} as UserProgressData;
  if (!local) return structuredClone(remote!);
  if (!remote) return structuredClone(local);
  const localEpoch = toProgressEpoch(local);
  const remoteEpoch = toProgressEpoch(remote);
  if (remoteEpoch > localEpoch) {
    warnDroppedStoryChapters(
      'remote',
      local.storyChapters,
      remote.storyChapters,
      localEpoch,
      remoteEpoch
    );
    return { ...structuredClone(remote), progressEpoch: remoteEpoch };
  }
  if (localEpoch > remoteEpoch) {
    warnDroppedStoryChapters(
      'local',
      remote.storyChapters,
      local.storyChapters,
      localEpoch,
      remoteEpoch
    );
    return { ...structuredClone(local), progressEpoch: localEpoch };
  }
  const mergeTaskCompletion = (
    localComp: RawTaskCompletion,
    remoteComp: RawTaskCompletion
  ): TaskCompletion | undefined => {
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
    ...mergeManualActivityHistory(local, remote),
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
    taskObjectives: mergeCountableObjects(
      local.taskObjectives,
      remote.taskObjectives,
      preferNewerCount
    ),
    hideoutModules: mergeHideoutModules(local.hideoutModules, remote.hideoutModules),
    hideoutParts: mergeCountableObjects(local.hideoutParts, remote.hideoutParts, preferNewerCount),
    storyChapters: mergeStoryChapterProgress(local.storyChapters, remote.storyChapters),
    taskAvailability: mergeTaskAvailability(local.taskAvailability, remote.taskAvailability),
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
/**
 * Merges two copies of one mode where `preferred` is the newer copy: unions progress like
 * `mergeProgressData`, but takes single-value fields from `preferred` so its deletions stick.
 */
export const mergePreferringSingleValues = (
  other: UserProgressData,
  preferred: UserProgressData
): UserProgressData => ({
  ...mergeProgressData(other, preferred, true),
  displayName: preferred.displayName,
  pmcFaction: preferred.pmcFaction,
  xpOffset: preferred.xpOffset,
  skillOffsets: preferred.skillOffsets,
});
