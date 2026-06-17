import { refDebounced } from '@vueuse/core';
import { useMetadataStore } from '@/stores/useMetadata';
import type { ComputedRef, Ref } from '#imports';
import type { Task, TarkovItem, HideoutStation } from '@/types/tarkov';
export interface SearchResult {
  tasks: Task[];
  items: TarkovItem[];
  hideout: HideoutStation[];
}
export function useOmnibarSearch(): {
  searchQuery: Ref<string>;
  results: ComputedRef<SearchResult>;
  currentContext: ComputedRef<'tasks' | 'hideout' | 'items' | 'global'>;
} {
  const metadataStore = useMetadataStore();
  const route = useRoute();
  const searchQuery = ref('');
  const debouncedQuery = refDebounced(searchQuery, 250);
  const results = computed<SearchResult>(() => {
    const query = debouncedQuery.value.trim().toLowerCase();
    if (query.length < 2) {
      return { tasks: [], items: [], hideout: [] };
    }
    // 1. Search Tasks
    const matchedTasks = metadataStore.tasks.filter(
      (task) =>
        task.name?.toLowerCase().includes(query) ||
        task.map?.name?.toLowerCase().includes(query) ||
        task.trader?.name?.toLowerCase().includes(query)
    );
    // 2. Search Items
    const matchedItems = metadataStore.items.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) || item.shortName?.toLowerCase().includes(query)
    );
    // 3. Search Hideout
    const matchedHideout = metadataStore.hideoutStations.filter((station) =>
      station.name?.toLowerCase().includes(query)
    );
    return {
      tasks: matchedTasks.slice(0, 5),
      items: matchedItems.slice(0, 5),
      hideout: matchedHideout.slice(0, 5),
    };
  });
  // Check current route to prioritize results
  const currentContext = computed<'tasks' | 'hideout' | 'items' | 'global'>(() => {
    const routeName = (route.name as string) || '';
    if (routeName.includes('tasks')) return 'tasks';
    if (routeName.includes('hideout')) return 'hideout';
    if (routeName.includes('needed') || routeName.includes('items')) return 'items';
    return 'global';
  });
  return {
    searchQuery,
    results,
    currentContext,
  };
}
