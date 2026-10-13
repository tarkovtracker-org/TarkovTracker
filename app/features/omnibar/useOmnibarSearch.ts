import { refDebounced } from '@vueuse/core';
import { useMetadataStore } from '@/stores/useMetadata';
import { fuzzyMatchScore } from '@/utils/fuzzySearch';
import { getTaskRewardItems } from '@/utils/taskRewards';
import type { ComputedRef, Ref } from '#imports';
import type { Task, TarkovItem, HideoutStation } from '@/types/tarkov';
export interface SearchResult {
  tasks: Task[];
  items: TarkovItem[];
  hideout: HideoutStation[];
}
export type OmnibarContext = 'tasks' | 'hideout' | 'items' | 'global';
const MAX_RESULTS_PER_GROUP = 5;
// Map, trader, and reward hits only count as substring matches, ranked below any fuzzy name hit
// (subsequence scores start above 0.3), so long reward lists cannot crowd out name matches.
const RELATED_FIELD_SCORE = 0.3;
const bestScore = (texts: (string | undefined)[], query: string): number =>
  Math.max(0, ...texts.map((text) => (text ? fuzzyMatchScore(text, query) : 0)));
const includesQuery = (text: string | undefined, query: string): boolean =>
  Boolean(text?.toLowerCase().includes(query));
const taskRelatedFieldsMatch = (task: Task, query: string): boolean =>
  includesQuery(task.map?.name, query) ||
  includesQuery(task.trader?.name, query) ||
  getTaskRewardItems(task).some((item) =>
    [item.name, item.shortName, item.normalizedName].some((text) => includesQuery(text, query))
  );
const scoreTask = (task: Task, query: string): number => {
  const nameScore = bestScore([task.name], query);
  if (nameScore >= RELATED_FIELD_SCORE) return nameScore;
  return taskRelatedFieldsMatch(task, query) ? RELATED_FIELD_SCORE : nameScore;
};
/** Keeps entries that match, best score first, then by name, capped per group. */
const rankMatches = <T extends { name?: string | null }>(
  entries: T[],
  score: (entry: T) => number
): T[] =>
  entries
    .map((entry) => ({ entry, score: score(entry) }))
    .filter((ranked) => ranked.score > 0)
    .sort((a, b) => b.score - a.score || (a.entry.name ?? '').localeCompare(b.entry.name ?? ''))
    .slice(0, MAX_RESULTS_PER_GROUP)
    .map((ranked) => ranked.entry);
const resolveOmnibarContext = (routeName: string): OmnibarContext => {
  if (routeName.includes('tasks')) return 'tasks';
  if (routeName.includes('hideout')) return 'hideout';
  if (routeName.includes('needed') || routeName.includes('items')) return 'items';
  return 'global';
};
export function useOmnibarSearch(): {
  searchQuery: Ref<string>;
  results: ComputedRef<SearchResult>;
  /** The typed query has not reached `results` yet, so an empty result is not final. */
  isPending: ComputedRef<boolean>;
  currentContext: ComputedRef<OmnibarContext>;
} {
  const metadataStore = useMetadataStore();
  const route = useRoute();
  const searchQuery = ref('');
  const debouncedQuery = refDebounced(searchQuery, 250);
  const isPending = computed(() => searchQuery.value !== debouncedQuery.value);
  const results = computed<SearchResult>(() => {
    const query = debouncedQuery.value.trim().toLowerCase();
    if (query.length < 2) {
      return { tasks: [], items: [], hideout: [] };
    }
    return {
      tasks: rankMatches(metadataStore.tasks, (task) => scoreTask(task, query)),
      items: rankMatches(metadataStore.items, (item) =>
        bestScore([item.name, item.shortName], query)
      ),
      hideout: rankMatches(metadataStore.hideoutStations, (station) =>
        bestScore([station.name], query)
      ),
    };
  });
  // Check current route to prioritize results
  const currentContext = computed(() => resolveOmnibarContext((route.name as string) || ''));
  return {
    searchQuery,
    results,
    isPending,
    currentContext,
  };
}
