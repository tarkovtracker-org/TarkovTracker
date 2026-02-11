import { useNeededItemsSorting } from '@/composables/useNeededItemsSorting';
import {
  getNeededItemData,
  getNeededItemId,
  isNonFirSpecialEquipment,
} from '@/features/neededitems/neededItemFilters';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { fuzzyMatch } from '@/utils/fuzzySearch';
import { logger } from '@/utils/logger';
import { perfNow, roundPerfMs } from '@/utils/perf';
import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
import type {
  NeededItemsSortBy,
  NeededItemsSortDirection,
} from '@/composables/useNeededItemsSorting';
import type {
  NeededItemsFirFilter,
  NeededItemsFilterType,
} from '@/features/neededitems/neededitems-constants';
import type {
  GroupedNeededItem,
  NeededItemHideoutModule,
  NeededItemTaskObjective,
} from '@/types/tarkov';
const DEFAULT_FULL_LOAD_TIMEOUT_MS = 5000;
const DEFAULT_FULL_LOAD_MIN_TIME_MS = 16;
const DEFAULT_FULL_LOAD_DELAY_MS = 1500;
type FullItemsLoadOptions = {
  priority?: 'normal' | 'high';
  timeout?: number;
  minTime?: number;
  delayMs?: number;
};
type NeededItemsViewMode = 'list' | 'grid';
type NeededItemsCardStyle = 'compact' | 'expanded';
export interface UseNeededItemsOptions {
  perfDebug?: boolean | Ref<boolean> | ComputedRef<boolean>;
  search?: Ref<string>;
  t?: (key: string) => string;
}
export interface FilterTab {
  label: string;
  value: NeededItemsFilterType;
  icon: string;
  count: number;
}
export interface UseNeededItemsReturn {
  activeFilter: WritableComputedRef<NeededItemsFilterType>;
  firFilter: WritableComputedRef<NeededItemsFirFilter>;
  groupByItem: WritableComputedRef<boolean>;
  hideNonFirSpecialEquipment: WritableComputedRef<boolean>;
  hideTeamItems: WritableComputedRef<boolean>;
  kappaOnly: WritableComputedRef<boolean>;
  hideOwned: WritableComputedRef<boolean>;
  sortBy: WritableComputedRef<NeededItemsSortBy>;
  sortDirection: WritableComputedRef<NeededItemsSortDirection>;
  viewMode: WritableComputedRef<NeededItemsViewMode>;
  cardStyle: WritableComputedRef<NeededItemsCardStyle>;
  allItems: ComputedRef<(NeededItemTaskObjective | NeededItemHideoutModule)[]>;
  filteredItems: ComputedRef<(NeededItemTaskObjective | NeededItemHideoutModule)[]>;
  groupedItems: ComputedRef<GroupedNeededItem[]>;
  displayItems: ComputedRef<
    GroupedNeededItem[] | (NeededItemTaskObjective | NeededItemHideoutModule)[]
  >;
  objectivesByItemId: ComputedRef<
    Map<
      string,
      { taskObjectives: NeededItemTaskObjective[]; hideoutModules: NeededItemHideoutModule[] }
    >
  >;
  filterTabsWithCounts: ComputedRef<FilterTab[]>;
  itemsReady: ComputedRef<boolean>;
  itemsError: ComputedRef<Error | null>;
  itemsFullLoaded: ComputedRef<boolean>;
  ensureNeededItemsData: () => void;
  queueFullItemsLoad: (loadOptions?: FullItemsLoadOptions) => void;
}
export function useNeededItems(options: UseNeededItemsOptions = {}): UseNeededItemsReturn {
  const { perfDebug: perfDebugOption = false, search = ref(''), t } = options;
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const defaultTranslations: Record<string, string> = {
    'needed_items.filters.all': 'All',
    'needed_items.filters.tasks': 'Tasks',
    'needed_items.filters.hideout': 'Hideout',
    'needed_items.filters.completed': 'Completed',
  };
  const translate = (key: string) => (t ? t(key) : defaultTranslations[key] || key);
  const perfDebug = computed(() => Boolean(toValue(perfDebugOption)));
  const logPerf = (event: string, payload: Record<string, unknown> = {}) => {
    if (!perfDebug.value) return;
    logger.info(`[NeededItemsPerf] ${event}`, payload);
  };
  const neededItemTaskObjectives = computed(() => metadataStore.neededItemTaskObjectives);
  const neededItemHideoutModules = computed(() => metadataStore.neededItemHideoutModules);
  const itemsFullLoaded = computed(() => metadataStore.itemsFullLoaded);
  const items = computed(() => metadataStore.items);
  const viewMode = computed({
    get: () => preferencesStore.getNeededItemsViewMode as NeededItemsViewMode,
    set: (value) => preferencesStore.setNeededItemsViewMode(value),
  });
  const activeFilter = computed({
    get: () => preferencesStore.getNeededTypeView as NeededItemsFilterType,
    set: (value) => preferencesStore.setNeededTypeView(value),
  });
  const firFilter = computed({
    get: () => preferencesStore.getNeededItemsFirFilter as NeededItemsFirFilter,
    set: (value) => preferencesStore.setNeededItemsFirFilter(value),
  });
  const groupByItem = computed({
    get: () => preferencesStore.getNeededItemsGroupByItem,
    set: (value) => preferencesStore.setNeededItemsGroupByItem(value),
  });
  const hideNonFirSpecialEquipment = computed({
    get: () => preferencesStore.getNeededItemsHideNonFirSpecialEquipment,
    set: (value) => preferencesStore.setNeededItemsHideNonFirSpecialEquipment(value),
  });
  const kappaOnly = computed({
    get: () => preferencesStore.getNeededItemsKappaOnly,
    set: (value) => preferencesStore.setNeededItemsKappaOnly(value),
  });
  const sortBy = computed({
    get: () => preferencesStore.getNeededItemsSortBy as NeededItemsSortBy,
    set: (value) => preferencesStore.setNeededItemsSortBy(value),
  });
  const sortDirection = computed({
    get: () => preferencesStore.getNeededItemsSortDirection as NeededItemsSortDirection,
    set: (value) => preferencesStore.setNeededItemsSortDirection(value),
  });
  const hideOwned = computed({
    get: () => preferencesStore.getNeededItemsHideOwned,
    set: (value) => preferencesStore.setNeededItemsHideOwned(value),
  });
  const cardStyle = computed({
    get: () => preferencesStore.getNeededItemsCardStyle as NeededItemsCardStyle,
    set: (value) => preferencesStore.setNeededItemsCardStyle(value),
  });
  const hideTeamItems = computed({
    get: () => preferencesStore.itemsTeamAllHidden,
    set: (value) => preferencesStore.setItemsTeamHideAll(value),
  });
  const userFaction = computed(() => progressStore.playerFaction['self'] ?? 'USEC');
  const taskTypeFilterOptions = computed(() =>
    buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore)
  );
  const visibleTaskIds = computed(() => {
    const visibleIds = new Set<string>();
    for (const task of filterTasksByTypeSettings(
      metadataStore.tasks || [],
      taskTypeFilterOptions.value
    )) {
      if (task.factionName === 'Any' || task.factionName === userFaction.value) {
        visibleIds.add(task.id);
      }
    }
    return visibleIds;
  });
  const itemsLoaded = computed(() => (items.value?.length ?? 0) > 0);
  const itemsError = computed(() => metadataStore.itemsError);
  const itemsReady = computed(
    () => itemsLoaded.value && !metadataStore.itemsLoading && !itemsError.value
  );
  const fullItemsQueued = ref(false);
  const { sortNeededItems, sortGroupedItems } = useNeededItemsSorting({
    sortBy,
    sortDirection,
  });
  const isNeededWithTeam = (
    need: NeededItemTaskObjective | NeededItemHideoutModule
  ): need is
    | (NeededItemTaskObjective & {
        teamId?: string | null;
        team?: { id?: string | null } | string | null;
      })
    | (NeededItemHideoutModule & {
        teamId?: string | null;
        team?: { id?: string | null } | string | null;
      }) => {
    return !!need && typeof need === 'object' && ('teamId' in need || 'team' in need);
  };
  const getNeedTeamId = (
    need: NeededItemTaskObjective | NeededItemHideoutModule
  ): string | null => {
    if (!isNeededWithTeam(need)) return null;
    if (need.teamId) {
      return need.teamId;
    }
    if (typeof need.team === 'string') {
      return need.team || null;
    }
    return need.team?.id ?? null;
  };
  const fullItemsLoadTimerId = ref<number | null>(null);
  const queueFullItemsLoad = (loadOptions: FullItemsLoadOptions = {}) => {
    if (itemsFullLoaded.value) return;
    const {
      priority = 'normal',
      timeout = DEFAULT_FULL_LOAD_TIMEOUT_MS,
      minTime = DEFAULT_FULL_LOAD_MIN_TIME_MS,
      delayMs = DEFAULT_FULL_LOAD_DELAY_MS,
    } = loadOptions;
    if (priority !== 'high' && fullItemsQueued.value) return;
    if (priority !== 'high') {
      fullItemsQueued.value = true;
    }
    const run = () => {
      if (fullItemsLoadTimerId.value !== null && typeof window !== 'undefined') {
        window.clearTimeout(fullItemsLoadTimerId.value);
      }
      fullItemsLoadTimerId.value = null;
      if (priority !== 'high') {
        fullItemsQueued.value = false;
      }
      void metadataStore.ensureItemsFullLoaded(false, { priority, timeout, minTime });
    };
    if (typeof window === 'undefined' || delayMs <= 0 || priority === 'high') {
      run();
      return;
    }
    if (fullItemsLoadTimerId.value !== null) {
      window.clearTimeout(fullItemsLoadTimerId.value);
    }
    fullItemsLoadTimerId.value = window.setTimeout(run, delayMs);
  };
  onUnmounted(() => {
    if (fullItemsLoadTimerId.value !== null && typeof window !== 'undefined') {
      window.clearTimeout(fullItemsLoadTimerId.value);
    }
    fullItemsLoadTimerId.value = null;
    fullItemsQueued.value = false;
  });
  const ensureNeededItemsData = () => {
    if (!itemsLoaded.value && !metadataStore.itemsLoading) {
      void metadataStore.fetchItemsLiteData();
    }
    if (!metadataStore.tasksObjectivesHydrated && !metadataStore.tasksObjectivesPending) {
      void metadataStore.fetchTaskObjectivesData();
    }
    if (!metadataStore.hideoutStations.length && !metadataStore.hideoutLoading) {
      void metadataStore.fetchHideoutData();
    }
  };
  watch(
    itemsLoaded,
    (loaded) => {
      if (loaded && !itemsFullLoaded.value) {
        queueFullItemsLoad();
      }
    },
    { immediate: true }
  );
  watch(hideNonFirSpecialEquipment, (enabled) => {
    if (enabled && !itemsFullLoaded.value) {
      queueFullItemsLoad({ priority: 'high', timeout: 800, minTime: 8, delayMs: 0 });
    }
  });
  const allItems = computed(() => {
    const startedAt = perfDebug.value ? perfNow() : 0;
    const combined = [
      ...(neededItemTaskObjectives.value || []),
      ...(neededItemHideoutModules.value || []),
    ];
    const taskTypeOptions = taskTypeFilterOptions.value;
    const hasTypeSelection =
      taskTypeOptions.showKappa ||
      taskTypeOptions.showLightkeeper ||
      taskTypeOptions.showNonSpecial;
    const aggregated = new Map<string, NeededItemTaskObjective | NeededItemHideoutModule>();
    for (const need of combined) {
      let key: string;
      let itemId: string | undefined;
      if (need.needType === 'taskObjective') {
        if (taskTypeOptions.excludedTaskIds.has(need.taskId)) {
          continue;
        }
        const taskPrestigeLevel = taskTypeOptions.prestigeTaskMap.get(need.taskId);
        if (
          taskPrestigeLevel !== undefined &&
          taskPrestigeLevel !== taskTypeOptions.userPrestigeLevel
        ) {
          continue;
        }
        const task = metadataStore.getTaskById(need.taskId);
        if (task && task.factionName !== 'Any' && task.factionName !== userFaction.value) {
          continue;
        }
        if (task && !visibleTaskIds.value.has(task.id)) {
          continue;
        }
        if (!task && hasTypeSelection && !taskTypeOptions.showNonSpecial) {
          continue;
        }
        itemId = getNeededItemId(need);
        if (!itemId) {
          logger.warn('[NeededItems] Skipping objective without item/markerItem:', need);
          continue;
        }
        key = `task:${need.taskId}:${itemId}`;
      } else {
        itemId = getNeededItemId(need);
        if (!itemId) {
          logger.warn('[NeededItems] Skipping hideout requirement without item:', need);
          continue;
        }
        key = `hideout:${need.hideoutModule.id}:${itemId}`;
      }
      const existing = aggregated.get(key);
      const normalizedCount = need.count ?? 0;
      if (existing) {
        const newCount = (existing.count ?? 0) + normalizedCount;
        aggregated.set(key, { ...existing, count: newCount });
      } else {
        aggregated.set(key, { ...need, count: normalizedCount });
      }
    }
    const result = Array.from(aggregated.values());
    if (perfDebug.value) {
      logPerf('all-items', {
        inputItems: combined.length,
        outputItems: result.length,
        ms: roundPerfMs(perfNow() - startedAt),
        taskObjectives: (neededItemTaskObjectives.value || []).length,
        hideoutModules: (neededItemHideoutModules.value || []).length,
      });
    }
    return result;
  });
  const isParentCompleted = (need: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    if (need.needType === 'taskObjective') {
      return progressStore.tasksCompletions?.[need.taskId]?.['self'] ?? false;
    } else if (need.needType === 'hideoutModule') {
      return progressStore.moduleCompletions?.[need.hideoutModule.id]?.['self'] ?? false;
    }
    return false;
  };
  const filterTabsWithCounts = computed((): FilterTab[] => {
    const counts = { tasks: 0, hideout: 0, completed: 0, incomplete: 0 };
    for (const item of allItems.value) {
      const completed = isParentCompleted(item);
      if (completed) {
        counts.completed++;
      } else {
        counts.incomplete++;
        if (item.needType === 'taskObjective') counts.tasks++;
        else counts.hideout++;
      }
    }
    return [
      {
        label: translate('needed_items.filters.all'),
        value: 'all' as NeededItemsFilterType,
        icon: 'i-mdi-clipboard-list',
        count: counts.incomplete,
      },
      {
        label: translate('needed_items.filters.tasks'),
        value: 'tasks' as NeededItemsFilterType,
        icon: 'i-mdi-checkbox-marked-circle-outline',
        count: counts.tasks,
      },
      {
        label: translate('needed_items.filters.hideout'),
        value: 'hideout' as NeededItemsFilterType,
        icon: 'i-mdi-home',
        count: counts.hideout,
      },
      {
        label: translate('needed_items.filters.completed'),
        value: 'completed' as NeededItemsFilterType,
        icon: 'i-mdi-check-all',
        count: counts.completed,
      },
    ];
  });
  const passesSpecialEquipmentFilter = (
    need: NeededItemTaskObjective | NeededItemHideoutModule
  ): boolean => {
    const applySpecialEquipmentFilter =
      hideNonFirSpecialEquipment.value && itemsFullLoaded.value === true;
    return (
      need.needType !== 'taskObjective' ||
      !applySpecialEquipmentFilter ||
      !isNonFirSpecialEquipment(need as NeededItemTaskObjective)
    );
  };
  const passesKappaFilter = (need: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    if (need.needType !== 'taskObjective') {
      return true;
    }
    const task = metadataStore.getTaskById(need.taskId);
    return task?.kappaRequired === true;
  };
  const passesOwnershipFilter = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): boolean => {
    const count = item.count ?? 1;
    const currentCount =
      item.needType === 'taskObjective'
        ? tarkovStore.getObjectiveCount(item.id)
        : tarkovStore.getHideoutPartCount(item.id);
    return (currentCount ?? 0) < count;
  };
  const passesTeamFilter = (item: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    const teamId = getNeedTeamId(item);
    if (!teamId) {
      return true;
    }
    return progressStore.getTeamIndex(teamId) === 'self';
  };
  const passesCompletionFilter = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): boolean => {
    if (activeFilter.value === 'completed') {
      return isParentCompleted(item);
    }
    return !isParentCompleted(item);
  };
  const passesTypeFilter = (item: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    if (activeFilter.value === 'tasks') {
      return item.needType === 'taskObjective';
    }
    if (activeFilter.value === 'hideout') {
      return item.needType === 'hideoutModule';
    }
    return true;
  };
  const passesFirFilter = (item: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    if (firFilter.value === 'fir') {
      return item.foundInRaid === true;
    }
    if (firFilter.value === 'non-fir') {
      return !item.foundInRaid;
    }
    return true;
  };
  const passesKappaToggleFilter = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): boolean => {
    return !kappaOnly.value || passesKappaFilter(item);
  };
  const passesOwnershipToggleFilter = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): boolean => {
    return !hideOwned.value || passesOwnershipFilter(item);
  };
  const passesTeamToggleFilter = (
    item: NeededItemTaskObjective | NeededItemHideoutModule
  ): boolean => {
    return !hideTeamItems.value || passesTeamFilter(item);
  };
  const passesSearchFilter = (item: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    if (!search.value) {
      return true;
    }
    const itemObj = getNeededItemData(item);
    const itemName = itemObj?.name ?? '';
    const itemShortName = itemObj?.shortName ?? '';
    if (fuzzyMatch(itemName, search.value) || fuzzyMatch(itemShortName, search.value)) {
      return true;
    }
    if (item.needType === 'taskObjective') {
      const task = metadataStore.getTaskById((item as NeededItemTaskObjective).taskId);
      if (task?.name && fuzzyMatch(task.name, search.value)) {
        return true;
      }
    }
    if (item.needType === 'hideoutModule') {
      const hideoutModule = (item as NeededItemHideoutModule).hideoutModule;
      const station = metadataStore.getStationById(hideoutModule.stationId);
      if (station?.name) {
        if (fuzzyMatch(station.name, search.value)) {
          return true;
        }
        const stationWithLevel = `${station.name} ${hideoutModule.level}`;
        const stationWithLevelText = `${station.name} level ${hideoutModule.level}`;
        if (
          fuzzyMatch(stationWithLevel, search.value) ||
          fuzzyMatch(stationWithLevelText, search.value)
        ) {
          return true;
        }
      }
    }
    return false;
  };
  const filteredItems = computed(() => {
    const startedAt = perfDebug.value ? perfNow() : 0;
    const result = allItems.value
      .filter(passesCompletionFilter)
      .filter(passesTypeFilter)
      .filter(passesFirFilter)
      .filter(passesSpecialEquipmentFilter)
      .filter(passesKappaToggleFilter)
      .filter(passesOwnershipToggleFilter)
      .filter(passesTeamToggleFilter)
      .filter(passesSearchFilter);
    const sorted = sortNeededItems(result);
    if (perfDebug.value) {
      logPerf('filtered-items', {
        activeFilter: activeFilter.value,
        firFilter: firFilter.value,
        hideOwned: hideOwned.value,
        hideTeamItems: hideTeamItems.value,
        hideNonFirSpecialEquipment: hideNonFirSpecialEquipment.value,
        inputItems: allItems.value.length,
        kappaOnly: kappaOnly.value,
        ms: roundPerfMs(perfNow() - startedAt),
        outputItems: sorted.length,
        searchLength: search.value.length,
      });
    }
    return sorted;
  });
  type GroupedNeededItemAccumulator = Omit<GroupedNeededItem, 'total' | 'currentCount'>;
  const groupedItems = computed((): GroupedNeededItem[] => {
    const startedAt = perfDebug.value ? perfNow() : 0;
    const groups = new Map<string, GroupedNeededItemAccumulator>();
    for (const need of filteredItems.value) {
      const itemId = getNeededItemId(need);
      if (!itemId) continue;
      const itemData = getNeededItemData(need);
      if (!itemData || !itemData.name) continue;
      const existingGroup = groups.get(itemId);
      if (!existingGroup) {
        groups.set(itemId, {
          item: {
            id: itemData.id,
            name: itemData.name,
            iconLink: itemData.iconLink,
            image512pxLink: itemData.image512pxLink,
            wikiLink: itemData.wikiLink,
            link: itemData.link,
          },
          taskFir: 0,
          taskFirCurrent: 0,
          taskNonFir: 0,
          taskNonFirCurrent: 0,
          hideoutFir: 0,
          hideoutFirCurrent: 0,
          hideoutNonFir: 0,
          hideoutNonFirCurrent: 0,
        });
      }
      const group = groups.get(itemId)!;
      const count = need.count || 1;
      let needCurrentCount = 0;
      if (need.needType === 'taskObjective') {
        const objectiveCount = tarkovStore.getObjectiveCount(need.id);
        needCurrentCount = Math.min(objectiveCount ?? 0, count);
        if (need.foundInRaid) {
          group.taskFir += count;
          group.taskFirCurrent += needCurrentCount;
        } else {
          group.taskNonFir += count;
          group.taskNonFirCurrent += needCurrentCount;
        }
      } else {
        const hideoutPartCount = tarkovStore.getHideoutPartCount(need.id);
        needCurrentCount = Math.min(hideoutPartCount ?? 0, count);
        if (need.foundInRaid) {
          group.hideoutFir += count;
          group.hideoutFirCurrent += needCurrentCount;
        } else {
          group.hideoutNonFir += count;
          group.hideoutNonFirCurrent += needCurrentCount;
        }
      }
    }
    const mapped = Array.from(groups.values()).map((group) => ({
      ...group,
      total: group.taskFir + group.taskNonFir + group.hideoutFir + group.hideoutNonFir,
      currentCount:
        group.taskFirCurrent +
        group.taskNonFirCurrent +
        group.hideoutFirCurrent +
        group.hideoutNonFirCurrent,
    }));
    const sorted = sortGroupedItems(mapped);
    if (perfDebug.value) {
      logPerf('grouped-items', {
        inputItems: filteredItems.value.length,
        ms: roundPerfMs(perfNow() - startedAt),
        outputItems: sorted.length,
      });
    }
    return sorted;
  });
  const objectivesByItemId = computed(() => {
    const startedAt = perfDebug.value ? perfNow() : 0;
    const map = new Map<
      string,
      {
        taskObjectives: NeededItemTaskObjective[];
        hideoutModules: NeededItemHideoutModule[];
      }
    >();
    for (const need of filteredItems.value) {
      const itemData = getNeededItemData(need);
      const itemId = itemData?.id;
      if (!itemId) continue;
      if (!map.has(itemId)) {
        map.set(itemId, { taskObjectives: [], hideoutModules: [] });
      }
      const entry = map.get(itemId)!;
      if (need.needType === 'taskObjective') {
        entry.taskObjectives.push(need as NeededItemTaskObjective);
      } else {
        entry.hideoutModules.push(need as NeededItemHideoutModule);
      }
    }
    if (perfDebug.value) {
      logPerf('objectives-by-item-id', {
        groups: map.size,
        inputItems: filteredItems.value.length,
        ms: roundPerfMs(perfNow() - startedAt),
      });
    }
    return map;
  });
  const displayItems = computed(() => {
    if (groupByItem.value) {
      return groupedItems.value;
    }
    return filteredItems.value;
  });
  return {
    activeFilter,
    firFilter,
    groupByItem,
    hideNonFirSpecialEquipment,
    hideTeamItems,
    kappaOnly,
    hideOwned,
    sortBy,
    sortDirection,
    viewMode,
    cardStyle,
    allItems,
    filteredItems,
    groupedItems,
    displayItems,
    objectivesByItemId,
    filterTabsWithCounts,
    itemsReady,
    itemsError,
    itemsFullLoaded,
    ensureNeededItemsData,
    queueFullItemsLoad,
  };
}
