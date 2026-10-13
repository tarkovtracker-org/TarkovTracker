import { debounce, isDebounceRejection } from '@/utils/debounce';
import { logger } from '@/utils/logger';
import { getQueryString } from '@/utils/routeHelpers';
import { getTaskSecondaryViewForPrimaryView } from '@/utils/taskFilterNormalization';
import type { TaskSecondaryView } from '@/types/taskFilter';
/**
 * Owns the Tasks search query. While a query is active the page searches every
 * status, until the user picks a status tab for that search.
 */
export function useTaskSearchQuery() {
  const route = useRoute();
  const searchQuery = ref(getQueryString(route.query.q) || '');
  watch(
    () => route.query.q,
    (newQ) => {
      searchQuery.value = getQueryString(newQ) || '';
    }
  );
  const debouncedSearch = ref(searchQuery.value);
  const updateDebouncedSearch = debounce((value: string) => {
    debouncedSearch.value = value;
  }, 180);
  watch(searchQuery, (value) => {
    if (!value) {
      updateDebouncedSearch.cancel();
      debouncedSearch.value = '';
      return;
    }
    void updateDebouncedSearch(value).catch((error) => {
      if (isDebounceRejection(error)) return;
      logger.error('[Tasks] Debounced search update failed:', error);
    });
  });
  const normalizedSearch = computed(() => debouncedSearch.value.toLowerCase().trim());
  const isSearchActive = computed(() => normalizedSearch.value.length > 0);
  const isStatusPinned = ref(false);
  watch(isSearchActive, (active) => {
    if (!active) isStatusPinned.value = false;
  });
  const pinStatus = () => {
    if (isSearchActive.value) isStatusPinned.value = true;
  };
  const searchesAllStatuses = computed(() => isSearchActive.value && !isStatusPinned.value);
  return {
    cleanup() {
      updateDebouncedSearch.cancel();
    },
    isSearchActive,
    normalizedSearch,
    pinStatus,
    searchesAllStatuses,
    searchQuery,
  };
}
/** The status the task list filters by, widened to `all` while searching unpinned. */
export const resolveEffectiveSecondaryView = (
  primaryView: string,
  storedSecondaryView: unknown,
  searchesAllStatuses: boolean
): TaskSecondaryView => {
  if (searchesAllStatuses) return 'all';
  return getTaskSecondaryViewForPrimaryView(primaryView, storedSecondaryView);
};
