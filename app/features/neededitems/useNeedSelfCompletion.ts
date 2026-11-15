import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
type Need = NeededItemTaskObjective | NeededItemHideoutModule;
/**
 * A need is finished for the user once its parent task (or an alternative to it) is turned in
 * successfully, or its parent module is built. Items and Needs entries share this rule so a
 * finished need is read-only in both.
 */
export function useNeedSelfCompletion() {
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const isTaskSuccessful = (taskId: string) =>
    tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  const isAlternativeSuccessful = (taskId: string) =>
    metadataStore.alternativeTasks[taskId]?.some(isTaskSuccessful) ?? false;
  const isModuleBuilt = (need: NeededItemHideoutModule) =>
    progressStore.moduleCompletions?.[need.hideoutModule.id]?.['self'] ?? false;
  const isSelfCompleted = (need: Need): boolean =>
    need.needType === 'hideoutModule'
      ? isModuleBuilt(need)
      : isTaskSuccessful(need.taskId) || isAlternativeSuccessful(need.taskId);
  return { isSelfCompleted, isTaskSuccessful };
}
