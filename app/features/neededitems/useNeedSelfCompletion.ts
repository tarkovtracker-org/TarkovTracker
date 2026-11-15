import { isTaskSuccessful } from '@/composables/useTaskState';
import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
type Need = NeededItemTaskObjective | NeededItemHideoutModule;
/**
 * A need is finished for the user once its parent task is turned in successfully, a task whose
 * completion fails that parent has been turned in (the other branch was chosen), or its parent
 * module is built. Items and Needs entries share this rule so a finished need is read-only in both.
 */
export function useNeedSelfCompletion() {
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  // `alternativeTaskSources[T]` lists the tasks whose completion fails T, as on the task card.
  const isFailedByAlternative = (taskId: string) =>
    metadataStore.alternativeTaskSources[taskId]?.some(isTaskSuccessful) ?? false;
  const isModuleBuilt = (need: NeededItemHideoutModule) =>
    progressStore.moduleCompletions?.[need.hideoutModule.id]?.['self'] ?? false;
  const isSelfCompleted = (need: Need): boolean =>
    need.needType === 'hideoutModule'
      ? isModuleBuilt(need)
      : isTaskSuccessful(need.taskId) || isFailedByAlternative(need.taskId);
  return { isSelfCompleted, isTaskSuccessful };
}
