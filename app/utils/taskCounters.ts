import type { TaskCounterDerivation } from '@/types/tarkov';
/** Every task a derivation reads; a gate gets a derivation only when all of them exist. */
export const counterTaskIds = (counter: TaskCounterDerivation): string[] =>
  counter.type === 'taskGroupCompletions' ? counter.groups.flat() : counter.taskIds;
/** Units that each add one to the counter: a task, or a group once every member is complete. */
const counterUnits = (counter: TaskCounterDerivation): string[][] =>
  counter.type === 'taskGroupCompletions' ? counter.groups : counter.taskIds.map((id) => [id]);
export const counterValue = (
  counter: TaskCounterDerivation,
  isComplete: (taskId: string) => boolean
): number => counterUnits(counter).filter((unit) => unit.every(isComplete)).length;
