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
      () => metadataStore.hasInitialized && !metadataStore.loading,
      () => metadataStore.languageCode,
      () => metadataStore.getApiGameMode(),
    ],
    ([coreReady], _previous, onCleanup) => {
      ready.value = false;
      if (!coreReady) return;
      if (!metadataStore.tasks.length) {
        ready.value = true;
        return;
      }
      let active = true;
      const timeout = setTimeout(() => {
        if (active) ready.value = true;
      }, TASK_DETAIL_WAIT_MS);
      onCleanup(() => {
        active = false;
        clearTimeout(timeout);
      });
      // These actions retain the store's cache, request deduplication, and stale-response guards.
      void Promise.allSettled([
        metadataStore.fetchTaskObjectivesData(),
        metadataStore.fetchTaskRewardsData(),
        metadataStore.fetchEditionsData(),
      ]).then(() => {
        if (!active) return;
        clearTimeout(timeout);
        ready.value = true;
      });
    },
    { immediate: true }
  );
  return ready;
};
