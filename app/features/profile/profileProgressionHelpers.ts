import { capApiTaskUpdates } from '@tarkovtracker/progress-contracts/apiTaskUpdates';
import { isGameMode, type GameMode } from '@/utils/constants';
import { sanitizeTaskAvailabilityMap } from '@/utils/taskAvailabilityConfirmation';
import type { ApiUpdateMeta, UserProgressData } from '@/stores/progressState';
export const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');
export const normalizeMode = (value: unknown): GameMode | null => {
  if (Array.isArray(value)) {
    return normalizeMode(value[0]);
  }
  return isGameMode(value) ? value : null;
};
export const normalizeUserId = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return normalizeUserId(value[0]);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
};
export const normalizeTimestamp = (value: number | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 1_000_000_000_000) {
    return Math.round(value * 1000);
  }
  return Math.round(value);
};
export const countDaysInclusive = (start: number, end: number): number => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 1;
  }
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
};
const normalizeApiUpdateMeta = (value: unknown): ApiUpdateMeta | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.id !== 'string' || typeof value.at !== 'number' || !Number.isFinite(value.at)) {
    return undefined;
  }
  if (value.source !== 'api') {
    return undefined;
  }
  const { tasks, taskCount } = capApiTaskUpdates(value.tasks, value.taskCount);
  return {
    at: value.at,
    id: value.id,
    source: 'api',
    tasks: Array.isArray(value.tasks) ? tasks : undefined,
    ...(taskCount !== undefined ? { taskCount } : {}),
  };
};
export const normalizeSharedProgressData = (
  value: unknown,
  defaultProgressData: UserProgressData
): UserProgressData => {
  if (!isRecord(value)) {
    return structuredClone(defaultProgressData);
  }
  const level =
    typeof value.level === 'number' && Number.isFinite(value.level)
      ? Math.max(1, Math.round(value.level))
      : 1;
  const pmcFaction = value.pmcFaction === 'BEAR' ? 'BEAR' : 'USEC';
  const traders = isRecord(value.traders)
    ? (value.traders as UserProgressData['traders'])
    : defaultProgressData.traders;
  const skills = isRecord(value.skills)
    ? (value.skills as UserProgressData['skills'])
    : defaultProgressData.skills;
  const taskObjectives = isRecord(value.taskObjectives)
    ? (value.taskObjectives as UserProgressData['taskObjectives'])
    : defaultProgressData.taskObjectives;
  const taskCompletions = isRecord(value.taskCompletions)
    ? (value.taskCompletions as UserProgressData['taskCompletions'])
    : defaultProgressData.taskCompletions;
  const hideoutParts = isRecord(value.hideoutParts)
    ? (value.hideoutParts as UserProgressData['hideoutParts'])
    : defaultProgressData.hideoutParts;
  const hideoutModules = isRecord(value.hideoutModules)
    ? (value.hideoutModules as UserProgressData['hideoutModules'])
    : defaultProgressData.hideoutModules;
  const skillOffsets = isRecord(value.skillOffsets)
    ? (value.skillOffsets as UserProgressData['skillOffsets'])
    : defaultProgressData.skillOffsets;
  const storyChapters = isRecord(value.storyChapters)
    ? (value.storyChapters as UserProgressData['storyChapters'])
    : defaultProgressData.storyChapters;
  return {
    displayName:
      typeof value.displayName === 'string' && value.displayName.trim().length > 0
        ? value.displayName
        : null,
    hideoutModules,
    hideoutParts,
    lastApiUpdate: normalizeApiUpdateMeta(value.lastApiUpdate),
    level,
    pmcFaction,
    prestigeLevel:
      typeof value.prestigeLevel === 'number' && Number.isFinite(value.prestigeLevel)
        ? Math.max(0, Math.round(value.prestigeLevel))
        : 0,
    skillOffsets,
    skills,
    storyChapters,
    taskCompletions,
    taskAvailability: sanitizeTaskAvailabilityMap(value.taskAvailability),
    taskObjectives,
    traders,
    xpOffset:
      typeof value.xpOffset === 'number' && Number.isFinite(value.xpOffset) ? value.xpOffset : 0,
  };
};
