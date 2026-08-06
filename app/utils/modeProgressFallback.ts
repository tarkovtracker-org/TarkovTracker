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
export const resolveModeProgressData = <T>(
  mode: GameMode,
  normalizedProgress: T | null | undefined,
  legacyProgress: LegacyModeProgressRow<T> | null | undefined
): T | null => {
  if (normalizedProgress !== null && normalizedProgress !== undefined) {
    return normalizedProgress;
  }
  if (mode === GAME_MODES.PVP) return legacyProgress?.pvp_data ?? null;
  if (mode === GAME_MODES.PVE) return legacyProgress?.pve_data ?? null;
  return null;
};
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const countCompletedTasks = (value: unknown): number => {
  const taskCompletions = asRecord(value);
  if (!taskCompletions) return 0;
  return Object.values(taskCompletions).filter((task) => asRecord(task)?.complete === true).length;
};
const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
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
