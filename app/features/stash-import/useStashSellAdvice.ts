import {
  incompleteSellTasks,
  remainingSellUses,
  sellGroups,
} from '@/features/stash-import/sellAdvice';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { API_GAME_MODES } from '@/utils/constants';
import type { TarkovItem } from '@/types/tarkov';
import type { ReviewedCell, ScanResult } from '@/utils/stashScan/types';
function outsideProtectedCategories(item: TarkovItem, protectedCategories: ReadonlySet<string>) {
  if (!protectedCategories.size) return true;
  // Full metadata lists category membership. Sparse items cannot rule out a required category.
  const categories = item.categories;
  if (!categories?.length) return false;
  return categories.every((category) => category?.id && !protectedCategories.has(category.id));
}
/** Read-only adapter. Never calls import planning, allocation, persistence or metadata fetches. */
export function useStashSellAdvice(
  rows: MaybeRefOrGetter<ReviewedCell[]>,
  result: MaybeRefOrGetter<ScanResult | undefined>
) {
  const metadata = useMetadataStore();
  const store = useTarkovStore();
  const openedMode = store.currentGameMode;
  const modeChanged = ref(false);
  watch(
    () => store.currentGameMode,
    () => {
      modeChanged.value = true;
    },
    { flush: 'sync' }
  );
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
      metadata.itemsLoading,
      metadata.itemsError,
      !metadata.tasks.length,
      !metadata.hideoutModules.length,
      metadata.currentGameMode !== openedMode,
      metadata.itemsGameMode !== API_GAME_MODES[openedMode],
      modeChanged.value,
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
  const items = computed(() => {
    const requirements = remaining.value;
    if (!requirements) return [];
    return (toValue(result)?.catalog.items ?? []).filter((item) => {
      const current = metadata.getItemById(item.id);
      return current && outsideProtectedCategories(current, requirements.categoryIds);
    });
  });
  const groups = computed(() => sellGroups(toValue(rows), items.value, remaining.value?.itemIds));
  return { ready, groups, incompleteTasks };
}
