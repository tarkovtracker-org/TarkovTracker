import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
type TaskStateFlags = {
  isComplete: Ref<boolean>;
  isFailed: Ref<boolean>;
  isActive: Ref<boolean>;
  isSuccessful: Ref<boolean>;
  isLocked: Ref<boolean>;
  isInvalid: Ref<boolean>;
};
/**
 * Shared helper to check if a task is successfully completed (complete and not failed).
 * Use this when you need a non-reactive one-time check.
 *
 * @param taskId - The task ID to check
 * @returns true if the task is complete and not failed
 */
export function isTaskSuccessful(taskId: string): boolean {
  const tarkovStore = useTarkovStore();
  return tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
}
/**
 * Composable for cached task status lookups.
 * Consolidates multiple store accesses into a single composable with memoized computed properties.
 *
 * @param taskId - A reactive getter or ref for the task ID
 * @returns An object with reactive task state properties
 */
export function useTaskState(taskId: MaybeRefOrGetter<string>): TaskStateFlags {
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const isComplete = computed(() => tarkovStore.isTaskComplete(toValue(taskId)));
  const isFailed = computed(() => tarkovStore.isTaskFailed(toValue(taskId)));
  const isActive = computed(() => tarkovStore.isTaskActive(toValue(taskId)));
  const isSuccessfulComputed = computed(() => isComplete.value && !isFailed.value);
  const isLocked = computed(() => {
    const id = toValue(taskId);
    return progressStore.unlockedTasks[id]?.self !== true && !isComplete.value && !isActive.value;
  });
  const isInvalid = computed(() => {
    const id = toValue(taskId);
    return progressStore.invalidTasks[id]?.self === true && !isComplete.value;
  });
  return {
    isComplete,
    isFailed,
    isActive,
    isSuccessful: isSuccessfulComputed,
    isLocked,
    isInvalid,
  };
}
