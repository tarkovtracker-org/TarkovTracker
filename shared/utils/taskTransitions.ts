/**
 * Explicit task-state writes shared by progress writers.
 *
 * Runtime-independent: must not import Nuxt, Vue, or Worker modules. Writers store only the task
 * IDs a caller requested; dependents are never rewritten, so an implicit write cannot overwrite a
 * concurrent or explicit update. Completing, failing, or uncompleting a task clears `active`.
 */
export type TransitionTaskState = 'active' | 'completed' | 'uncompleted' | 'failed';
type TransitionCompletion = {
  complete?: boolean;
  failed?: boolean;
  active?: boolean;
  timestamp?: number;
};
type Completions = Record<string, TransitionCompletion>;
type TaskTransitionOptions = {
  timestamp: number;
  updates?: Map<string, TransitionTaskState>;
};
const toTransitionTaskState = (completion?: TransitionCompletion): TransitionTaskState => {
  if (completion?.failed === true) return 'failed';
  if (completion?.complete === true) return 'completed';
  return completion?.active === true ? 'active' : 'uncompleted';
};
export function setTaskState(
  completions: Completions,
  taskId: string,
  state: TransitionTaskState,
  { timestamp, updates }: TaskTransitionOptions
): void {
  const previous = toTransitionTaskState(completions[taskId]);
  completions[taskId] = {
    complete: state === 'completed' || state === 'failed',
    failed: state === 'failed',
    active: state === 'active',
    timestamp,
  };
  if (updates && previous !== state) updates.set(taskId, state);
}
