import { useMetadataStore } from '@/stores/useMetadata';
// Optional details must not prevent task navigation when a request stalls.
const TASK_DETAIL_WAIT_MS = 3000;
/**
 * Request task-card details and edition eligibility before the initial list replaces loading.
 * Release the page after settlement or a bounded wait; ignore obsolete mode/locale loads.
 */
export const useTaskDetailReadiness = () => {
  const metadataStore = useMetadataStore();
  const ready = ref(false);
  watch(
    [
      () =>
        metadataStore.hasInitialized &&
        !metadataStore.loading &&
        !metadataStore.tasksCoreRefreshing,
      () => metadataStore.languageCode,
      () => metadataStore.getApiGameMode(),
      () => metadataStore.tasksCoreRevision,
    ],
    ([coreReady], _previous, onCleanup) => {
      ready.value = false;
      if (!coreReady) return;
      if (!metadataStore.tasks.length) {
        ready.value = true;
        return;
      }
      let active = true;
      let requestsSettled = false;
      const timeout = setTimeout(() => {
        if (active) ready.value = true;
      }, TASK_DETAIL_WAIT_MS);
      const finishWhenSettled = () => {
        if (!active || !requestsSettled || metadataStore.editionsLoading) return;
        clearTimeout(timeout);
        ready.value = true;
      };
      // A cache hit can return while edition eligibility is still being revalidated.
      const stopEditionsWatch = watch(() => metadataStore.editionsLoading, finishWhenSettled);
      onCleanup(() => {
        active = false;
        clearTimeout(timeout);
        stopEditionsWatch();
      });
      const settleCountDifferences = async () => {
        const result = await metadataStore.fetchObjectiveModeCountDifferences();
        // A joined request may be discarded when reward/item hydration replaces tasks.
        if (active && result === 'stale') {
          await metadataStore.fetchObjectiveModeCountDifferences();
        }
      };
      // These actions retain the store's cache, request deduplication, and stale-response guards.
      void Promise.allSettled([
        metadataStore.fetchTaskObjectivesData(),
        metadataStore.fetchTaskRewardsData(),
        metadataStore.fetchItemsLiteData(),
        metadataStore.ensureEditionsData(),
      ]).then(async () => {
        if (active) await Promise.allSettled([settleCountDifferences()]);
        requestsSettled = true;
        finishWhenSettled();
      });
    },
    { immediate: true }
  );
  return ready;
};
