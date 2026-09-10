import {
  MANUAL_ACTIVITY_ACTIONS,
  MANUAL_ACTIVITY_TYPES,
  type ManualActivityAction,
  type ManualActivityEntry,
  type ManualActivityType,
} from '@/types/progress';
import {
  ACTIVE_SEASON_NUMBER,
  GAME_MODE_VALUES,
  GAME_MODES,
  MAX_SKILL_LEVEL,
  type GameMode,
} from '@/utils/constants';
import type { ApiTaskUpdate, ApiUpdateMeta, UserState } from '@/stores/progressState';
type UserProgressData = UserState['pvp'];
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const sanitizeDisplayName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 64) : null;
};
export const sanitizeFaction = (value: unknown): 'BEAR' | 'USEC' =>
  value === 'BEAR' ? 'BEAR' : 'USEC';
export const sanitizeTaskCompletionMap = (value: unknown): UserProgressData['taskCompletions'] => {
  if (!isRecord(value)) {
    return {};
  }
  const sanitized: UserProgressData['taskCompletions'] = {};
  for (const [taskId, completion] of Object.entries(value)) {
    if (typeof completion === 'boolean') {
      sanitized[taskId] = { complete: completion, failed: false };
      continue;
    }
    if (!isRecord(completion)) {
      continue;
    }
    const normalized: UserProgressData['taskCompletions'][string] = {};
    if (typeof completion.complete === 'boolean') {
      normalized.complete = completion.complete;
    }
    if (typeof completion.failed === 'boolean') {
      normalized.failed = completion.failed;
    }
    if (typeof completion.manual === 'boolean') {
      normalized.manual = completion.manual;
    }
    const timestamp = toFiniteNumber(completion.timestamp);
    if (timestamp !== null) {
      normalized.timestamp = Math.max(0, Math.trunc(timestamp));
    }
    if (Object.keys(normalized).length > 0) {
      sanitized[taskId] = normalized;
    }
  }
  return sanitized;
};
export const sanitizeObjectiveProgressMap = (
  value: unknown
): UserProgressData['taskObjectives'] => {
  if (!isRecord(value)) {
    return {};
  }
  const sanitized: UserProgressData['taskObjectives'] = {};
  for (const [objectiveId, objective] of Object.entries(value)) {
    if (!isRecord(objective)) {
      continue;
    }
    const normalized: UserProgressData['taskObjectives'][string] = {};
    if (typeof objective.complete === 'boolean') {
      normalized.complete = objective.complete;
    }
    const count = toFiniteNumber(objective.count);
    if (count !== null) {
      normalized.count = Math.max(0, Math.trunc(count));
    }
    const timestamp = toFiniteNumber(objective.timestamp);
    if (timestamp !== null) {
      normalized.timestamp = Math.max(0, Math.trunc(timestamp));
    }
    if (Object.keys(normalized).length > 0) {
      sanitized[objectiveId] = normalized;
    }
  }
  return sanitized;
};
export const sanitizeHideoutModuleMap = (value: unknown): UserProgressData['hideoutModules'] => {
  if (!isRecord(value)) {
    return {};
  }
  const sanitized: UserProgressData['hideoutModules'] = {};
  for (const [moduleId, moduleValue] of Object.entries(value)) {
    if (!isRecord(moduleValue)) {
      continue;
    }
    const normalized: UserProgressData['hideoutModules'][string] = {};
    if (typeof moduleValue.complete === 'boolean') {
      normalized.complete = moduleValue.complete;
    }
    const timestamp = toFiniteNumber(moduleValue.timestamp);
    if (timestamp !== null) {
      normalized.timestamp = Math.max(0, Math.trunc(timestamp));
    }
    if (Object.keys(normalized).length > 0) {
      sanitized[moduleId] = normalized;
    }
  }
  return sanitized;
};
export const sanitizeTraderMap = (value: unknown): UserProgressData['traders'] => {
  if (!isRecord(value)) {
    return {};
  }
  const sanitized: UserProgressData['traders'] = {};
  for (const [traderId, traderValue] of Object.entries(value)) {
    if (!isRecord(traderValue)) {
      continue;
    }
    const level = toFiniteNumber(traderValue.level);
    const reputation = toFiniteNumber(traderValue.reputation);
    if (level === null && reputation === null) {
      continue;
    }
    sanitized[traderId] = {
      level: level !== null ? Math.max(1, Math.trunc(level)) : 1,
      reputation: reputation !== null ? reputation : 0,
    };
  }
  return sanitized;
};
export const sanitizeNumberMap = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }
  const sanitized: Record<string, number> = {};
  for (const [key, numberValue] of Object.entries(value)) {
    const normalized = toFiniteNumber(numberValue);
    if (normalized !== null) {
      sanitized[key] = normalized;
    }
  }
  return sanitized;
};
export const sanitizeStoryChaptersMap = (value: unknown): UserProgressData['storyChapters'] => {
  if (!isRecord(value)) {
    return {};
  }
  const sanitized: UserProgressData['storyChapters'] = {};
  for (const [chapterId, chapter] of Object.entries(value)) {
    if (!isRecord(chapter)) {
      continue;
    }
    const normalized: UserProgressData['storyChapters'][string] = {};
    if (typeof chapter.complete === 'boolean') {
      normalized.complete = chapter.complete;
    }
    if (isRecord(chapter.objectives)) {
      const objectives: Record<string, { complete?: boolean; timestamp?: number }> = {};
      for (const [objectiveId, objective] of Object.entries(chapter.objectives)) {
        if (!isRecord(objective)) {
          continue;
        }
        const normalizedObjective: { complete?: boolean; timestamp?: number } = {};
        if (typeof objective.complete === 'boolean') {
          normalizedObjective.complete = objective.complete;
        }
        const timestamp = toFiniteNumber(objective.timestamp);
        if (timestamp !== null) {
          normalizedObjective.timestamp = Math.max(0, Math.trunc(timestamp));
        }
        if (Object.keys(normalizedObjective).length > 0) {
          objectives[objectiveId] = normalizedObjective;
        }
      }
      if (Object.keys(objectives).length > 0) {
        normalized.objectives = objectives;
      }
    }
    if (Object.keys(normalized).length > 0) {
      sanitized[chapterId] = normalized;
    }
  }
  return sanitized;
};
const API_UPDATE_HISTORY_LIMIT = 50;
// Manual activity entries are cosmetic feed rows that ride along in the synced
// progress blob. The limit and the string clamps keep the blob well below the
// sync RPC's 512 KiB payload ceiling even when all three modes are full.
export const MANUAL_ACTIVITY_HISTORY_LIMIT = 50;
const MANUAL_ACTIVITY_ID_MAX_LENGTH = 128;
const MANUAL_ACTIVITY_TITLE_MAX_LENGTH = 200;
const MANUAL_ACTIVITY_DETAILS_MAX_LENGTH = 300;
export const createDefaultOwnedProgressData = (): UserProgressData => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions: {},
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  progressEpoch: 0,
  skillOffsets: {},
  storyChapters: {},
  apiUpdateHistory: [],
  manualActivityHistory: [],
});
const sanitizeApiTaskUpdates = (value: unknown): ApiTaskUpdate[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is ApiTaskUpdate =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      ['completed', 'failed', 'uncompleted'].includes(entry.state as string)
  );
};
export const sanitizeApiUpdateMeta = (value: unknown): ApiUpdateMeta | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const at = toFiniteNumber(value.at);
  if (value.source !== 'api' || typeof value.id !== 'string' || !value.id || at === null) {
    return undefined;
  }
  const tasks = sanitizeApiTaskUpdates(value.tasks);
  return {
    at: Math.max(0, Math.trunc(at)),
    id: value.id,
    source: 'api',
    ...(tasks.length > 0 ? { tasks } : {}),
  };
};
export const sanitizeApiUpdateHistory = (value: unknown): ApiUpdateMeta[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, ApiUpdateMeta>();
  for (const entry of value) {
    const normalized = sanitizeApiUpdateMeta(entry);
    if (!normalized) {
      continue;
    }
    const existing = deduped.get(normalized.id);
    if (!existing || normalized.at >= existing.at) {
      deduped.set(normalized.id, normalized);
    }
  }
  return Array.from(deduped.values())
    .sort((left, right) => right.at - left.at)
    .slice(0, API_UPDATE_HISTORY_LIMIT);
};
export const sanitizeManualActivityEntry = (value: unknown): ManualActivityEntry | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const timestamp = toFiniteNumber(value.timestamp);
  if (
    !id ||
    !title ||
    timestamp === null ||
    !MANUAL_ACTIVITY_TYPES.includes(value.type as ManualActivityType) ||
    !MANUAL_ACTIVITY_ACTIONS.includes(value.action as ManualActivityAction)
  ) {
    return undefined;
  }
  const sanitized: ManualActivityEntry = {
    id: id.slice(0, MANUAL_ACTIVITY_ID_MAX_LENGTH),
    timestamp: Math.max(0, Math.trunc(timestamp)),
    type: value.type as ManualActivityType,
    action: value.action as ManualActivityAction,
    title: title.slice(0, MANUAL_ACTIVITY_TITLE_MAX_LENGTH),
  };
  const details = typeof value.details === 'string' ? value.details.trim() : '';
  if (details) {
    sanitized.details = details.slice(0, MANUAL_ACTIVITY_DETAILS_MAX_LENGTH);
  }
  return sanitized;
};
export const sanitizeManualActivityHistory = (value: unknown): ManualActivityEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, ManualActivityEntry>();
  for (const entry of value) {
    const normalized = sanitizeManualActivityEntry(entry);
    if (!normalized) {
      continue;
    }
    const existing = deduped.get(normalized.id);
    if (!existing || normalized.timestamp >= existing.timestamp) {
      deduped.set(normalized.id, normalized);
    }
  }
  return Array.from(deduped.values())
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MANUAL_ACTIVITY_HISTORY_LIMIT);
};
const sanitizeGameMode = (value: unknown): GameMode => {
  return GAME_MODE_VALUES.includes(value as GameMode) ? (value as GameMode) : GAME_MODES.PVP;
};
export const sanitizeGameEdition = (value: unknown): number => {
  const edition =
    typeof value === 'string' && value.trim() !== ''
      ? toFiniteNumber(Number(value))
      : toFiniteNumber(value);
  if (edition === null) {
    return 1;
  }
  return Math.max(1, Math.min(6, Math.trunc(edition)));
};
export const sanitizeTarkovUid = (value: unknown): number | null => {
  const uid = toFiniteNumber(value);
  if (uid === null) {
    return null;
  }
  const normalized = Math.trunc(uid);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
};
export const hasDeprecatedTarkovDevProfileData = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'tarkovDevProfile')) {
    return true;
  }
  return ['pvp', 'pve', 'seasonal'].some((mode) => hasDeprecatedTarkovDevProfileData(value[mode]));
};
// Keep this canonical sanitizer aligned with the persisted DB sanitizer in the
// tarkovDevProfile cleanup migration when changing stored progress fields.
export const sanitizeOwnedProgressData = (value: unknown): UserProgressData => {
  const sanitized: UserProgressData = createDefaultOwnedProgressData();
  if (!isRecord(value)) {
    return sanitized;
  }
  const level = toFiniteNumber(value.level);
  const xpOffset = toFiniteNumber(value.xpOffset);
  const prestigeLevel = toFiniteNumber(value.prestigeLevel);
  const progressEpoch = toFiniteNumber(value.progressEpoch);
  const lastApiUpdate = sanitizeApiUpdateMeta(value.lastApiUpdate);
  sanitized.displayName = sanitizeDisplayName(value.displayName);
  sanitized.hideoutModules = sanitizeHideoutModuleMap(value.hideoutModules);
  sanitized.hideoutParts = sanitizeObjectiveProgressMap(value.hideoutParts);
  sanitized.pmcFaction = sanitizeFaction(value.pmcFaction);
  sanitized.skillOffsets = sanitizeNumberMap(value.skillOffsets);
  sanitized.skills = Object.fromEntries(
    Object.entries(sanitizeNumberMap(value.skills)).map(([skillName, level]) => [
      skillName,
      Math.max(0, Math.min(MAX_SKILL_LEVEL, level)),
    ])
  );
  sanitized.storyChapters = sanitizeStoryChaptersMap(value.storyChapters);
  sanitized.taskCompletions = sanitizeTaskCompletionMap(value.taskCompletions);
  sanitized.taskObjectives = sanitizeObjectiveProgressMap(value.taskObjectives);
  sanitized.traders = sanitizeTraderMap(value.traders);
  sanitized.apiUpdateHistory = sanitizeApiUpdateHistory(value.apiUpdateHistory);
  sanitized.manualActivityHistory = sanitizeManualActivityHistory(value.manualActivityHistory);
  if (level !== null) {
    sanitized.level = Math.max(1, Math.trunc(level));
  }
  if (xpOffset !== null) {
    sanitized.xpOffset = Math.trunc(xpOffset);
  }
  if (prestigeLevel !== null) {
    sanitized.prestigeLevel = Math.max(0, Math.min(6, Math.trunc(prestigeLevel)));
  }
  if (progressEpoch !== null) {
    sanitized.progressEpoch = Math.max(0, Math.trunc(progressEpoch));
  }
  if (lastApiUpdate) {
    sanitized.lastApiUpdate = lastApiUpdate;
    if (!sanitized.apiUpdateHistory.some((entry) => entry.id === lastApiUpdate.id)) {
      sanitized.apiUpdateHistory = sanitizeApiUpdateHistory([
        lastApiUpdate,
        ...sanitized.apiUpdateHistory,
      ]);
    }
  }
  return sanitized;
};
const isStaleSeasonNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value !== ACTIVE_SEASON_NUMBER;
export const reconcileSeasonalProgressSeason = (
  seasonal: UserProgressData,
  storedSeasonNumber: unknown
): { seasonal: UserProgressData; seasonalSeasonNumber: number } => ({
  seasonal: isStaleSeasonNumber(storedSeasonNumber) ? createDefaultOwnedProgressData() : seasonal,
  seasonalSeasonNumber: ACTIVE_SEASON_NUMBER,
});
export const sanitizeOwnedUserState = (value: unknown): UserState => {
  if (!isRecord(value)) {
    return {
      currentGameMode: GAME_MODES.PVP,
      gameEdition: 1,
      tarkovUid: null,
      pvp: createDefaultOwnedProgressData(),
      pve: createDefaultOwnedProgressData(),
      seasonal: createDefaultOwnedProgressData(),
      seasonalSeasonNumber: ACTIVE_SEASON_NUMBER,
    };
  }
  return {
    currentGameMode: sanitizeGameMode(value.currentGameMode),
    gameEdition: sanitizeGameEdition(value.gameEdition),
    tarkovUid: sanitizeTarkovUid(value.tarkovUid),
    pvp: sanitizeOwnedProgressData(value.pvp),
    pve: sanitizeOwnedProgressData(value.pve),
    ...reconcileSeasonalProgressSeason(
      sanitizeOwnedProgressData(value.seasonal),
      value.seasonalSeasonNumber
    ),
  };
};
export const sanitizeTeammateProgressData = (value: unknown): Partial<UserProgressData> => {
  if (!isRecord(value)) {
    return {};
  }
  const level = toFiniteNumber(value.level);
  const xpOffset = toFiniteNumber(value.xpOffset);
  const prestigeLevel = toFiniteNumber(value.prestigeLevel);
  const sanitized: Partial<UserProgressData> = {
    displayName: sanitizeDisplayName(value.displayName),
    hideoutModules: sanitizeHideoutModuleMap(value.hideoutModules),
    hideoutParts: sanitizeObjectiveProgressMap(value.hideoutParts),
    pmcFaction: sanitizeFaction(value.pmcFaction),
    skillOffsets: sanitizeNumberMap(value.skillOffsets),
    skills: sanitizeNumberMap(value.skills),
    storyChapters: sanitizeStoryChaptersMap(value.storyChapters),
    taskCompletions: sanitizeTaskCompletionMap(value.taskCompletions),
    taskObjectives: sanitizeObjectiveProgressMap(value.taskObjectives),
    traders: sanitizeTraderMap(value.traders),
  };
  if (level !== null) {
    sanitized.level = Math.max(1, Math.trunc(level));
  }
  if (xpOffset !== null) {
    sanitized.xpOffset = Math.trunc(xpOffset);
  }
  if (prestigeLevel !== null) {
    sanitized.prestigeLevel = Math.max(0, Math.min(6, Math.trunc(prestigeLevel)));
  }
  return sanitized;
};
