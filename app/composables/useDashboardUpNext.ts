import { useDashboardFilters } from '@/composables/useDashboardFilters';
import {
  lockedTraderUnlockTaskIds,
  pickClosestBlocked,
  rankUpNext,
  type UpNextContext,
  type UpNextItem,
  type UpNextState,
} from '@/features/dashboard/upNext';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODES, resolveTraderUnlockTaskIds } from '@/utils/constants';
import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
import { rewardTraderUnlockTasks } from '@/utils/traderUnlockRewards';
import type { ComputedRef } from '#imports';
import type { Task } from '@/types/tarkov';
type Stores = {
  metadataStore: ReturnType<typeof useMetadataStore>;
  preferencesStore: ReturnType<typeof usePreferencesStore>;
  progressStore: ReturnType<typeof useProgressStore>;
  tarkovStore: ReturnType<typeof useTarkovStore>;
};
function useUpNextTaskSets({
  metadataStore,
  preferencesStore,
  progressStore,
  tarkovStore,
}: Stores) {
  const baseTasks = computed(() => {
    const faction = tarkovStore.getPMCFaction();
    return (metadataStore.tasks ?? []).filter(
      (task) =>
        task && (!task.factionName || task.factionName === 'Any' || task.factionName === faction)
    );
  });
  const typeOptions = computed(() =>
    buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore)
  );
  const eligibleTasks = computed(() =>
    filterTasksByTypeSettings(baseTasks.value, {
      ...typeOptions.value,
      showKappa: true,
      showLightkeeper: true,
      showNonSpecial: true,
    })
  );
  const onlyKeyTasks = () =>
    preferencesStore.getOnlyTasksWithRequiredKeys && metadataStore.tasksObjectivesHydrated;
  const filteredTasks = computed(() => {
    const typed = filterTasksByTypeSettings(baseTasks.value, typeOptions.value);
    if (!onlyKeyTasks()) return typed;
    return typed.filter((task) => (task.requiredKeys?.length ?? 0) > 0);
  });
  const isTrackable = (task: Task) =>
    !tarkovStore.isTaskFailed(task.id) && progressStore.invalidTasks?.[task.id]?.self !== true;
  const isPending = (task: Task) => isTrackable(task) && !tarkovStore.isTaskComplete(task.id);
  const isAvailable = (task: Task) => progressStore.unlockedTasks?.[task.id]?.self === true;
  const pending = computed(() => filteredTasks.value.filter(isPending));
  const available = computed(() => pending.value.filter(isAvailable));
  const hiddenAvailableCount = computed(() => {
    const visible = new Set(available.value.map((task) => task.id));
    return eligibleTasks.value.filter(
      (task) => isPending(task) && isAvailable(task) && !visible.has(task.id)
    ).length;
  });
  const hasTrackable = computed(() => filteredTasks.value.some(isTrackable));
  const eligibleTaskIds = computed(() => new Set(eligibleTasks.value.map((task) => task.id)));
  return { available, eligibleTaskIds, hasTrackable, hiddenAvailableCount, pending };
}
function useUpNextContext(
  { metadataStore, progressStore, tarkovStore }: Stores,
  eligibleTaskIds: ComputedRef<ReadonlySet<string>>
) {
  const currentMode = computed(() => tarkovStore.getCurrentGameMode?.() ?? GAME_MODES.PVP);
  const unlockTraders = computed(() => {
    const rewards = rewardTraderUnlockTasks(metadataStore.tasks ?? []);
    const traders = (metadataStore.sortedTraders ?? []).map((trader) => ({
      id: trader.id,
      name: trader.name,
      unlockTaskIds: [
        ...new Set([
          ...resolveTraderUnlockTaskIds(trader.normalizedName, currentMode.value),
          ...(rewards.get(trader.id) ?? []),
        ]),
      ],
    }));
    return lockedTraderUnlockTaskIds(traders, (id) => tarkovStore.isTaskComplete(id));
  });
  return computed<UpNextContext>(() => ({
    eligibleTaskIds: eligibleTaskIds.value,
    evaluation: (id) => progressStore.taskEvaluations?.[id]?.self,
    isObjectiveComplete: (id) => tarkovStore.isTaskObjectiveComplete(id),
    unlockTraders: unlockTraders.value,
  }));
}
export function useDashboardUpNext(): {
  filtersActive: ComputedRef<boolean>;
  hiddenAvailableCount: ComputedRef<number>;
  items: ComputedRef<UpNextItem[]>;
  state: ComputedRef<UpNextState>;
} {
  const stores: Stores = {
    metadataStore: useMetadataStore(),
    preferencesStore: usePreferencesStore(),
    progressStore: useProgressStore(),
    tarkovStore: useTarkovStore(),
  };
  const { hasDashboardFiltersActive: filtersActive } = useDashboardFilters(stores.preferencesStore);
  const { available, eligibleTaskIds, hasTrackable, hiddenAvailableCount, pending } =
    useUpNextTaskSets(stores);
  const context = useUpNextContext(stores, eligibleTaskIds);
  const state = computed<UpNextState>(() => {
    if (available.value.length) return 'actionable';
    if (filtersActive.value && hiddenAvailableCount.value > 0) return 'filtered';
    if (pending.value.length) return 'blocked';
    return hasTrackable.value ? 'complete' : 'empty';
  });
  const items = computed<UpNextItem[]>(() => {
    if (state.value === 'actionable') return rankUpNext(available.value, context.value);
    if (state.value !== 'blocked') return [];
    return pickClosestBlocked(pending.value, context.value);
  });
  return { filtersActive, hiddenAvailableCount, items, state };
}
