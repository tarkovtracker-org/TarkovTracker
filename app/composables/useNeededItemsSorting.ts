import { getNeededItemData } from '@/features/neededitems/neededItemFilters';
import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { TASK_STATE } from '@/utils/constants';
import type {
  NeededItemsSortBy,
  NeededItemsSortDirection,
} from '@/features/neededitems/neededitems-constants';
import type {
  GroupedNeededItem,
  NeededItemHideoutModule,
  NeededItemTaskObjective,
} from '@/types/tarkov';
export type {
  NeededItemsSortBy,
  NeededItemsSortDirection,
} from '@/features/neededitems/neededitems-constants';
export interface SortValues {
  priority: number;
  count: number;
  name: string;
  category: string;
}
export interface UseNeededItemsSortingOptions {
  sortBy: Ref<NeededItemsSortBy> | ComputedRef<NeededItemsSortBy>;
  sortDirection: Ref<NeededItemsSortDirection> | ComputedRef<NeededItemsSortDirection>;
}
export interface UseNeededItemsSortingReturn {
  createSorter: <T>(getValues: (item: T) => SortValues) => (a: T, b: T) => number;
  getNeededItemPriority: (item: NeededItemTaskObjective | NeededItemHideoutModule) => number;
  getNeededItemSortValues: (item: NeededItemTaskObjective | NeededItemHideoutModule) => SortValues;
  getGroupedItemSortValues: (item: GroupedNeededItem) => SortValues;
  sortNeededItems: <T extends NeededItemTaskObjective | NeededItemHideoutModule>(items: T[]) => T[];
  sortGroupedItems: (items: GroupedNeededItem[]) => GroupedNeededItem[];
}
export function useNeededItemsSorting(
  options: UseNeededItemsSortingOptions
): UseNeededItemsSortingReturn {
  const { sortBy, sortDirection } = options;
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const getSortComparison = (sort: NeededItemsSortBy, a: SortValues, b: SortValues): number => {
    switch (sort) {
      case 'priority':
        return a.priority - b.priority;
      case 'count':
        return a.count - b.count;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'category':
        return a.category.localeCompare(b.category);
      default:
        return 0;
    }
  };
  const createSorter = <T>(getValues: (item: T) => SortValues) => {
    return (a: T, b: T) => {
      const cmp = getSortComparison(sortBy.value, getValues(a), getValues(b));
      return sortDirection.value === 'asc' ? cmp : -cmp;
    };
  };
  // Descending sort order: ACTIVE > HIDEOUT > AVAILABLE > others.
  const PRIORITY_ACTIVE = 3;
  const PRIORITY_HIDEOUT = 2;
  const PRIORITY_AVAILABLE = 1;
  const PRIORITY_DEFAULT = 0;
  const getNeededItemPriority = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): number => {
    if (item.needType === 'taskObjective') {
      const state = progressStore.tasksState?.[item.taskId];
      return state === TASK_STATE.ACTIVE
        ? PRIORITY_ACTIVE
        : state === TASK_STATE.AVAILABLE
          ? PRIORITY_AVAILABLE
          : PRIORITY_DEFAULT;
    }
    return PRIORITY_HIDEOUT;
  };
  const getNeededItemSortValues = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): SortValues => {
    const itemData = getNeededItemData(item);
    return {
      priority: getNeededItemPriority(item),
      count: item.count ?? 0,
      name: itemData?.name ?? '',
      category: itemData?.category?.name ?? '',
    };
  };
  const getGroupedItemSortValues = (item: GroupedNeededItem): SortValues => {
    const itemData = metadataStore.getItemById(item.item.id);
    const hasTasks = item.taskFir > 0 || item.taskNonFir > 0;
    const hasHideout = item.hideoutFir > 0 || item.hideoutNonFir > 0;
    let groupedPriority = 0;
    if (hasTasks) {
      groupedPriority = 2;
    } else if (hasHideout) {
      groupedPriority = 1;
    }
    return {
      priority: groupedPriority,
      count: item.total,
      name: item.item.name ?? '',
      category: itemData?.category?.name ?? '',
    };
  };
  const sortNeededItems = <T extends NeededItemTaskObjective | NeededItemHideoutModule>(
    items: T[]
  ): T[] => {
    return [...items].sort(createSorter(getNeededItemSortValues));
  };
  const sortGroupedItems = (items: GroupedNeededItem[]): GroupedNeededItem[] => {
    return [...items].sort(createSorter(getGroupedItemSortValues));
  };
  return {
    createSorter,
    getNeededItemPriority,
    getNeededItemSortValues,
    getGroupedItemSortValues,
    sortNeededItems,
    sortGroupedItems,
  };
}
