import { getQueryString } from '@/utils/routeHelpers';
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
  const setSearchQuery = async (value: string) => {
    if ((getQueryString(route.query.q) || '') === value) return;
    await router.replace({ query: { ...route.query, q: value || undefined } });
  };
  const searchQuery = computed({
    get: () => getQueryString(route.query.q) || '',
    set: (value: string) => void setSearchQuery(value),
  });
  return { searchQuery, setSearchQuery };
}
