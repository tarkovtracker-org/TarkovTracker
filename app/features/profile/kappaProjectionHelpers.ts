import type { Task } from '@/types/tarkov';
export interface CriticalPathResult {
  floor: number;
  longestChainTaskId: string | null;
}
export const computeCriticalPathFloor = (
  _remainingKappaTasks: Task[],
  _allTasksById: Map<string, Task>,
  _completedTaskIds: Set<string>,
  _playerLevel: number
): CriticalPathResult => {
  return { floor: 0, longestChainTaskId: null };
};
export const computeConfidence = (
  sampleCount: number,
  sampleDays: number
): 'high' | 'low' | 'medium' | null => {
  if (sampleCount < 3) return null;
  if (sampleCount >= 15 && sampleDays >= 7) return 'high';
  if (sampleCount >= 7 && sampleDays >= 3) return 'medium';
  return 'low';
};
const DAMPEN_THRESHOLD_DAYS = 3;
export const dampenPace = (rawPacePerDay: number, sampleDays: number): number => {
  if (sampleDays >= DAMPEN_THRESHOLD_DAYS) return rawPacePerDay;
  return rawPacePerDay * (sampleDays / DAMPEN_THRESHOLD_DAYS);
};
