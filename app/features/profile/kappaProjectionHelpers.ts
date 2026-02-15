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
  _sampleDays: number
): 'high' | 'low' | 'medium' | null => {
  if (sampleCount < 3) return null;
  return 'low';
};
export const dampenPace = (rawPacePerDay: number, _sampleDays: number): number => {
  return rawPacePerDay;
};
