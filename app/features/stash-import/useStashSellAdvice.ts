import {
  incompleteSellTasks,
  remainingSellUses,
  sellGroups,
} from '@/features/stash-import/sellAdvice';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { API_GAME_MODES } from '@/utils/constants';
import type { ReviewedCell, ScanResult } from '@/utils/stashScan/types';
/** Read-only adapter. Never calls import planning, allocation, persistence or metadata fetches. */
export function useStashSellAdvice(
  rows: MaybeRefOrGetter<ReviewedCell[]>,
  result: MaybeRefOrGetter<ScanResult | undefined>
) {
  const metadata = useMetadataStore();
  const store = useTarkovStore();
  const openedMode = store.currentGameMode;
  const unavailable = computed(() =>
    [
      !metadata.initialized,
      metadata.initializationFailed,
      metadata.loading,
      metadata.tasksCoreRefreshing,
      metadata.tasksObjectivesPending,
      !metadata.tasksObjectivesHydrated,
      metadata.tasksObjectivesError,
      metadata.error,
      metadata.hideoutLoading,
      metadata.hideoutError,
      metadata.itemsError,
      !metadata.tasks.length,
      !metadata.hideoutModules.length,
      metadata.currentGameMode !== openedMode,
      metadata.itemsGameMode !== API_GAME_MODES[openedMode],
      store.currentGameMode !== openedMode,
    ].some(Boolean)
  );
  const remaining = computed(() =>
    unavailable.value
      ? undefined
      : remainingSellUses(metadata.tasks, metadata.hideoutModules, store)
  );
  const incompleteTasks = computed(() =>
    unavailable.value
      ? []
      : incompleteSellTasks(metadata.tasks, store).map((task) => task.name ?? task.id)
  );
  const ready = computed(() => remaining.value !== undefined);
  const items = computed(() =>
    (toValue(result)?.catalog.items ?? []).filter((item) => Boolean(metadata.getItemById(item.id)))
  );
  const groups = computed(() => sellGroups(toValue(rows), items.value, remaining.value));
  return { ready, groups, incompleteTasks };
}
