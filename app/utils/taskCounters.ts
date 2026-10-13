import type { TaskCounterDerivation, TaskCounterGroup } from '@/types/tarkov';
const isTaskId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
/** Counter contract shared by the server validator and the client normalizer. */
export const isCounterTaskIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isTaskId) &&
  new Set(value).size === value.length;
const isAnyOfGroup = (value: unknown): value is { anyOf: string[] } =>
  value !== null &&
  typeof value === 'object' &&
  Object.keys(value).join() === 'anyOf' &&
  isCounterTaskIds((value as { anyOf: unknown }).anyOf);
/** `{ anyOf }` needs at least two members; one member is just a single-task group. */
const isCounterGroup = (value: unknown): value is TaskCounterGroup =>
  isCounterTaskIds(value) || (isAnyOfGroup(value) && value.anyOf.length > 1);
/** A non-empty list of groups in which no task belongs to two groups. */
export const isCounterGroups = (value: unknown): value is TaskCounterGroup[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isCounterGroup) &&
  isCounterTaskIds(value.flatMap(groupMembers));
const groupMembers = (group: TaskCounterGroup): string[] =>
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
