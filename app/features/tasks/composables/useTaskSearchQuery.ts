import { debounce, isDebounceRejection } from '@/utils/debounce';
import { logger } from '@/utils/logger';
import { getQueryString } from '@/utils/routeHelpers';
import { getTaskSecondaryViewForPrimaryView } from '@/utils/taskFilterNormalization';
import type { TaskSecondaryView } from '@/types/taskFilter';
/**
 * Owns the Tasks search query. While a query is active the page searches every
 * status, until the user picks a status tab for that search. That pick lasts only
 * for the search; clearing it returns to the saved tab.
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
  // Track the typed query, not the debounced one, so a tab click right after typing still pins.
  const hasQuery = computed(() => searchQuery.value.trim().length > 0);
  const pinnedStatus = ref<TaskSecondaryView | null>(null);
  // Drop the pin only once both the typed and the applied query are empty.
  watch([hasQuery, isSearchActive], ([typed, applied]) => {
    if (!typed && !applied) pinnedStatus.value = null;
  });
  const pinStatus = (status: TaskSecondaryView) => {
    if (hasQuery.value) pinnedStatus.value = status;
  };
  /** Status the search shows instead of the saved tab, or null when not searching. */
  const searchStatusOverride = computed<TaskSecondaryView | null>(
    () => pinnedStatus.value ?? (isSearchActive.value ? 'all' : null)
  );
  return {
    cleanup() {
      updateDebouncedSearch.cancel();
    },
    isSearchActive,
    normalizedSearch,
    pinnedStatus: computed(() => pinnedStatus.value),
    pinStatus,
    searchQuery,
    searchStatusOverride,
  };
}
/** The status the task list filters by: the search override when set, else the saved tab. */
export const resolveEffectiveSecondaryView = (
  primaryView: string,
  storedSecondaryView: unknown,
  searchStatusOverride: TaskSecondaryView | null
): TaskSecondaryView =>
  getTaskSecondaryViewForPrimaryView(primaryView, searchStatusOverride ?? storedSecondaryView);
