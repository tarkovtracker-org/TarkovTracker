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
/**
 * Trim a string field and clamp it to `maxLength` code points. Blank and non-string values are
 * `null`. Clamping by code point matches PostgreSQL `left()`, so client and database sanitization
 * agree on the same id and cannot split a supplementary character into a lone surrogate, which
 * `jsonb` rejects.
 */
const sanitizeClampedText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return Array.from(trimmed).slice(0, maxLength).join('');
};
export const sanitizeDisplayName = (value: unknown): string | null =>
  sanitizeClampedText(value, 64);
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
const MANUAL_ACTIVITY_TYPE_VALUES: ReadonlySet<unknown> = new Set(MANUAL_ACTIVITY_TYPES);
const MANUAL_ACTIVITY_ACTION_VALUES: ReadonlySet<unknown> = new Set(MANUAL_ACTIVITY_ACTIONS);
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
  manualActivityEpoch: 0,
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
/** Keep only the newest entry per id, preserving first-seen order of the survivors. */
const dedupeNewestById = <T extends { id: string }>(
  entries: T[],
  getTimestamp: (entry: T) => number
): T[] => {
  const deduped = new Map<string, T>();
  for (const entry of entries) {
    const existing = deduped.get(entry.id);
    if (!existing || getTimestamp(entry) >= getTimestamp(existing)) {
      deduped.set(entry.id, entry);
    }
  }
  return Array.from(deduped.values());
};
/**
 * Normalization for API history stored in the progress blob: sanitize each
 * element, keep the newest entry per id, order newest first, and cap the length.
 */
const sanitizeHistory = <T extends { id: string }>(
  value: unknown,
  sanitizeEntry: (entry: unknown) => T | undefined,
  getTimestamp: (entry: T) => number,
  limit: number
): T[] => {
  const raw = Array.isArray(value) ? value : [];
  const sanitized = raw
    .map((entry) => sanitizeEntry(entry))
    .filter((entry): entry is T => entry !== undefined);
  return dedupeNewestById(sanitized, getTimestamp)
    .sort((left, right) => getTimestamp(right) - getTimestamp(left))
    .slice(0, limit);
};
export const sanitizeApiUpdateHistory = (value: unknown): ApiUpdateMeta[] =>
  sanitizeHistory(value, sanitizeApiUpdateMeta, (entry) => entry.at, API_UPDATE_HISTORY_LIMIT);
const sanitizeManualActivityType = (value: unknown): ManualActivityType | null =>
  MANUAL_ACTIVITY_TYPE_VALUES.has(value) ? (value as ManualActivityType) : null;
const sanitizeManualActivityAction = (value: unknown): ManualActivityAction | null =>
  MANUAL_ACTIVITY_ACTION_VALUES.has(value) ? (value as ManualActivityAction) : null;
const sanitizeEpochMs = (value: unknown): number | null => {
  const timestamp = toFiniteNumber(value);
  return timestamp === null
    ? null
    : Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(timestamp)));
};
type RequiredManualActivityFields = Omit<ManualActivityEntry, 'details'>;
/**
 * Validate the fields a manual activity entry cannot omit. Returns `null` when
 * any one of them is missing or malformed, so a partially valid row is dropped
 * rather than persisted with invented defaults.
 */
const sanitizeRequiredManualActivityFields = (
  value: Record<string, unknown>
): RequiredManualActivityFields | null => {
  const fields = {
    action: sanitizeManualActivityAction(value.action),
    id: sanitizeClampedText(value.id, MANUAL_ACTIVITY_ID_MAX_LENGTH),
    timestamp: sanitizeEpochMs(value.timestamp),
    title: sanitizeClampedText(value.title, MANUAL_ACTIVITY_TITLE_MAX_LENGTH),
    type: sanitizeManualActivityType(value.type),
  };
  return Object.values(fields).includes(null) ? null : (fields as RequiredManualActivityFields);
};
export const sanitizeManualActivityEntry = (value: unknown): ManualActivityEntry | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const fields = sanitizeRequiredManualActivityFields(value);
  if (fields === null) {
    return undefined;
  }
  const details = sanitizeClampedText(value.details, MANUAL_ACTIVITY_DETAILS_MAX_LENGTH);
  return details === null ? fields : { ...fields, details };
};
export const sanitizeManualActivityEpoch = (value: unknown): number => {
  const epoch = toFiniteNumber(value) ?? 0;
  return Math.max(0, Math.min(2147483647, Math.trunc(epoch)));
};
// PostgreSQL uses UTF-8 byte order (COLLATE "C") for the same tie-break fields.
const activityTextKey = (value: string): string =>
  Array.from(value, (character) => character.codePointAt(0)!.toString(16).padStart(6, '0')).join(
    ''
  );
const manualActivitySortKey = (entry: ManualActivityEntry): string =>
  [entry.id, entry.type, entry.action, entry.title, entry.details ?? '']
    .map(activityTextKey)
    .join('/');
const compareManualActivityEntries = (
  left: ManualActivityEntry,
  right: ManualActivityEntry
): number => {
  const timestampOrder = right.timestamp - left.timestamp;
  if (timestampOrder !== 0) return timestampOrder;
  const leftKey = manualActivitySortKey(left);
  const rightKey = manualActivitySortKey(right);
  return leftKey < rightKey ? -1 : Number(leftKey > rightKey);
};
export const sanitizeManualActivityHistory = (value: unknown): ManualActivityEntry[] => {
  const raw = Array.isArray(value) ? value : [];
  const ordered = raw
    .map(sanitizeManualActivityEntry)
    .filter((entry): entry is ManualActivityEntry => entry !== undefined)
    .sort(compareManualActivityEntries);
  const deduped = new Map<string, ManualActivityEntry>();
  for (const entry of ordered) {
    if (!deduped.has(entry.id)) deduped.set(entry.id, entry);
  }
  return Array.from(deduped.values()).slice(0, MANUAL_ACTIVITY_HISTORY_LIMIT);
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
  sanitized.manualActivityEpoch = sanitizeManualActivityEpoch(value.manualActivityEpoch);
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
