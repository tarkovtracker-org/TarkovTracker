import type { TaskCounterDerivation, TaskCounterGroup } from '@/types/tarkov';
export const groupMembers = (group: TaskCounterGroup): string[] =>
  Array.isArray(group) ? group : group.anyOf;
/** A fresh copy, so normalized or attached derivations never share arrays. */
export const copyCounterGroup = (group: TaskCounterGroup): TaskCounterGroup =>
  Array.isArray(group) ? [...group] : { anyOf: [...group.anyOf] };
/** Every task a derivation reads; a gate gets a derivation only when all of them exist. */
export const counterTaskIds = (counter: TaskCounterDerivation): string[] =>
  counter.type === 'taskGroupCompletions' ? counter.groups.flatMap(groupMembers) : counter.taskIds;
/** Units that each add one to the counter: a task, or a group once it is settled complete. */
const counterUnits = (counter: TaskCounterDerivation): TaskCounterGroup[] =>
  counter.type === 'taskGroupCompletions' ? counter.groups : counter.taskIds.map((id) => [id]);
const groupComplete = (
  group: TaskCounterGroup,
  isComplete: (taskId: string) => boolean
): boolean => (Array.isArray(group) ? group.every(isComplete) : group.anyOf.some(isComplete));
export const counterValue = (
  counter: TaskCounterDerivation,
  isComplete: (taskId: string) => boolean
): number => counterUnits(counter).filter((unit) => groupComplete(unit, isComplete)).length;
