import type { Task } from '@/types/tarkov';
export interface CriticalPathResult {
  floor: number;
  longestChainTaskId: string | null;
}
export const computeCriticalPathFloor = (
  remainingKappaTasks: Task[],
  allTasksById: Map<string, Task>,
  completedTaskIds: Set<string>,
  playerLevel: number
): CriticalPathResult => {
  if (remainingKappaTasks.length === 0) {
    return { floor: 0, longestChainTaskId: null };
  }
  const memo = new Map<string, number>();
  const getChainDepth = (taskId: string): number => {
    if (completedTaskIds.has(taskId)) return 0;
    const cached = memo.get(taskId);
    if (cached !== undefined) return cached;
    memo.set(taskId, 0);
    const task = allTasksById.get(taskId);
    if (!task) {
      memo.set(taskId, 1);
      return 1;
    }
    let maxPredecessorDepth = 0;
    for (const predId of task.predecessors ?? []) {
      maxPredecessorDepth = Math.max(maxPredecessorDepth, getChainDepth(predId));
    }
    const depth = maxPredecessorDepth + 1;
    memo.set(taskId, depth);
    return depth;
  };
  let maxFloor = 0;
  let longestChainTaskId: string | null = null;
  for (const task of remainingKappaTasks) {
    const chainDepth = getChainDepth(task.id);
    let levelGap = 0;
    if (task.minPlayerLevel && task.minPlayerLevel > playerLevel) {
      levelGap = task.minPlayerLevel - playerLevel;
    }
    const taskFloor = chainDepth + levelGap;
    if (taskFloor > maxFloor) {
      maxFloor = taskFloor;
      longestChainTaskId = task.id;
    }
  }
  return { floor: maxFloor, longestChainTaskId };
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
