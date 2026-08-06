import { GAME_MODES, type GameMode } from './constants';
export type LegacyModeProgressRow<T = unknown> = {
  pve_data?: T;
  pvp_data?: T;
};
export type LegacyModeProgressField = keyof LegacyModeProgressRow;
export const getLegacyModeProgressField = (mode: GameMode): LegacyModeProgressField | null => {
  if (mode === GAME_MODES.PVP) return 'pvp_data';
  if (mode === GAME_MODES.PVE) return 'pve_data';
  return null;
};
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const hasMaterializedProgress = (progress: unknown): boolean =>
  finiteNumberOrNull(asRecord(progress)?.level) !== null;
export const resolveModeProgressData = <T>(
  mode: GameMode,
  normalizedProgress: T | null | undefined,
  legacyProgress: LegacyModeProgressRow<T> | null | undefined
): T | null => {
  const normalized = normalizedProgress ?? null;
  const legacyField = getLegacyModeProgressField(mode);
  if (!legacyField) return normalized;
  if (hasMaterializedProgress(normalized)) return normalized;
  const legacy = (legacyProgress?.[legacyField] as T | undefined) ?? null;
  if (hasMaterializedProgress(legacy)) return legacy;
  return normalized ?? legacy;
};
const isCompletedTask = (task: unknown): boolean =>
  task === true || asRecord(task)?.complete === true;
const countCompletedTasks = (value: unknown): number => {
  const taskCompletions = asRecord(value);
  if (!taskCompletions) return 0;
  return Object.values(taskCompletions).filter(isCompletedTask).length;
};
export const summarizeModeProgressData = (
  progress: unknown
): { display_name: string | null; level: number | null; tasks_completed: number } => {
  const data = asRecord(progress);
  if (!data) {
    return { display_name: null, level: null, tasks_completed: 0 };
  }
  return {
    display_name: typeof data.displayName === 'string' ? data.displayName : null,
    level: finiteNumberOrNull(data.level),
    tasks_completed: countCompletedTasks(data.taskCompletions),
  };
};
