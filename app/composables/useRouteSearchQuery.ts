import { getQueryString, queueQueryWrite } from '@/utils/routeHelpers';
// What a queued write is about to put in `?q=`, so a status tab tapped before it lands still
// sees an active search.
const pendingSearchQuery = ref<string | null>(null);
const clearPending = (value: string) => {
  if (pendingSearchQuery.value === value) pendingSearchQuery.value = null;
};
/**
 * The page search lives in `?q=`, so the app-bar search, deep links, and shared URLs all drive
 * the same filter. Writes replace the history entry and drop the param when empty.
 */
export function useRouteSearchQuery(): {
  searchQuery: WritableComputedRef<string>;
  setSearchQuery: (value: string) => Promise<void>;
} {
  const route = useRoute();
  const router = useRouter();
  const setSearchQuery = (value: string) => {
    pendingSearchQuery.value = value;
    return queueQueryWrite(async () => {
      // An explicit empty `?q=` still differs from a cleared search, so it gets removed.
      if (getQueryString(route.query.q) === (value || undefined)) return;
      await router.replace({ query: { ...route.query, q: value || undefined } });
    }).finally(() => clearPending(value));
  };
  const searchQuery = computed({
    get: () => pendingSearchQuery.value ?? (getQueryString(route.query.q) || ''),
    set: (value: string) => void setSearchQuery(value),
  });
  return { searchQuery, setSearchQuery };
}
