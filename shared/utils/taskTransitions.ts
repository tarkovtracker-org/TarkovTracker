/**
 * Explicit task-state transitions shared by progress writers.
 *
 * Runtime-independent: must not import Nuxt, Vue, or Worker modules. Changing a task resets
 * dependents that require it `complete`: they lock when it leaves `completed`, and become
 * available again once every requirement is met.
 */
export type TransitionTaskState = 'completed' | 'uncompleted' | 'failed';
export type TransitionCompletion = { complete?: boolean; failed?: boolean; timestamp?: number };
export type TransitionTask = {
  id: string;
  taskRequirements?: Array<{ task?: { id: string }; status?: string[] } | null | undefined>;
};
type Completions = Record<string, TransitionCompletion>;
export type TaskTransitionOptions = {
  timestamp: number;
  updates?: Map<string, TransitionTaskState>;
  protectedTaskIds?: ReadonlySet<string>;
};
const toTransitionTaskState = (completion?: TransitionCompletion): TransitionTaskState => {
  if (completion?.failed === true) return 'failed';
  return completion?.complete === true ? 'completed' : 'uncompleted';
};
function setTaskState(
  completions: Completions,
  taskId: string,
  state: TransitionTaskState,
  { timestamp, updates }: TaskTransitionOptions
): void {
  const previous = toTransitionTaskState(completions[taskId]);
  completions[taskId] = {
    complete: state !== 'uncompleted',
    failed: state === 'failed',
    timestamp,
  };
  if (updates && previous !== state) updates.set(taskId, state);
}
const SATISFIED_BY_NEW_STATE: Record<TransitionTaskState, string[]> = {
  completed: ['complete', 'active'],
  failed: ['failed'],
  uncompleted: ['active'],
};
const RECORDED_SATISFIERS: Array<[string, (completion?: TransitionCompletion) => boolean]> = [
  ['complete', (completion) => completion?.complete === true && !completion.failed],
  [
    'active',
    (completion) =>
      completion?.complete === false || (completion?.complete === true && !completion.failed),
  ],
  ['failed', (completion) => completion?.failed === true],
];
const isRequirementMet = (
  requirement: NonNullable<TransitionTask['taskRequirements']>[number],
  changed: { taskId: string; state: TransitionTaskState },
  completions: Completions
): boolean => {
  const requiredTaskId = requirement?.task?.id;
  if (!requiredTaskId) return true;
  const statuses = requirement.status ?? [];
  if (requiredTaskId === changed.taskId) {
    return SATISFIED_BY_NEW_STATE[changed.state].some((status) => statuses.includes(status));
  }
  return RECORDED_SATISFIERS.some(
    ([status, satisfied]) => statuses.includes(status) && satisfied(completions[requiredTaskId])
  );
};
const requiresTaskComplete = (task: TransitionTask, taskId: string): boolean =>
  (task.taskRequirements ?? []).some(
    (requirement) =>
      requirement?.task?.id === taskId && (requirement.status ?? []).includes('complete')
  );
const shouldResetDependent = (
  task: TransitionTask,
  changed: { taskId: string; state: TransitionTaskState },
  completions: Completions
): boolean => {
  if (!requiresTaskComplete(task, changed.taskId)) return false;
  if (changed.state !== 'completed') return true;
  return (task.taskRequirements ?? []).every((requirement) =>
    isRequirementMet(requirement, changed, completions)
  );
};
/** Apply `state` to `taskId`, then reset every dependent the change locks or unlocks. */
export function applyTaskTransition(
  completions: Completions,
  tasks: readonly TransitionTask[],
  changed: { taskId: string; state: TransitionTaskState },
  options: TaskTransitionOptions
): void {
  setTaskState(completions, changed.taskId, changed.state, options);
  for (const task of tasks) {
    if (options.protectedTaskIds?.has(task.id)) continue;
    if (!shouldResetDependent(task, changed, completions)) continue;
    setTaskState(completions, task.id, 'uncompleted', options);
  }
}
