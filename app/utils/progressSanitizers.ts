import type { UserState } from '@/stores/progressState';
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
