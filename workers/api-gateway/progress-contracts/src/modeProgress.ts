const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const hasMaterializedProgress = (progress: unknown): boolean =>
  finiteNumberOrNull(asRecord(progress)?.level) !== null;
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
