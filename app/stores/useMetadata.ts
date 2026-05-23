import { defineStore } from 'pinia';
import { extractLanguageCode, useSafeLocale } from '@/composables/i18nHelpers';
import { useGraphBuilder } from '@/composables/useGraphBuilder';
import mapsData from '@/data/maps.json';
import { type FetchResponse, isFetchError, isFetchSuccess } from '@/stores/tarkov/fetchResponse';
import { type ObjectiveWithItems, createItemPicker } from '@/stores/tarkov/itemPicker';
import {
  type PromiseKey,
  getPromiseRequestIdStore,
  getPromiseRequestKeyStore,
  getPromiseStore,
} from '@/stores/tarkov/promiseStore';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import {
  API_GAME_MODES,
  API_SUPPORTED_LANGUAGES,
  GAME_MODES,
  LOCALE_TO_API_MAPPING,
  MAP_NAME_MAPPING,
  MAP_NORMALIZED_NAME_MAPPING,
  sortMapsByGameOrder,
  sortTradersByGameOrder,
} from '@/utils/constants';
import {
  getExcludedTaskIdsForEdition as getExcludedTaskIds,
  getExclusiveEditionsForTask as getTaskExclusiveEditions,
  isTaskAvailableForEdition as checkTaskEdition,
} from '@/utils/editionHelpers';
import { createGraph, type TaskGraph } from '@/utils/graphHelpers';
import { queueIdleTask } from '@/utils/idleScheduler';
import { logger } from '@/utils/logger';
import { perfEnd, perfStart } from '@/utils/perf';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { normalizeStoryChapter } from '@/utils/storylineObjectives';
import {
  CACHE_CONFIG,
  type CacheType,
  cleanupExpiredCache,
  clearAllCache,
  getCachedData,
  setCachedData,
} from '@/utils/tarkovCache';
import { normalizeTaskObjectives } from '@/utils/taskNormalization';
import type {
  FinishRewards,
  GameEdition,
  HideoutModule,
  HideoutStation,
  NeededItemHideoutModule,
  NeededItemTaskObjective,
  ObjectiveGPSInfo,
  ObjectiveMapInfo,
  PlayerLevel,
  PrestigeLevel,
  StaticMapData,
  StoryChapter,
  TarkovBootstrapQueryResult,
  TarkovDataQueryResult,
  TarkovHideoutQueryResult,
  TarkovItem,
  TarkovItemsQueryResult,
  TarkovMap,
  TarkovMapSpawnsQueryResult,
  TarkovPrestigeQueryResult,
  TarkovTaskObjectivesQueryResult,
  TarkovTaskRewardsQueryResult,
  TarkovTasksCoreQueryResult,
  Task,
  TaskObjective,
  Trader,
} from '@/types/tarkov';
const BOOTSTRAP_CACHE_VERSION = 'json-v1';
const TASKS_CORE_CACHE_VERSION = 'json-v1';
const MAP_SPAWNS_CACHE_VERSION = 'json-v1';
const ITEMS_CACHE_VERSION = 'json-v1';
const TASK_OBJECTIVES_CACHE_VERSION = 'json-v3';
const TASK_REWARDS_CACHE_VERSION = 'json-v2';
const HIDEOUT_CACHE_VERSION = 'json-v3';
const PRESTIGE_CACHE_VERSION = 'json-v2';
const CACHE_PURGE_STORAGE_KEY = STORAGE_KEYS.cachePurgeAt;
const CACHE_PURGE_CHECK_TTL_MS = 60 * 1000;
const CACHE_PURGE_CHECK_TIMEOUT_MS = 2500;
const CACHE_PURGE_CHECK_STORAGE_KEY = STORAGE_KEYS.cachePurgeCheckAt;
// Exported type for craft sources used by components
export type CraftSource = { stationId: string; stationName: string; stationLevel: number };
export interface MetadataStoreTaskLookup {
  getTaskById?: (id: string) => { name?: string } | undefined;
  tasks?: Array<{ id: string; name?: string }>;
}
const hasRenderableCriticalMetadata = (
  state: Pick<MetadataState, 'hideoutStations' | 'tasks'>
): boolean => {
  return state.tasks.length > 0 && state.hideoutStations.length > 0;
};
interface MetadataState {
  // Initialization and loading states
  initialized: boolean;
  initializationFailed: boolean;
  loading: boolean;
  // Indicates objectives still need to be fetched (set when tasks exist but objectives not yet loaded)
  tasksObjectivesPending: boolean;
  tasksObjectivesHydrated: boolean;
  hideoutLoading: boolean;
  itemsLoading: boolean;
  mapSpawnsLoading: boolean;
  itemsLanguage: string;
  itemsGameMode: string;
  itemsFullLoaded: boolean;
  mapSpawnsLoaded: boolean;
  prestigeLoading: boolean;
  editionsLoading: boolean;
  error: Error | null;
  hideoutError: Error | null;
  itemsError: Error | null;
  mapSpawnsError: Error | null;
  prestigeError: Error | null;
  editionsError: Error | null;
  // Raw data from API
  tasks: Task[];
  editions: GameEdition[];
  storyChapters: StoryChapter[];
  hideoutStations: HideoutStation[];
  maps: TarkovMap[];
  traders: Trader[];
  playerLevels: PlayerLevel[];
  items: TarkovItem[];
  itemsById: Map<string, TarkovItem>;
  prestigeLevels: PrestigeLevel[];
  staticMapData: StaticMapData | null;
  // Processed data
  taskGraph: TaskGraph;
  taskById: Map<string, Task>;
  hideoutGraph: TaskGraph;
  hideoutModules: HideoutModule[];
  craftSourcesByItemId: Map<string, CraftSource[]>;
  // Derived data structures
  objectiveMaps: { [taskId: string]: ObjectiveMapInfo[] };
  alternativeTasks: { [taskId: string]: string[] };
  alternativeTaskSources: { [taskId: string]: string[] };
  objectiveGPS: { [taskId: string]: ObjectiveGPSInfo[] };
  mapTasks: { [mapId: string]: string[] };
  neededItemTaskObjectives: NeededItemTaskObjective[];
  neededItemHideoutModules: NeededItemHideoutModule[];
  objectiveModeCountDifferences: Record<string, { pvp: number; pve: number }>;
  objectiveModeCountDifferencesHydrated: boolean;
  // Language and game mode
  languageCode: string;
  currentGameMode: string;
  lastCachePurgeCheckAt: number;
}
const NEW_BEGINNING_ID_PATTERN = /^new_beginning_prestige_(\d+)$/i;
const NEW_BEGINNING_WIKI_PATTERN = /\/New_Beginning(?:_\(Prestige_(\d+)\))?(?:[?#].*)?$/i;
const isNewBeginningTask = (task: Task): boolean => {
  if (!task?.id) return false;
  if (NEW_BEGINNING_ID_PATTERN.test(task.id)) return true;
  if (typeof task.wikiLink === 'string' && NEW_BEGINNING_WIKI_PATTERN.test(task.wikiLink)) {
    return true;
  }
  return task.name === 'New Beginning';
};
const inferNewBeginningPrestigeLevel = (task: Task): number | null => {
  if (typeof task.wikiLink === 'string') {
    const wikiMatch = task.wikiLink.match(NEW_BEGINNING_WIKI_PATTERN);
    if (wikiMatch?.[1]) {
      const parsed = Number.parseInt(wikiMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  const idMatch = task.id.match(NEW_BEGINNING_ID_PATTERN);
  if (!idMatch?.[1]) return null;
  const parsed = Number.parseInt(idMatch[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const deriveStaticMapKey = (mapName: string, normalizedName?: string): string => {
  if (normalizedName) {
    return MAP_NORMALIZED_NAME_MAPPING[normalizedName] ?? normalizedName.replace(/-/g, '');
  }
  const lower = mapName.toLowerCase();
  return MAP_NAME_MAPPING[lower] ?? lower.replace(/[\s+-]/g, '');
};
export const useMetadataStore = defineStore('metadata', {
  state: (): MetadataState => ({
    initialized: false,
    initializationFailed: false,
    loading: false,
    tasksObjectivesPending: false,
    tasksObjectivesHydrated: false,
    hideoutLoading: false,
    itemsLoading: false,
    mapSpawnsLoading: false,
    itemsLanguage: 'en',
    itemsGameMode: API_GAME_MODES[GAME_MODES.PVP],
    itemsFullLoaded: false,
    mapSpawnsLoaded: false,
    prestigeLoading: false,
    editionsLoading: false,
    error: null,
    hideoutError: null,
    itemsError: null,
    mapSpawnsError: null,
    prestigeError: null,
    editionsError: null,
    tasks: markRaw([]),
    editions: markRaw([]),
    storyChapters: markRaw([]),
    hideoutStations: markRaw([]),
    maps: markRaw([]),
    traders: markRaw([]),
    playerLevels: markRaw([]),
    items: markRaw([]),
    itemsById: markRaw(new Map<string, TarkovItem>()),
    prestigeLevels: markRaw([]),
    staticMapData: null,
    taskGraph: markRaw(createGraph()),
    taskById: markRaw(new Map<string, Task>()),
    hideoutGraph: markRaw(createGraph()),
    hideoutModules: markRaw([]),
    craftSourcesByItemId: markRaw(new Map<string, CraftSource[]>()),
    objectiveMaps: markRaw({}),
    alternativeTasks: markRaw({}),
    alternativeTaskSources: markRaw({}),
    objectiveGPS: markRaw({}),
    mapTasks: markRaw({}),
    neededItemTaskObjectives: markRaw([]),
    neededItemHideoutModules: markRaw([]),
    objectiveModeCountDifferences: markRaw({}),
    objectiveModeCountDifferencesHydrated: false,
    languageCode: 'en',
    currentGameMode: GAME_MODES.PVP,
    lastCachePurgeCheckAt: 0,
  }),
  getters: {
    // Computed properties for tasks
    objectives: (state): TaskObjective[] => {
      if (!state.tasks.length) return [];
      const allObjectives: TaskObjective[] = [];
      state.tasks.forEach((task) => {
        const normalizedObjectives = normalizeTaskObjectives<TaskObjective>(task.objectives);
        normalizedObjectives.forEach((obj) => {
          if (obj) {
            allObjectives.push({ ...obj, taskId: task.id });
          }
        });
      });
      return allObjectives;
    },
    // Get edition name by value
    getEditionName:
      (state) =>
      (edition: number | undefined): string => {
        if (edition == null) return 'N/A';
        const found = state.editions.find((e) => e.value === edition);
        return found ? found.title : `Edition ${edition}`;
      },
    // Get edition data by value
    getEditionByValue:
      (state) =>
      (editionValue: number | undefined): GameEdition | undefined => {
        if (editionValue == null) return undefined;
        return state.editions.find((e) => e.value === editionValue);
      },
    /**
     * Get all task IDs that should be excluded for a given edition.
     * Uses shared helper from editionHelpers.ts
     */
    getExcludedTaskIdsForEdition:
      (state) =>
      (editionValue: number | undefined): Set<string> =>
        getExcludedTaskIds(editionValue, state.editions),
    /**
     * Check if a task is available for a given edition.
     * Uses shared helper from editionHelpers.ts
     */
    isTaskAvailableForEdition:
      (state) =>
      (taskId: string, editionValue: number | undefined): boolean =>
        checkTaskEdition(taskId, editionValue, state.editions),
    /**
     * Get editions that a task is exclusive to.
     * Returns array of editions that have this task in their exclusiveTaskIds.
     */
    getExclusiveEditionsForTask:
      (state) =>
      (taskId: string): GameEdition[] =>
        getTaskExclusiveEditions(taskId, state.editions),
    getObjectiveModeCountDifference:
      (state) =>
      (objectiveId: string): { pvp: number; pve: number } | undefined =>
        state.objectiveModeCountDifferences[objectiveId],
    // Computed properties for maps with merged static data
    mapsWithSvg: (state): TarkovMap[] => {
      if (!state.maps.length || !state.staticMapData) {
        return [];
      }
      const mapGroups: Record<string, TarkovMap[]> = {};
      state.maps.forEach((map) => {
        const mapKey = deriveStaticMapKey(map.name, map.normalizedName);
        if (!mapGroups[mapKey]) {
          mapGroups[mapKey] = [];
        }
        mapGroups[mapKey]!.push(map);
      });
      const mergedMaps = Object.entries(mapGroups)
        .map(([mapKey, maps]) => {
          const primaryMap = maps.find((map) => map.normalizedName === 'ground-zero') ?? maps[0];
          if (!primaryMap) return null;
          const staticData = state.staticMapData?.[mapKey];
          const mergedIds = maps.map((map) => map.id);
          // Check for unavailable before svg check (unavailable maps may not have svg)
          const unavailable = staticData?.unavailable;
          if (staticData?.svg || staticData?.tile) {
            return {
              ...primaryMap,
              svg: staticData?.svg,
              tile: staticData?.tile,
              unavailable,
              mergedIds,
            };
          }
          if (!staticData) {
            logger.warn(
              `[MetadataStore] Static SVG data not found for map: ${primaryMap.name} (lookup key: ${mapKey})`
            );
          }
          return {
            ...primaryMap,
            unavailable,
            mergedIds,
          };
        })
        .filter((map): map is NonNullable<typeof map> => map !== null);
      // Sort maps by task progression order using the mapKey for lookup
      return sortMapsByGameOrder(mergedMaps, (map) =>
        deriveStaticMapKey(map.name, map.normalizedName)
      );
    },
    // Computed properties for traders (sorted by in-game order)
    sortedTraders: (state): Trader[] => sortTradersByGameOrder(state.traders),
    // Computed properties for hideout
    stationsByName: (state): { [name: string]: HideoutStation } => {
      const stationMap: { [name: string]: HideoutStation } = {};
      state.hideoutStations.forEach((station) => {
        stationMap[station.name] = station;
        if (station.normalizedName) {
          stationMap[station.normalizedName] = station;
        }
      });
      return stationMap;
    },
    modulesByStation: (state): { [stationId: string]: HideoutModule[] } => {
      const moduleMap: { [stationId: string]: HideoutModule[] } = {};
      state.hideoutModules.forEach((module) => {
        if (!moduleMap[module.stationId]) {
          moduleMap[module.stationId] = [];
        }
        moduleMap[module.stationId]!.push(module);
      });
      return moduleMap;
    },
    maxStationLevels: (state): { [stationId: string]: number } => {
      const maxLevels: { [stationId: string]: number } = {};
      state.hideoutStations.forEach((station) => {
        maxLevels[station.id] = Math.max(...station.levels.map((level) => level.level));
      });
      return maxLevels;
    },
    // Player level properties
    minPlayerLevel: (state): number => {
      if (!state.playerLevels.length) return 1;
      return Math.min(...state.playerLevels.map((level) => level.level));
    },
    maxPlayerLevel: (state): number => {
      if (!state.playerLevels.length) return 79;
      return Math.max(...state.playerLevels.map((level) => level.level));
    },
    // Utility getters
    isDataLoaded: (state): boolean => {
      return (
        !state.loading &&
        !state.hideoutLoading &&
        state.tasks.length > 0 &&
        state.hideoutStations.length > 0
      );
    },
    hasInitialized: (state): boolean => state.initialized,
    // Items getters
    isItemsLoaded: (state): boolean => {
      return !state.itemsLoading && state.items.length > 0;
    },
    isItemsFullLoaded: (state): boolean => state.itemsFullLoaded === true,
    // Prestige getters
    isPrestigeLoaded: (state): boolean => {
      return !state.prestigeLoading && state.prestigeLevels.length > 0;
    },
    getPrestigeByLevel:
      (state) =>
      (level: number): PrestigeLevel | undefined => {
        return state.prestigeLevels.find(
          (prestige: PrestigeLevel) => prestige.prestigeLevel === level
        );
      },
    /**
     * Build a mapping of task IDs to the user prestige level that should see them.
     * This is derived from prestige conditions - if prestige N requires completing task X,
     * then users at prestige (N-1) should see task X.
     *
     * Returns: Map<taskId, userPrestigeLevel>
     * Example: { "6761f28a022f60bb320f3e95": 0 } means users at prestige 0 see this task
     */
    prestigeTaskMap: (state): Map<string, number> => {
      const map = new Map<string, number>();
      const newBeginningTaskIds = new Set(
        state.tasks.filter((task) => isNewBeginningTask(task)).map((task) => task.id)
      );
      for (const prestige of state.prestigeLevels) {
        const prestigeLevel = prestige.prestigeLevel ?? 0;
        if (prestigeLevel <= 0) continue;
        // Find TaskObjectiveTaskStatus conditions that reference tasks
        for (const condition of prestige.conditions || []) {
          const taskId = condition.task?.id;
          if (!taskId) continue;
          // Check if this is a task status condition with a task reference
          if (newBeginningTaskIds.size > 0 && !newBeginningTaskIds.has(taskId)) continue;
          if (newBeginningTaskIds.size === 0 && condition.task?.name !== 'New Beginning') continue;
          // User at prestige (N-1) needs to complete this task to reach prestige N
          map.set(taskId, prestigeLevel - 1);
        }
      }
      for (const task of state.tasks) {
        if (!isNewBeginningTask(task) || map.has(task.id)) continue;
        const prestigeLevel = inferNewBeginningPrestigeLevel(task);
        if (!prestigeLevel) continue;
        const userPrestigeLevel = prestigeLevel - 1;
        if (userPrestigeLevel >= 0) {
          map.set(task.id, userPrestigeLevel);
        }
      }
      return map;
    },
  },
  actions: {
    async initialize(options?: { forceRefresh?: boolean }) {
      const forceRefresh = options?.forceRefresh ?? false;
      const perfTimer = perfStart('[Metadata] initialize');
      const promiseStore = getPromiseStore(this);
      if (promiseStore.initPromise && !forceRefresh) {
        perfEnd(perfTimer, { reused: true });
        return promiseStore.initPromise;
      }
      promiseStore.isInitializing = true;
      promiseStore.initPromise = (async () => {
        try {
          this.updateLanguageAndGameMode();
          await this.loadStaticMapData();
          let cachedData: Awaited<ReturnType<typeof this.loadCriticalCacheData>> = null;
          if (typeof window !== 'undefined' && !forceRefresh) {
            cachedData = await this.loadCriticalCacheData();
            if (cachedData) {
              this.initialized = true;
              logger.debug('[MetadataStore] Critical cache exists, skipping loading screen');
            }
          }
          await this.fetchAllData(forceRefresh, { deferHeavy: !forceRefresh, cachedData });
          this.assertCriticalMetadataReady();
          this.initialized = true;
          this.initializationFailed = false;
        } catch (err) {
          logger.error('[MetadataStore] Failed to initialize metadata:', err);
          this.initialized = hasRenderableCriticalMetadata(this);
          this.initializationFailed = true;
          // Rethrow to allow caller (e.g. metadata plugin) to handle retries or critical failure
          throw err;
        } finally {
          promiseStore.isInitializing = false;
          promiseStore.initPromise = null;
          perfEnd(perfTimer, {
            initialized: this.initialized,
            failed: this.initializationFailed,
          });
        }
      })();
      return promiseStore.initPromise;
    },
    /**
     * Update language code and game mode based on current state
     * @param localeOverride - Optional locale override to use instead of useSafeLocale()
     */
    updateLanguageAndGameMode(localeOverride?: string) {
      const store = useTarkovStore();
      const effectiveLocale = localeOverride || useSafeLocale().value;
      logger.debug('[MetadataStore] updateLanguageAndGameMode - raw locale:', effectiveLocale);
      // Update language code
      const mappedCode = LOCALE_TO_API_MAPPING[effectiveLocale];
      if (mappedCode) {
        this.languageCode = mappedCode;
      } else {
        this.languageCode = extractLanguageCode(effectiveLocale, [...API_SUPPORTED_LANGUAGES]);
      }
      // Update game mode
      this.currentGameMode = store.getCurrentGameMode();
    },
    setLoading(isLoading: boolean) {
      this.loading = isLoading;
    },
    /**
     * Load static map data from local source
     */
    async loadStaticMapData() {
      if (!this.staticMapData) {
        this.staticMapData = markRaw(mapsData as unknown as StaticMapData);
      }
    },
    /**
     * Load critical cached data if available.
     * Returns the cached data to avoid redundant fetches, or null if cache is incomplete.
     */
    async loadCriticalCacheData(): Promise<{
      tasksCore: TarkovTasksCoreQueryResult;
      hideout: TarkovHideoutQueryResult;
      prestige: TarkovPrestigeQueryResult;
      editions: { editions: GameEdition[]; storyChapters?: StoryChapter[] };
    } | null> {
      try {
        const apiGameMode =
          API_GAME_MODES[this.currentGameMode as keyof typeof API_GAME_MODES] ||
          API_GAME_MODES[GAME_MODES.PVP];
        // Load all critical cache entries in parallel
        const [tasksCore, hideout, prestige, editions] = await Promise.all([
          getCachedData<TarkovTasksCoreQueryResult>(
            'tasks-core' as CacheType,
            `${TASKS_CORE_CACHE_VERSION}-${apiGameMode}`,
            this.languageCode
          ),
          getCachedData<TarkovHideoutQueryResult>(
            'hideout' as CacheType,
            `${HIDEOUT_CACHE_VERSION}-${apiGameMode}`,
            this.languageCode
          ),
          getCachedData<TarkovPrestigeQueryResult>(
            'prestige' as CacheType,
            `all-${PRESTIGE_CACHE_VERSION}`,
            this.languageCode
          ),
          getCachedData<{ editions: GameEdition[]; storyChapters?: StoryChapter[] }>(
            'editions' as CacheType,
            'all',
            'en'
          ),
        ]);
        if (tasksCore && hideout && prestige && editions) {
          logger.debug('[MetadataStore] Critical cache: ALL PRESENT');
          return { tasksCore, hideout, prestige, editions };
        }
        logger.debug('[MetadataStore] Critical cache: MISSING some entries');
        return null;
      } catch (err) {
        logger.warn('[MetadataStore] Error loading critical cache:', err);
        return null;
      }
    },
    /**
     * Generic fetch helper with caching and promise deduplication.
     * Handles: dedup → cache check → fetch → process → cache result → error handling
     */
    async fetchWithCache<T>(config: {
      cacheType: CacheType;
      cacheKey: string;
      cacheLanguage?: string;
      endpoint: string;
      queryParams?: Record<string, string>;
      cacheTTL: number;
      loadingKey?:
        | 'loading'
        | 'tasksObjectivesPending'
        | 'hideoutLoading'
        | 'itemsLoading'
        | 'mapSpawnsLoading'
        | 'prestigeLoading'
        | 'editionsLoading';
      errorKey?:
        | 'error'
        | 'hideoutError'
        | 'itemsError'
        | 'mapSpawnsError'
        | 'prestigeError'
        | 'editionsError';
      processData: (data: T) => void;
      onEmpty?: () => void;
      logName: string;
      forceRefresh?: boolean;
      promiseKey?: PromiseKey;
      promiseRequestKey?: string;
      throwOnError?: boolean;
    }): Promise<void> {
      const { promiseKey, promiseRequestKey, forceRefresh = false } = config;
      if (promiseKey) {
        const promises = getPromiseStore(this);
        const requestKeys = getPromiseRequestKeyStore(this);
        const requestIds = getPromiseRequestIdStore(this);
        const existing = promises[promiseKey];
        if (
          existing &&
          !forceRefresh &&
          (!promiseRequestKey || requestKeys[promiseKey] === promiseRequestKey)
        ) {
          return await existing;
        }
        const promiseRequestId = Symbol(promiseKey);
        if (promiseRequestKey) {
          requestKeys[promiseKey] = promiseRequestKey;
        } else {
          requestKeys[promiseKey] = undefined;
        }
        requestIds[promiseKey] = promiseRequestId;
        const requestPromise = this._doFetchWithCache<T>({ ...config, promiseRequestId });
        promises[promiseKey] = requestPromise;
        try {
          await requestPromise;
        } finally {
          if (requestIds[promiseKey] === promiseRequestId) {
            promises[promiseKey] = null;
            requestKeys[promiseKey] = undefined;
            requestIds[promiseKey] = undefined;
          }
        }
        return;
      }
      return await this._doFetchWithCache<T>(config);
    },
    async _doFetchWithCache<T>(config: {
      cacheType: CacheType;
      cacheKey: string;
      cacheLanguage?: string;
      endpoint: string;
      queryParams?: Record<string, string>;
      cacheTTL: number;
      loadingKey?:
        | 'loading'
        | 'tasksObjectivesPending'
        | 'hideoutLoading'
        | 'itemsLoading'
        | 'mapSpawnsLoading'
        | 'prestigeLoading'
        | 'editionsLoading';
      errorKey?:
        | 'error'
        | 'hideoutError'
        | 'itemsError'
        | 'mapSpawnsError'
        | 'prestigeError'
        | 'editionsError';
      processData: (data: T) => void;
      onEmpty?: () => void;
      logName: string;
      forceRefresh?: boolean;
      promiseKey?: PromiseKey;
      promiseRequestKey?: string;
      promiseRequestId?: symbol;
      throwOnError?: boolean;
    }): Promise<void> {
      const perfTimer = perfStart(`[Metadata] fetch ${config.logName}`, {
        cacheKey: config.cacheKey,
        cacheType: config.cacheType,
        cacheLanguage: config.cacheLanguage ?? this.languageCode,
        forceRefresh: config.forceRefresh ?? false,
      });
      let perfEnded = false;
      let hadError = false;
      let perfSource: 'cache' | 'network' | 'skipped' = 'network';
      const endPerf = (meta?: Record<string, unknown>) => {
        if (perfEnded) return;
        perfEnded = true;
        perfEnd(perfTimer, { source: perfSource, ...meta });
      };
      const {
        cacheType,
        cacheKey,
        cacheLanguage = this.languageCode,
        endpoint,
        queryParams = {},
        cacheTTL,
        loadingKey,
        errorKey,
        processData,
        onEmpty,
        logName,
        forceRefresh = false,
        promiseKey,
        promiseRequestKey,
        promiseRequestId,
        throwOnError = false,
      } = config;
      const isCurrentRequestContext = (): boolean => {
        if (!promiseKey) return true;
        if (promiseRequestId && getPromiseRequestIdStore(this)[promiseKey] !== promiseRequestId) {
          return false;
        }
        if (
          promiseRequestKey &&
          getPromiseRequestKeyStore(this)[promiseKey] !== promiseRequestKey
        ) {
          return false;
        }
        return true;
      };
      // Reset error state if tracking errors
      if (errorKey) {
        this.$patch({ [errorKey]: null });
      }
      // Step 1: Check IndexedDB cache (unless forcing refresh)
      if (!forceRefresh && typeof window !== 'undefined') {
        try {
          const cached = await getCachedData<T>(cacheType, cacheKey, cacheLanguage);
          if (cached) {
            logger.debug(
              `[MetadataStore] ${logName} loaded from cache: ${cacheLanguage}-${cacheKey}`
            );
            if (!isCurrentRequestContext()) {
              perfSource = 'skipped';
              endPerf({ cached: true, stale: true });
              return;
            }
            processData(cached);
            perfSource = 'cache';
            endPerf({ cached: true });
            return;
          }
        } catch (cacheErr) {
          logger.warn(
            `[MetadataStore] ${logName} cache read failed, falling back to server:`,
            cacheErr
          );
        }
      }
      // Step 2: Set loading state if tracking loading
      if (loadingKey) {
        this.$patch({ [loadingKey]: true });
      }
      try {
        // Step 3: Fetch from server API
        logger.debug(
          `[MetadataStore] Fetching ${logName} from server: ${cacheLanguage}-${cacheKey}`
        );
        const effectiveQueryParams = forceRefresh
          ? { ...queryParams, cacheBust: '1' }
          : queryParams;
        const response = await $fetch<FetchResponse<T>>(endpoint, {
          query: effectiveQueryParams,
        });
        if (isFetchError(response)) {
          // Log full response for debugging
          logger.debug(`[MetadataStore] ${logName} error response:`, response);
          // Construct user-friendly error message
          let errorMessage: string;
          if (typeof response.error === 'string') {
            errorMessage = response.error;
          } else {
            const errorObj = response.error as { message?: unknown };
            if (typeof errorObj.message === 'string') {
              errorMessage = errorObj.message;
            } else {
              try {
                errorMessage = JSON.stringify(response.error).slice(0, 200);
              } catch {
                // Safely extract error details when JSON.stringify fails (e.g., circular refs)
                const err = response.error as Record<string, unknown>;
                const parts: string[] = [];
                if (err.name) parts.push(`name=${String(err.name)}`);
                if (err.message) parts.push(`message=${String(err.message)}`);
                if (err.code) parts.push(`code=${String(err.code)}`);
                if (err.stack) parts.push(`stack=${String(err.stack).slice(0, 100)}`);
                errorMessage =
                  parts.length > 0 ? parts.join('; ') : `[Unserializable: ${typeof err}]`;
              }
            }
          }
          throw new Error(`API error: ${errorMessage}`);
        }
        if (!isFetchSuccess<T>(response)) {
          // Log full response for debugging
          logger.debug(`[MetadataStore] ${logName} unexpected response shape:`, response);
          const keys = response && typeof response === 'object' ? Object.keys(response) : [];
          throw new Error(`Invalid response: expected { data: T }, got keys: [${keys.join(', ')}]`);
        }
        if (!isCurrentRequestContext()) {
          perfSource = 'skipped';
          endPerf({ stale: true });
          return;
        }
        processData(response.data);
        // Step 4: Store in IndexedDB for future visits
        if (typeof window !== 'undefined') {
          setCachedData(cacheType, cacheKey, cacheLanguage, response.data, cacheTTL).catch((err) =>
            logger.error(`[MetadataStore] Error caching ${logName} data:`, err)
          );
        }
      } catch (err) {
        logger.error(`[MetadataStore] Error fetching ${logName} data:`, err);
        if (errorKey && isCurrentRequestContext()) {
          this.$patch({ [errorKey]: err as Error });
        }
        const isCurrent = isCurrentRequestContext();
        if (onEmpty && isCurrent) {
          onEmpty();
        }
        hadError = true;
        if (throwOnError && isCurrent) {
          throw err;
        }
      } finally {
        if (loadingKey && isCurrentRequestContext()) {
          this.$patch({ [loadingKey]: false });
        }
        endPerf({ error: hadError });
      }
    },
    /**
     * Get the current API game mode string
     */
    getApiGameMode(): string {
      return (
        API_GAME_MODES[this.currentGameMode as keyof typeof API_GAME_MODES] ||
        API_GAME_MODES[GAME_MODES.PVP]
      );
    },
    /**
     * Check if the server has purged cache and clear local cache if needed.
     */
    async checkCachePurge(): Promise<void> {
      if (typeof window === 'undefined') return;
      const now = Date.now();
      const storedCheckRaw = localStorage.getItem(CACHE_PURGE_CHECK_STORAGE_KEY);
      const storedCheckAt = storedCheckRaw ? Number(storedCheckRaw) : 0;
      const lastCheckAt = Number.isFinite(storedCheckAt)
        ? Math.max(this.lastCachePurgeCheckAt, storedCheckAt)
        : this.lastCachePurgeCheckAt;
      if (now - lastCheckAt < CACHE_PURGE_CHECK_TTL_MS) return;
      this.lastCachePurgeCheckAt = now;
      const timeoutMs = CACHE_PURGE_CHECK_TIMEOUT_MS;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await $fetch<FetchResponse<{ lastPurgeAt: string | null }>>(
          '/api/tarkov/cache-meta',
          { signal: controller.signal }
        );
        if (!isFetchSuccess(response)) return;
        localStorage.setItem(CACHE_PURGE_CHECK_STORAGE_KEY, String(now));
        const lastPurgeAt = response.data?.lastPurgeAt;
        if (!lastPurgeAt) return;
        const serverTime = Date.parse(lastPurgeAt);
        if (!Number.isFinite(serverTime)) return;
        const localValue = localStorage.getItem(CACHE_PURGE_STORAGE_KEY);
        const localTime = localValue ? Date.parse(localValue) : 0;
        if (!Number.isFinite(localTime) || serverTime > localTime) {
          try {
            await clearAllCache();
            localStorage.setItem(CACHE_PURGE_STORAGE_KEY, lastPurgeAt);
            logger.info('[MetadataStore] Cleared local cache after server purge.');
          } catch (clearError) {
            logger.error(
              '[MetadataStore] Failed to clear local cache after server purge:',
              clearError
            );
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.warn(`[MetadataStore] Cache purge check timed out after ${timeoutMs}ms.`, error);
          return;
        }
        logger.warn('[MetadataStore] Failed to check cache purge status:', error);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    /**
     * Fetch all metadata from the API
     * @param forceRefresh - If true, bypass cache and fetch fresh data
     * @param options.deferHeavy - If true, defer heavy fetches to idle time
     * @param options.cachedData - Pre-loaded cache data to avoid redundant fetches
     */
    async fetchAllData(
      forceRefresh = false,
      options: {
        deferHeavy?: boolean;
        cachedData?: {
          tasksCore: TarkovTasksCoreQueryResult;
          hideout: TarkovHideoutQueryResult;
          prestige: TarkovPrestigeQueryResult;
          editions: { editions: GameEdition[]; storyChapters?: StoryChapter[] };
        } | null;
      } = {}
    ) {
      const { deferHeavy = false, cachedData = null } = options;
      const perfTimer = perfStart('[Metadata] fetchAllData', { forceRefresh, deferHeavy });
      this.checkCachePurge().catch((err) =>
        logger.warn('[MetadataStore] Background cache purge check failed:', err)
      );
      // Run cleanup once per session
      if (typeof window !== 'undefined') {
        cleanupExpiredCache().catch((err) =>
          logger.error('[MetadataStore] Error during cache cleanup:', err)
        );
      }
      if (cachedData && !forceRefresh) {
        this.applyCriticalCachedData(cachedData);
      }
      await this.fetchBootstrapData(forceRefresh);
      // Use pre-loaded cache data if available, otherwise fetch
      let hideoutPromise: Promise<void>;
      let prestigePromise: Promise<void> = Promise.resolve();
      let editionsPromise: Promise<void> = Promise.resolve();
      let tasksCorePromise: Promise<void>;
      if (cachedData && !forceRefresh) {
        hideoutPromise = Promise.resolve();
        if (!this.storyChapters.length) {
          editionsPromise = this.fetchEditionsData(false);
        }
        tasksCorePromise = Promise.resolve();
      } else {
        hideoutPromise = this.fetchHideoutData(forceRefresh);
        if (deferHeavy) {
          queueIdleTask(
            () =>
              this.fetchPrestigeData(forceRefresh).catch((err) =>
                logger.error('[MetadataStore] Error fetching deferred prestige data:', err)
              ),
            { timeout: 3000, minTime: 8, priority: 'normal' }
          );
          queueIdleTask(
            () =>
              this.fetchEditionsData(forceRefresh).catch((err) =>
                logger.error('[MetadataStore] Error fetching deferred editions data:', err)
              ),
            { timeout: 3500, minTime: 8, priority: 'normal' }
          );
        } else {
          prestigePromise = this.fetchPrestigeData(forceRefresh);
          editionsPromise = this.fetchEditionsData(forceRefresh);
        }
        tasksCorePromise = this.fetchTasksCoreData(forceRefresh);
      }
      await tasksCorePromise;
      // Fetch critical data directly (not deferred) - needed for UI to render
      const itemsLitePromise = this.fetchItemsLiteData(forceRefresh);
      let taskObjectivesPromise: Promise<void> = Promise.resolve();
      if (this.tasks.length && deferHeavy) {
        queueIdleTask(
          () =>
            this.fetchTaskObjectivesData(forceRefresh).catch((err) =>
              logger.error('[MetadataStore] Error fetching deferred task objectives data:', err)
            ),
          { timeout: 3000, minTime: 8, priority: 'normal' }
        );
      } else {
        taskObjectivesPromise = this.fetchTaskObjectivesData(forceRefresh);
      }
      // Only defer non-critical task rewards
      if (this.tasks.length && deferHeavy) {
        queueIdleTask(
          () =>
            this.fetchTaskRewardsData(forceRefresh).catch((err) =>
              logger.error('[MetadataStore] Error fetching deferred data:', err)
            ),
          { timeout: 4000, minTime: 8, priority: 'normal' }
        );
      } else if (this.tasks.length) {
        await this.fetchTaskRewardsData(forceRefresh);
      }
      // Full items are heavy; load on-demand via ensureItemsFullLoaded.
      await Promise.all([hideoutPromise, itemsLitePromise, taskObjectivesPromise]);
      await Promise.all([prestigePromise, editionsPromise]);
      if (!this.initialized && hasRenderableCriticalMetadata(this)) {
        this.initialized = true;
        this.initializationFailed = false;
      }
      this.assertCriticalMetadataReady();
      perfEnd(perfTimer, {
        tasks: this.tasks.length,
        items: this.items.length,
        hideoutStations: this.hideoutStations.length,
      });
    },
    /**
     * Fetch minimal bootstrap data (player levels) to enable early UI rendering
     */
    async fetchBootstrapData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      await this.fetchWithCache<TarkovBootstrapQueryResult>({
        cacheType: 'bootstrap' as CacheType,
        cacheKey: `${BOOTSTRAP_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/bootstrap',
        queryParams: { gameMode: requestGameMode, lang: requestLanguage },
        cacheTTL: CACHE_CONFIG.DEFAULT_TTL,
        processData: (data) => this.processBootstrapData(data),
        logName: 'Bootstrap',
        forceRefresh,
        promiseKey: 'bootstrapPromise',
        promiseRequestKey: requestKey,
      });
    },
    /**
     * Fetch core tasks, maps, and traders data (no objectives/rewards)
     */
    async fetchTasksCoreData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      await this.fetchWithCache<TarkovTasksCoreQueryResult>({
        cacheType: 'tasks-core' as CacheType,
        cacheKey: `${TASKS_CORE_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/tasks-core',
        queryParams: { lang: requestLanguage, gameMode: requestGameMode },
        cacheTTL: CACHE_CONFIG.DEFAULT_TTL,
        loadingKey: 'loading',
        errorKey: 'error',
        processData: (data) => this.processTasksCoreData(data),
        onEmpty: () => this.resetTasksData(),
        logName: 'Task core',
        forceRefresh,
        promiseKey: 'tasksCorePromise',
        promiseRequestKey: requestKey,
        throwOnError: true,
      });
    },
    async fetchMapSpawnsData(forceRefresh = false) {
      if (this.mapSpawnsLoaded && !forceRefresh) return;
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      await this.fetchWithCache<TarkovMapSpawnsQueryResult>({
        cacheType: 'map-spawns' as CacheType,
        cacheKey: `${MAP_SPAWNS_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/map-spawns',
        queryParams: { lang: requestLanguage, gameMode: requestGameMode },
        cacheTTL: CACHE_CONFIG.DEFAULT_TTL,
        loadingKey: 'mapSpawnsLoading',
        errorKey: 'mapSpawnsError',
        processData: (data) => this.mergeMapSpawns(data),
        logName: 'Map spawns',
        forceRefresh,
        promiseKey: 'mapSpawnsPromise',
        promiseRequestKey: requestKey,
      });
    },
    /**
     * Fetch task objectives and fail conditions data
     */
    async fetchTaskObjectivesData(forceRefresh = false) {
      if (this.tasksObjectivesHydrated && !forceRefresh) {
        this.fetchObjectiveModeCountDifferences(false).catch((err) =>
          logger.warn('[MetadataStore] Failed to refresh objective mode count differences:', err)
        );
        return;
      }
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      await this.fetchWithCache<TarkovTaskObjectivesQueryResult>({
        cacheType: 'tasks-objectives' as CacheType,
        cacheKey: `${TASK_OBJECTIVES_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/tasks-objectives',
        queryParams: {
          gameMode: requestGameMode,
          lang: requestLanguage,
          version: TASK_OBJECTIVES_CACHE_VERSION,
        },
        cacheTTL: CACHE_CONFIG.DEFAULT_TTL,
        loadingKey: 'tasksObjectivesPending',
        processData: (data) => {
          this.mergeTaskObjectives(data.tasks, {
            rebuildDerivedData: false,
            repairFailedTaskStates: false,
          });
          this.hydrateTaskItems({ rebuildDerivedData: false });
          this.rebuildTaskDerivedData();
          useTarkovStore().repairFailedTaskStates();
          this.fetchObjectiveModeCountDifferences(forceRefresh).catch((err) =>
            logger.warn('[MetadataStore] Failed to fetch objective mode count differences:', err)
          );
        },
        logName: 'Task objectives',
        forceRefresh,
        promiseKey: 'taskObjectivesPromise',
        promiseRequestKey: requestKey,
      });
    },
    async fetchObjectiveModeCountDifferences(forceRefresh = false) {
      const promiseStore = getPromiseStore(this);
      const existingPromise = promiseStore.objectiveModeCountDifferencesPromise;
      if (existingPromise && !forceRefresh) {
        return existingPromise;
      }
      const promise = (async () => {
        if (!this.tasks.length) {
          this.objectiveModeCountDifferences = markRaw({});
          this.objectiveModeCountDifferencesHydrated = false;
          return;
        }
        if (this.objectiveModeCountDifferencesHydrated && !forceRefresh) {
          return;
        }
        const requestApiMode = this.getApiGameMode();
        const requestLanguageCode = this.languageCode;
        const requestTasks = this.tasks;
        const currentCounts = this.buildObjectiveCountMap(requestTasks);
        const otherApiMode =
          requestApiMode === API_GAME_MODES[GAME_MODES.PVE]
            ? API_GAME_MODES[GAME_MODES.PVP]
            : API_GAME_MODES[GAME_MODES.PVE];
        try {
          const response = await $fetch<FetchResponse<TarkovTaskObjectivesQueryResult>>(
            '/api/tarkov/tasks-objectives',
            {
              query: {
                gameMode: otherApiMode,
                lang: requestLanguageCode,
                version: TASK_OBJECTIVES_CACHE_VERSION,
              },
            }
          );
          if (isFetchError(response)) {
            const errorMessage =
              typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
            throw new Error(`API error: ${errorMessage}`);
          }
          if (!isFetchSuccess<TarkovTaskObjectivesQueryResult>(response)) {
            throw new Error('Invalid response: expected { data }');
          }
          if (
            this.getApiGameMode() !== requestApiMode ||
            this.languageCode !== requestLanguageCode ||
            this.tasks !== requestTasks
          ) {
            return;
          }
          const otherModeTasks = (response.data.tasks || []).map((task) => ({
            id: task.id,
            objectives: this.normalizeObjectiveItems(
              normalizeTaskObjectives<TaskObjective>(task.objectives)
            ),
          }));
          const dedupedOtherModeTasks = this.dedupeObjectiveIds(otherModeTasks as Task[]).tasks;
          const otherCounts = this.buildObjectiveCountMap(dedupedOtherModeTasks);
          const allObjectiveIds = new Set([...currentCounts.keys(), ...otherCounts.keys()]);
          const differences: Record<string, { pvp: number; pve: number }> = {};
          allObjectiveIds.forEach((objectiveId) => {
            const currentModeCount = currentCounts.get(objectiveId);
            const otherModeCount = otherCounts.get(objectiveId);
            if (
              typeof currentModeCount !== 'number' ||
              typeof otherModeCount !== 'number' ||
              currentModeCount === otherModeCount
            ) {
              return;
            }
            const pvpCount =
              requestApiMode === API_GAME_MODES[GAME_MODES.PVP] ? currentModeCount : otherModeCount;
            const pveCount =
              requestApiMode === API_GAME_MODES[GAME_MODES.PVE] ? currentModeCount : otherModeCount;
            differences[objectiveId] = { pvp: pvpCount, pve: pveCount };
          });
          if (
            this.getApiGameMode() !== requestApiMode ||
            this.languageCode !== requestLanguageCode ||
            this.tasks !== requestTasks
          ) {
            return;
          }
          this.objectiveModeCountDifferences = markRaw(differences);
          this.objectiveModeCountDifferencesHydrated = true;
        } catch (err) {
          if (
            this.getApiGameMode() !== requestApiMode ||
            this.languageCode !== requestLanguageCode ||
            this.tasks !== requestTasks
          ) {
            return;
          }
          this.objectiveModeCountDifferences = markRaw({});
          this.objectiveModeCountDifferencesHydrated = false;
          logger.warn('[MetadataStore] Error building objective mode count differences:', err);
        }
      })();
      promiseStore.objectiveModeCountDifferencesPromise = promise;
      try {
        await promise;
      } finally {
        promiseStore.objectiveModeCountDifferencesPromise = null;
      }
    },
    /**
     * Fetch task rewards data
     */
    async fetchTaskRewardsData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      await this.fetchWithCache<TarkovTaskRewardsQueryResult>({
        cacheType: 'tasks-rewards' as CacheType,
        cacheKey: `${TASK_REWARDS_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/tasks-rewards',
        queryParams: { lang: requestLanguage, gameMode: requestGameMode },
        cacheTTL: CACHE_CONFIG.DEFAULT_TTL,
        processData: (data) => {
          this.mergeTaskRewards(data.tasks, { rebuildDerivedData: false });
          this.hydrateTaskItems();
        },
        logName: 'Task rewards',
        forceRefresh,
        promiseKey: 'taskRewardsPromise',
        promiseRequestKey: requestKey,
      });
    },
    /**
     * Fetch hideout data
     */
    async fetchHideoutData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      await this.fetchWithCache<TarkovHideoutQueryResult>({
        cacheType: 'hideout' as CacheType,
        cacheKey: `${HIDEOUT_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/hideout',
        queryParams: { lang: requestLanguage, gameMode: requestGameMode },
        cacheTTL: CACHE_CONFIG.DEFAULT_TTL,
        loadingKey: 'hideoutLoading',
        errorKey: 'hideoutError',
        processData: (data) => {
          this.processHideoutData(data);
          this.hydrateHideoutItems();
        },
        onEmpty: () => this.resetHideoutData(),
        logName: 'Hideout',
        forceRefresh,
        promiseKey: 'hideoutPromise',
        promiseRequestKey: requestKey,
        throwOnError: true,
      });
    },
    /**
     * Fetch lightweight items data for early UI hydration
     */
    async fetchItemsLiteData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      if (
        this.itemsFullLoaded &&
        this.itemsLanguage === requestLanguage &&
        this.itemsGameMode === requestGameMode &&
        !forceRefresh
      )
        return;
      if (
        this.items.length > 0 &&
        this.itemsLanguage === requestLanguage &&
        this.itemsGameMode === requestGameMode &&
        !forceRefresh
      )
        return;
      await this.fetchWithCache<TarkovItemsQueryResult>({
        cacheType: 'items-lite' as CacheType,
        cacheKey: `${ITEMS_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/items-lite',
        queryParams: { gameMode: requestGameMode, lang: requestLanguage },
        cacheTTL: CACHE_CONFIG.MAX_TTL,
        loadingKey: 'itemsLoading',
        errorKey: 'itemsError',
        processData: (data) => {
          if (this.languageCode !== requestLanguage || this.getApiGameMode() !== requestGameMode) {
            return;
          }
          this.items = markRaw(data.items || []);
          this.rebuildItemsIndex();
          this.itemsLanguage = requestLanguage;
          this.itemsGameMode = requestGameMode;
          this.itemsFullLoaded = false;
          this.hydrateTaskItems();
          this.hydrateHideoutItems();
          this.hydratePrestigeItems();
        },
        onEmpty: () => {
          if (this.languageCode !== requestLanguage || this.getApiGameMode() !== requestGameMode) {
            return;
          }
          this.items = markRaw([]);
          this.itemsById = markRaw(new Map<string, TarkovItem>());
          this.itemsLanguage = requestLanguage;
          this.itemsGameMode = requestGameMode;
          this.itemsFullLoaded = false;
        },
        logName: 'Items (lite)',
        forceRefresh,
        promiseKey: 'itemsLitePromise',
        promiseRequestKey: requestKey,
      });
    },
    /**
     * Fetch full items data for the active language and game mode
     */
    async fetchItemsFullData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      const requestGameMode = this.getApiGameMode();
      const requestKey = `${requestLanguage}-${requestGameMode}`;
      if (
        this.itemsFullLoaded &&
        this.itemsLanguage === requestLanguage &&
        this.itemsGameMode === requestGameMode &&
        !forceRefresh
      )
        return;
      await this.fetchWithCache<TarkovItemsQueryResult>({
        cacheType: 'items' as CacheType,
        cacheKey: `${ITEMS_CACHE_VERSION}-${requestGameMode}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/items',
        queryParams: { gameMode: requestGameMode, lang: requestLanguage },
        cacheTTL: CACHE_CONFIG.MAX_TTL,
        loadingKey: 'itemsLoading',
        errorKey: 'itemsError',
        processData: (data) => {
          if (this.languageCode !== requestLanguage || this.getApiGameMode() !== requestGameMode) {
            return;
          }
          this.items = markRaw(data.items || []);
          this.rebuildItemsIndex();
          this.itemsLanguage = requestLanguage;
          this.itemsGameMode = requestGameMode;
          this.itemsFullLoaded = true;
          this.hydrateTaskItems();
          this.hydrateHideoutItems();
          this.hydratePrestigeItems();
        },
        onEmpty: () => {
          if (this.languageCode !== requestLanguage || this.getApiGameMode() !== requestGameMode) {
            return;
          }
          this.items = markRaw([]);
          this.itemsById = markRaw(new Map<string, TarkovItem>());
          this.itemsLanguage = requestLanguage;
          this.itemsGameMode = requestGameMode;
          this.itemsFullLoaded = false;
        },
        logName: 'Items (full)',
        forceRefresh,
        promiseKey: 'itemsFullPromise',
        promiseRequestKey: requestKey,
      });
    },
    /**
     * Ensure full items data is loaded (safe to call multiple times)
     */
    async ensureItemsFullLoaded(
      forceRefresh = false,
      options: { timeout?: number; minTime?: number; priority?: 'normal' | 'high' } = {}
    ) {
      const apiGameMode = this.getApiGameMode();
      if (
        this.itemsFullLoaded &&
        this.itemsLanguage === this.languageCode &&
        this.itemsGameMode === apiGameMode &&
        !forceRefresh
      )
        return;
      const { timeout = 800, minTime = 8, priority = 'high' } = options;
      return queueIdleTask(() => this.fetchItemsFullData(forceRefresh), {
        timeout,
        minTime,
        priority,
      });
    },
    /**
     * Fetch prestige data (language-specific, not game-mode specific)
     */
    async fetchPrestigeData(forceRefresh = false) {
      const requestLanguage = this.languageCode;
      await this.fetchWithCache<TarkovPrestigeQueryResult>({
        cacheType: 'prestige' as CacheType,
        cacheKey: `all-${PRESTIGE_CACHE_VERSION}`,
        cacheLanguage: requestLanguage,
        endpoint: '/api/tarkov/prestige',
        queryParams: { lang: requestLanguage },
        cacheTTL: CACHE_CONFIG.MAX_TTL,
        loadingKey: 'prestigeLoading',
        errorKey: 'prestigeError',
        processData: (data) => {
          this.prestigeLevels = markRaw(data.prestige || []);
          this.hydratePrestigeItems();
        },
        onEmpty: () => {
          this.prestigeLevels = markRaw([]);
        },
        logName: 'Prestige',
        forceRefresh,
        promiseKey: 'prestigePromise',
        promiseRequestKey: requestLanguage,
      });
    },
    /**
     * Fetch game editions data directly from GitHub overlay.
     * Editions are universal (not language or game-mode specific).
     * Note: Uses external URL, so cannot use generic fetchWithCache helper.
     */
    async fetchEditionsData(forceRefresh = false) {
      const promiseStore = getPromiseStore(this);
      const existingPromise = promiseStore.editionsPromise;
      if (existingPromise && !forceRefresh) {
        return existingPromise;
      }
      const promise = (async () => {
        this.editionsError = null;
        const existingEditions = this.editions;
        const existingStoryChapters = this.storyChapters;
        if (!forceRefresh && typeof window !== 'undefined') {
          try {
            const cached = await getCachedData<{
              editions: GameEdition[];
              storyChapters?: StoryChapter[];
            }>('editions' as CacheType, 'all', 'en');
            if (cached?.editions) {
              this.editions = markRaw(cached.editions);
            }
            if (cached?.editions && cached.storyChapters && cached.storyChapters.length > 0) {
              logger.debug('[MetadataStore] Editions loaded from cache');
              const sorted = cached.storyChapters
                .map((chapter) => normalizeStoryChapter(chapter))
                .sort((a, b) => a.order - b.order);
              this.storyChapters = markRaw(sorted);
              void this.fetchEditionsData(true).catch((err) =>
                logger.warn('[MetadataStore] Background editions revalidation failed:', err)
              );
              return;
            }
          } catch (cacheErr) {
            logger.warn('[MetadataStore] Editions cache read failed:', cacheErr);
          }
        }
        this.editionsLoading = true;
        try {
          const OVERLAY_URL =
            'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json';
          const overlay = await $fetch<{
            editions?: Record<string, GameEdition>;
            storyChapters?: Record<string, StoryChapter>;
          }>(OVERLAY_URL, {
            parseResponse: JSON.parse,
          });
          if (overlay?.editions) {
            this.editions = markRaw(Object.values(overlay.editions));
          } else {
            logger.warn('[MetadataStore] No editions found in overlay response');
            this.editions = markRaw([]);
          }
          if (overlay?.storyChapters) {
            const chaptersArray = Object.values(overlay.storyChapters).map((chapter) =>
              normalizeStoryChapter(chapter)
            );
            chaptersArray.sort((a, b) => a.order - b.order);
            this.storyChapters = markRaw(chaptersArray);
          } else {
            this.storyChapters = markRaw([]);
          }
          if (typeof window !== 'undefined') {
            setCachedData(
              'editions' as CacheType,
              'all',
              'en',
              { editions: this.editions, storyChapters: this.storyChapters },
              CACHE_CONFIG.MAX_TTL
            ).catch((err) => logger.error('[MetadataStore] Error caching editions:', err));
          }
        } catch (err) {
          logger.error('[MetadataStore] Error fetching editions data:', err);
          this.editionsError = err as Error;
          if (!this.editions.length && existingEditions.length) {
            this.editions = markRaw(existingEditions);
          }
          if (!this.storyChapters.length && existingStoryChapters.length) {
            this.storyChapters = markRaw(existingStoryChapters);
          }
          if (!this.editions.length) {
            this.editions = markRaw([]);
          }
        } finally {
          this.editionsLoading = false;
        }
      })();
      promiseStore.editionsPromise = promise;
      try {
        await promise;
      } finally {
        promiseStore.editionsPromise = null;
      }
    },
    applyCriticalCachedData(cachedData: {
      tasksCore: TarkovTasksCoreQueryResult;
      hideout: TarkovHideoutQueryResult;
      prestige: TarkovPrestigeQueryResult;
      editions: { editions: GameEdition[]; storyChapters?: StoryChapter[] };
    }) {
      if (!this.tasks.length) {
        this.processTasksCoreData(cachedData.tasksCore);
        this.error = null;
      }
      if (!this.hideoutStations.length) {
        this.processHideoutData(cachedData.hideout);
        this.hydrateHideoutItems();
        this.hideoutError = null;
      }
      if (!this.prestigeLevels.length) {
        this.prestigeLevels = markRaw(cachedData.prestige.prestige || []);
        this.hydratePrestigeItems();
      }
      if (!this.editions.length) {
        this.editions = markRaw(cachedData.editions.editions || []);
      }
      if (!this.storyChapters.length && cachedData.editions.storyChapters?.length) {
        const sorted = cachedData.editions.storyChapters
          .map((chapter) => normalizeStoryChapter(chapter))
          .sort((a, b) => a.order - b.order);
        this.storyChapters = markRaw(sorted);
      }
    },
    assertCriticalMetadataReady() {
      const missing: string[] = [];
      if (this.error || this.tasks.length === 0) {
        missing.push('tasks');
      }
      if (this.hideoutError || this.hideoutStations.length === 0) {
        missing.push('hideout');
      }
      if (missing.length > 0) {
        throw new Error(`[MetadataStore] Critical metadata unavailable: ${missing.join(', ')}`);
      }
    },
    /**
     * Process bootstrap data (player levels) for early UI rendering
     */
    processBootstrapData(data: TarkovBootstrapQueryResult) {
      const levels = data.playerLevels || [];
      this.playerLevels = markRaw(this.convertToCumulativeXP(levels));
    },
    /**
     * Process core task data without objectives/rewards
     */
    processTasksCoreData(data: TarkovTasksCoreQueryResult) {
      const perfTimer = perfStart('[Metadata] processTasksCoreData', {
        tasks: data.tasks?.length ?? 0,
        maps: data.maps?.length ?? 0,
        traders: data.traders?.length ?? 0,
      });
      this.tasksObjectivesPending = (data.tasks?.length ?? 0) > 0;
      this.tasksObjectivesHydrated = false;
      this.objectiveModeCountDifferences = markRaw({});
      this.objectiveModeCountDifferencesHydrated = false;
      this.processTasksData({
        tasks: data.tasks || [],
        maps: data.maps || [],
        traders: data.traders || [],
      });
      perfEnd(perfTimer, { tasks: this.tasks.length });
    },
    mergeMapSpawns(data: TarkovMapSpawnsQueryResult) {
      if (!this.maps.length) {
        this.mapSpawnsLoaded = false;
        return;
      }
      const spawnsByMapId = new Map(
        (data.maps || []).map((map) => [map.id, map.spawns || []] as const)
      );
      if (spawnsByMapId.size === 0) {
        this.mapSpawnsLoaded = true;
        return;
      }
      let changed = false;
      const mergedMaps = this.maps.map((map) => {
        const spawns = spawnsByMapId.get(map.id);
        if (!spawns) return map;
        changed = true;
        return { ...map, spawns };
      });
      if (changed) {
        this.maps = markRaw(mergedMaps);
      }
      this.mapSpawnsLoaded = true;
    },
    dedupeObjectiveIds(tasks: Task[]) {
      const objectiveCounts = new Map<string, number>();
      tasks.forEach((task) => {
        task.objectives?.forEach((objective) => {
          if (!objective?.id) return;
          objectiveCounts.set(objective.id, (objectiveCounts.get(objective.id) ?? 0) + 1);
        });
      });
      const duplicateObjectiveIds = new Map<string, string[]>();
      const updatedTasks = tasks.map((task) => {
        if (!task.objectives?.length) return task;
        let changed = false;
        const objectives = task.objectives.map((objective) => {
          if (!objective?.id) return objective;
          const count = objectiveCounts.get(objective.id) ?? 0;
          if (count <= 1) return objective;
          const newId = `${objective.id}:${task.id}`;
          const existing = duplicateObjectiveIds.get(objective.id);
          if (existing) {
            existing.push(newId);
          } else {
            duplicateObjectiveIds.set(objective.id, [newId]);
          }
          changed = true;
          return { ...objective, id: newId };
        });
        return changed ? { ...task, objectives } : task;
      });
      return { tasks: updatedTasks, duplicateObjectiveIds };
    },
    buildObjectiveCountMap(tasks: Array<Pick<Task, 'id' | 'objectives'>>): Map<string, number> {
      const counts = new Map<string, number>();
      tasks.forEach((task) => {
        normalizeTaskObjectives<TaskObjective>(task.objectives).forEach((objective) => {
          if (!objective?.id || typeof objective.count !== 'number') return;
          counts.set(objective.id, objective.count);
          const dedupSuffix = `:${task.id}`;
          if (objective.id.endsWith(dedupSuffix)) {
            const baseObjectiveId = objective.id.slice(0, -dedupSuffix.length);
            if (baseObjectiveId && !counts.has(baseObjectiveId)) {
              counts.set(baseObjectiveId, objective.count);
            }
          }
        });
      });
      return counts;
    },
    /**
     * Merge objective payloads into existing tasks
     */
    mergeTaskObjectives(
      tasks: TarkovTaskObjectivesQueryResult['tasks'],
      options: { rebuildDerivedData?: boolean; repairFailedTaskStates?: boolean } = {}
    ) {
      const { rebuildDerivedData = true, repairFailedTaskStates = rebuildDerivedData } = options;
      const validUpdates = (tasks || []).filter(
        (task): task is NonNullable<TarkovTaskObjectivesQueryResult['tasks'][number]> =>
          Boolean(task?.id)
      );
      const updateMap = new Map(validUpdates.map((task) => [task.id, task]));
      const duplicateUpdates = validUpdates.length - updateMap.size;
      const perfTimer = perfStart('[Metadata] mergeTaskObjectives', {
        updates: updateMap.size,
        duplicateUpdates,
        existing: this.tasks.length,
      });
      if (updateMap.size === 0 || !this.tasks.length) {
        perfEnd(perfTimer, { skipped: true });
        return;
      }
      let changed = false;
      let matchedUpdates = 0;
      const merged = this.tasks.map((task) => {
        const update = updateMap.get(task.id);
        if (!update) return task;
        matchedUpdates += 1;
        changed = true;
        return {
          ...task,
          objectives:
            update.objectives !== undefined
              ? this.normalizeObjectiveItems(
                  normalizeTaskObjectives<TaskObjective>(update.objectives)
                )
              : task.objectives,
          failConditions:
            update.failConditions !== undefined
              ? this.normalizeObjectiveItems(
                  normalizeTaskObjectives<TaskObjective>(update.failConditions)
                )
              : task.failConditions,
        };
      });
      if (changed) {
        const deduped = this.dedupeObjectiveIds(merged);
        this.tasks = markRaw(deduped.tasks);
        this.tasksObjectivesHydrated = this.tasks.some(
          (task) => Array.isArray(task.objectives) && task.objectives.length > 0
        );
        if (deduped.duplicateObjectiveIds.size > 0) {
          const progressStore = useProgressStore();
          progressStore.migrateDuplicateObjectiveProgress(deduped.duplicateObjectiveIds);
        }
        const tarkovStore = useTarkovStore();
        tarkovStore.repairCompletedTaskObjectives();
        if (rebuildDerivedData) {
          this.rebuildTaskDerivedData();
        }
        if (repairFailedTaskStates) {
          tarkovStore.repairFailedTaskStates();
        }
      }
      perfEnd(perfTimer, {
        changed,
        tasks: this.tasks.length,
        objectivesHydrated: this.tasksObjectivesHydrated,
        matchedUpdates,
        unmatchedUpdates: Math.max(updateMap.size - matchedUpdates, 0),
        duplicateUpdates,
        rebuildDerivedData,
        repairFailedTaskStates,
      });
      if (import.meta.env.DEV && duplicateUpdates > 0) {
        logger.debug('[MetadataStore] Duplicate task objective updates detected', {
          duplicateUpdates,
          updates: updateMap.size,
        });
      }
    },
    /**
     * Merge reward payloads into existing tasks
     */
    mergeTaskRewards(
      tasks: TarkovTaskRewardsQueryResult['tasks'],
      options: { rebuildDerivedData?: boolean } = {}
    ) {
      const { rebuildDerivedData = true } = options;
      const validUpdates = (tasks || []).filter(
        (task): task is NonNullable<TarkovTaskRewardsQueryResult['tasks'][number]> =>
          Boolean(task?.id)
      );
      const updateMap = new Map(validUpdates.map((task) => [task.id, task]));
      const duplicateUpdates = validUpdates.length - updateMap.size;
      const perfTimer = perfStart('[Metadata] mergeTaskRewards', {
        updates: updateMap.size,
        duplicateUpdates,
        existing: this.tasks.length,
      });
      if (updateMap.size === 0 || !this.tasks.length) {
        perfEnd(perfTimer, { skipped: true });
        return;
      }
      let changed = false;
      let matchedUpdates = 0;
      const merged = this.tasks.map((task) => {
        const update = updateMap.get(task.id);
        if (!update) return task;
        matchedUpdates += 1;
        changed = true;
        return {
          ...task,
          startRewards: update.startRewards !== undefined ? update.startRewards : task.startRewards,
          finishRewards:
            update.finishRewards !== undefined ? update.finishRewards : task.finishRewards,
          failureOutcome:
            update.failureOutcome !== undefined ? update.failureOutcome : task.failureOutcome,
        };
      });
      if (changed) {
        this.tasks = markRaw(merged);
        if (rebuildDerivedData) {
          this.rebuildTaskDerivedData();
        }
      }
      perfEnd(perfTimer, {
        changed,
        tasks: this.tasks.length,
        matchedUpdates,
        unmatchedUpdates: Math.max(updateMap.size - matchedUpdates, 0),
        duplicateUpdates,
        rebuildDerivedData,
      });
      const unmatchedUpdates = Math.max(updateMap.size - matchedUpdates, 0);
      if (import.meta.env.DEV && (unmatchedUpdates > 0 || duplicateUpdates > 0)) {
        logger.debug('[MetadataStore] Task reward updates did not map cleanly to loaded tasks', {
          unmatchedUpdates,
          duplicateUpdates,
          loadedTasks: this.tasks.length,
          updates: updateMap.size,
        });
      }
    },
    /**
     * Rebuild derived task structures after incremental merges
     */
    rebuildTaskDerivedData() {
      const perfTimer = perfStart('[Metadata] rebuildTaskDerivedData', {
        tasks: this.tasks.length,
      });
      if (!this.tasks.length) {
        this.resetTasksData();
        perfEnd(perfTimer, { tasks: 0, reset: true });
        return;
      }
      const graphBuilder = useGraphBuilder();
      const processedData = graphBuilder.processTaskData(this.tasks);
      this.tasks = markRaw(processedData.tasks);
      this.taskGraph = processedData.taskGraph;
      this.mapTasks = markRaw(processedData.mapTasks);
      this.objectiveMaps = markRaw(processedData.objectiveMaps);
      this.objectiveGPS = markRaw(processedData.objectiveGPS);
      this.alternativeTasks = markRaw(processedData.alternativeTasks);
      this.alternativeTaskSources = markRaw(
        this.buildAlternativeTaskSources(processedData.alternativeTasks)
      );
      this.neededItemTaskObjectives = markRaw(processedData.neededItemTaskObjectives);
      this.rebuildTaskIndex();
      perfEnd(perfTimer, {
        tasks: this.tasks.length,
        objectiveMaps: Object.keys(this.objectiveMaps).length,
      });
    },
    /**
     * Rebuild O(1) task lookup maps.
     */
    rebuildTaskIndex() {
      const perfTimer = perfStart('[Metadata] rebuildTaskIndex', { tasks: this.tasks.length });
      this.taskById = markRaw(new Map(this.tasks.map((task) => [task.id, task])));
      perfEnd(perfTimer, { size: this.taskById.size });
    },
    /**
     * Rebuild O(1) item lookup maps.
     */
    rebuildItemsIndex() {
      const perfTimer = perfStart('[Metadata] rebuildItemsIndex', { items: this.items.length });
      this.itemsById = markRaw(new Map(this.items.map((item) => [item.id, item])));
      perfEnd(perfTimer, { size: this.itemsById.size });
    },
    /**
     * Build reverse alternative task lookup for failure sources.
     */
    buildAlternativeTaskSources(alternatives: { [taskId: string]: string[] }) {
      const sources: { [taskId: string]: string[] } = {};
      Object.entries(alternatives).forEach(([sourceId, altIds]) => {
        altIds.forEach((altId) => {
          if (!sources[altId]) {
            sources[altId] = [];
          }
          if (!sources[altId]!.includes(sourceId)) {
            sources[altId]!.push(sourceId);
          }
        });
      });
      return sources;
    },
    /**
     * Hydrate task item references with lightweight item data
     */
    hydrateTaskItems(options: { rebuildDerivedData?: boolean } = {}) {
      const { rebuildDerivedData = true } = options;
      const perfTimer = perfStart('[Metadata] hydrateTaskItems', {
        tasks: this.tasks.length,
        items: this.items.length,
        rebuildDerivedData,
      });
      if (!this.items.length || !this.tasks.length) {
        perfEnd(perfTimer, { skipped: true });
        return;
      }
      const itemsById = this.itemsById.size
        ? this.itemsById
        : new Map(this.items.map((item) => [item.id, item]));
      const { pickItemLite, pickItemArray, pickItemMatrix } = createItemPicker(itemsById);
      const hydrateObjective = (objective: TaskObjective): TaskObjective => {
        const obj = objective as ObjectiveWithItems;
        return {
          ...obj,
          item: pickItemLite(obj.item),
          items: pickItemArray(obj.items),
          markerItem: pickItemLite(obj.markerItem),
          questItem: pickItemLite(obj.questItem),
          requiredKeys: pickItemMatrix(obj.requiredKeys),
          containsAll: pickItemArray(obj.containsAll),
          useAny: pickItemArray(obj.useAny),
          usingWeapon: pickItemLite(obj.usingWeapon),
          usingWeaponMods: pickItemArray(obj.usingWeaponMods),
          wearing: pickItemArray(obj.wearing),
          notWearing: pickItemArray(obj.notWearing),
        } as TaskObjective;
      };
      const hydrateRewards = (rewards?: FinishRewards): FinishRewards | undefined => {
        if (!rewards) return rewards;
        return {
          ...rewards,
          items: rewards.items?.map((reward) => ({
            ...reward,
            item: pickItemLite(reward.item) ?? reward.item,
          })),
          offerUnlock: rewards.offerUnlock?.map((unlock) => ({
            ...unlock,
            item: pickItemLite(unlock.item) ?? unlock.item,
          })),
        };
      };
      this.tasks = this.tasks.map((task) => ({
        ...task,
        objectives: task.objectives?.map(hydrateObjective),
        failConditions: task.failConditions?.map(hydrateObjective),
        startRewards: hydrateRewards(task.startRewards),
        finishRewards: hydrateRewards(task.finishRewards),
        failureOutcome: hydrateRewards(task.failureOutcome),
      }));
      this.tasks = markRaw(this.tasks);
      if (rebuildDerivedData) {
        this.rebuildTaskDerivedData();
      }
      perfEnd(perfTimer, { tasks: this.tasks.length, rebuildDerivedData });
    },
    /**
     * Hydrate hideout item references with full item data
     */
    hydrateHideoutItems() {
      const perfTimer = perfStart('[Metadata] hydrateHideoutItems', {
        items: this.items.length,
        stations: this.hideoutStations.length,
      });
      if (!this.items.length || !this.hideoutStations.length) {
        perfEnd(perfTimer, { skipped: true });
        return;
      }
      const itemsById = this.itemsById.size
        ? this.itemsById
        : new Map(this.items.map((item) => [item.id, item]));
      const { pickItemLite } = createItemPicker(itemsById);
      this.hideoutStations = this.hideoutStations.map((station) => ({
        ...station,
        levels: station.levels.map((level) => ({
          ...level,
          itemRequirements: level.itemRequirements?.map((req) => ({
            ...req,
            item: pickItemLite(req.item) ?? req.item,
          })),
          crafts: level.crafts?.map((craft) => ({
            ...craft,
            requiredItems: craft.requiredItems?.map((ri) => ({
              ...ri,
              item: pickItemLite(ri.item) ?? ri.item,
            })),
            rewardItems: craft.rewardItems?.map((ri) => ({
              ...ri,
              item: pickItemLite(ri.item) ?? ri.item,
            })),
          })),
        })),
      }));
      this.hideoutStations = markRaw(this.hideoutStations);
      // Rebuild hideout-derived data now that items are hydrated
      this.processHideoutData({ hideoutStations: this.hideoutStations });
      perfEnd(perfTimer, { stations: this.hideoutStations.length });
    },
    hydratePrestigeItems() {
      if (!this.items.length || !this.prestigeLevels.length) return;
      const itemsById = this.itemsById.size
        ? this.itemsById
        : new Map(this.items.map((item) => [item.id, item]));
      const { pickItemLite, pickItemArray } = createItemPicker(itemsById);
      this.prestigeLevels = markRaw(
        this.prestigeLevels.map((prestige) => ({
          ...prestige,
          conditions: prestige.conditions?.map((condition) => {
            const objective = condition as ObjectiveWithItems;
            return {
              ...objective,
              item: pickItemLite(objective.item),
              items: pickItemArray(objective.items),
              containsAll: pickItemArray(objective.containsAll),
              useAny: pickItemArray(objective.useAny),
            } as TaskObjective;
          }),
        }))
      );
    },
    /**
     * Process tasks data and build derived structures using the graph builder composable
     */
    processTasksData(data: TarkovDataQueryResult) {
      const perfTimer = perfStart('[Metadata] processTasksData', {
        tasks: data.tasks?.length ?? 0,
        maps: data.maps?.length ?? 0,
        traders: data.traders?.length ?? 0,
      });
      const allTasks = data.tasks || [];
      const tradersById = new Map((data.traders || []).map((trader) => [trader.id, trader]));
      const normalizedTasks = allTasks
        .filter((task): task is Task => Boolean(task))
        .map((task) => ({
          ...task,
          trader:
            task.trader?.id && tradersById.has(task.trader.id)
              ? { ...tradersById.get(task.trader.id), ...task.trader }
              : task.trader,
          objectives: this.normalizeObjectiveItems(
            normalizeTaskObjectives<TaskObjective>(task.objectives)
          ),
          failConditions: this.normalizeObjectiveItems(
            normalizeTaskObjectives<TaskObjective>(task.failConditions)
          ),
        }));
      const deduped = this.dedupeObjectiveIds(normalizedTasks);
      this.tasks = markRaw(deduped.tasks);
      // Note: Don't set tasksObjectivesHydrated here - it's managed by processTasksCoreData
      // and mergeTaskObjectives to properly track the two-phase loading
      if (deduped.duplicateObjectiveIds.size > 0) {
        const progressStore = useProgressStore();
        progressStore.migrateDuplicateObjectiveProgress(deduped.duplicateObjectiveIds);
      }
      const tarkovStore = useTarkovStore();
      tarkovStore.repairCompletedTaskObjectives();
      this.maps = markRaw(data.maps || []);
      this.mapSpawnsLoaded = false;
      this.traders = markRaw(data.traders || []);
      if (Array.isArray(data.playerLevels)) {
        this.playerLevels = markRaw(this.convertToCumulativeXP(data.playerLevels));
      }
      this.rebuildTaskDerivedData();
      if (this.tasks.length > 0) {
        tarkovStore.repairFailedTaskStates();
      }
      perfEnd(perfTimer, {
        tasks: this.tasks.length,
        maps: this.maps.length,
        traders: this.traders.length,
      });
    },
    /**
     * Ensure objective.item is populated from objective.items when using the new schema.
     */
    normalizeObjectiveItems(objectives: TaskObjective[]): TaskObjective[] {
      if (!objectives?.length) return objectives;
      return objectives.map((objective) => {
        if (!objective) return objective;
        const obj = objective as ObjectiveWithItems;
        if (!obj.item && Array.isArray(obj.items) && obj.items.length > 0) {
          return { ...objective, item: obj.items[0] };
        }
        return objective;
      });
    },
    /**
     * Process hideout data and build derived structures using the graph builder composable
     */
    processHideoutData(data: TarkovHideoutQueryResult) {
      const perfTimer = perfStart('[Metadata] processHideoutData', {
        stations: data.hideoutStations?.length ?? 0,
      });
      this.hideoutStations = markRaw(data.hideoutStations || []);
      if (this.hideoutStations.length > 0) {
        this.craftSourcesByItemId = markRaw(this.buildCraftSourcesMap(this.hideoutStations));
        const graphBuilder = useGraphBuilder();
        const processedData = graphBuilder.processHideoutData(this.hideoutStations);
        this.hideoutModules = markRaw(processedData.hideoutModules);
        this.hideoutGraph = processedData.hideoutGraph;
        this.neededItemHideoutModules = markRaw(processedData.neededItemHideoutModules);
      } else {
        this.resetHideoutData();
      }
      perfEnd(perfTimer, { stations: this.hideoutStations.length });
    },
    /**
     * Builds a map of craft sources indexed by item ID from hideout stations.
     */
    buildCraftSourcesMap(stations: HideoutStation[]): Map<string, CraftSource[]> {
      const map = new Map<string, CraftSource[]>();
      for (const station of stations) {
        for (const level of station.levels || []) {
          for (const craft of level.crafts || []) {
            for (const reward of craft.rewardItems || []) {
              const itemId = reward?.item?.id;
              if (!itemId) continue;
              const sources = map.get(itemId) ?? [];
              const isDuplicate = sources.some(
                (source) => source.stationId === station.id && source.stationLevel === level.level
              );
              if (!isDuplicate) {
                sources.push({
                  stationId: station.id,
                  stationName: station.name,
                  stationLevel: level.level,
                });
                map.set(itemId, sources);
              }
            }
          }
        }
      }
      return map;
    },
    /**
     * Converts player level XP from per-level increments to cumulative totals
     * The API returns exp as XP needed from previous level (incremental)
     * We need cumulative XP from level 1 for proper level calculations
     *
     * Level 1 should have exp: 0 (you start at level 1 with 0 XP)
     * Level 2 should have exp: 1000 (cumulative XP to reach level 2)
     * Level 37 should have exp: 3,032,022 (cumulative XP to reach level 37)
     */
    convertToCumulativeXP(levels: PlayerLevel[]): PlayerLevel[] {
      if (!levels || levels.length === 0) return [];
      let cumulativeXP = 0;
      return levels.map((level) => {
        cumulativeXP += level.exp;
        return {
          ...level,
          exp: cumulativeXP,
        };
      });
    },
    /**
     * Reset tasks data to empty state
     */
    resetTasksData() {
      this.tasks = markRaw([]);
      this.maps = markRaw([]);
      this.traders = markRaw([]);
      this.taskGraph = markRaw(createGraph());
      this.taskById = markRaw(new Map<string, Task>());
      this.objectiveMaps = markRaw({});
      this.alternativeTasks = markRaw({});
      this.alternativeTaskSources = markRaw({});
      this.objectiveGPS = markRaw({});
      this.mapTasks = markRaw({});
      this.neededItemTaskObjectives = markRaw([]);
      this.objectiveModeCountDifferences = markRaw({});
      this.objectiveModeCountDifferencesHydrated = false;
      this.tasksObjectivesPending = false;
      this.tasksObjectivesHydrated = false;
      this.mapSpawnsLoaded = false;
      this.mapSpawnsLoading = false;
      this.mapSpawnsError = null;
    },
    /**
     * Reset hideout data to empty state
     */
    resetHideoutData() {
      this.hideoutStations = markRaw([]);
      this.hideoutModules = markRaw([]);
      this.hideoutGraph = markRaw(createGraph());
      this.neededItemHideoutModules = markRaw([]);
      this.craftSourcesByItemId = markRaw(new Map<string, CraftSource[]>());
    },
    // Task utility functions
    getTaskById(taskId: string): Task | undefined {
      return this.taskById.get(taskId) ?? this.tasks.find((task) => task.id === taskId);
    },
    getItemById(itemId: string): TarkovItem | undefined {
      return this.itemsById.get(itemId) ?? this.items.find((item) => item.id === itemId);
    },
    getTasksByTrader(traderId: string): Task[] {
      return this.tasks.filter((task) => task.trader?.id === traderId);
    },
    getTasksByMap(mapId: string): Task[] {
      const taskIds = this.mapTasks[mapId] || [];
      return this.tasks.filter((task) => taskIds.includes(task.id));
    },
    isPrerequisiteFor(taskId: string, targetTaskId: string): boolean {
      const targetTask = this.getTaskById(targetTaskId);
      return targetTask?.predecessors?.includes(taskId) ?? false;
    },
    // Trader utility functions
    getTraderById(traderId: string): Trader | undefined {
      return this.traders.find((trader) => trader.id === traderId);
    },
    getTraderByName(traderName: string): Trader | undefined {
      const lowerCaseName = traderName.toLowerCase();
      return this.traders.find(
        (trader) =>
          trader.name.toLowerCase() === lowerCaseName ||
          trader.normalizedName?.toLowerCase() === lowerCaseName
      );
    },
    // Map utility functions
    getMapById(mapId: string): TarkovMap | undefined {
      return this.maps.find((map) => map.id === mapId);
    },
    getMapByName(mapName: string): TarkovMap | undefined {
      const lowerCaseName = mapName.toLowerCase();
      return this.maps.find(
        (map) =>
          map.name.toLowerCase() === lowerCaseName ||
          map.normalizedName?.toLowerCase() === lowerCaseName
      );
    },
    getStaticMapKey(mapName: string, normalizedName?: string): string {
      return deriveStaticMapKey(mapName, normalizedName);
    },
    hasMapSvg(mapId: string): boolean {
      const map = this.getMapById(mapId);
      return !!map?.svg;
    },
    // Hideout utility functions
    getStationById(stationId: string): HideoutStation | undefined {
      return this.hideoutStations.find((station) => station.id === stationId);
    },
    getStationByName(name: string): HideoutStation | undefined {
      return this.stationsByName[name];
    },
    getModuleById(moduleId: string): HideoutModule | undefined {
      return this.hideoutModules.find((module) => module.id === moduleId);
    },
    getModulesByStation(stationId: string): HideoutModule[] {
      return this.modulesByStation[stationId] || [];
    },
    getMaxStationLevel(stationId: string): number {
      return this.maxStationLevels[stationId] || 0;
    },
    isPrerequisiteForModule(moduleId: string, targetModuleId: string): boolean {
      const targetModule = this.getModuleById(targetModuleId);
      return targetModule?.predecessors?.includes(moduleId) ?? false;
    },
    getItemsForModule(moduleId: string): NeededItemHideoutModule[] {
      return this.neededItemHideoutModules.filter((item) => item.hideoutModule.id === moduleId);
    },
    getModulesRequiringItem(itemId: string): NeededItemHideoutModule[] {
      return this.neededItemHideoutModules.filter((item) => item.item.id === itemId);
    },
    getTotalConstructionTime(moduleId: string): number {
      const module = this.getModuleById(moduleId);
      if (!module) return 0;
      let totalTime = module.constructionTime;
      // Add time for all prerequisite modules
      module.predecessors.forEach((prerequisiteId) => {
        const prerequisite = this.getModuleById(prerequisiteId);
        if (prerequisite) {
          totalTime += prerequisite.constructionTime;
        }
      });
      return totalTime;
    },
    /**
     * Refresh all data
     */
    async refresh() {
      this.updateLanguageAndGameMode();
      await this.fetchAllData();
    },
  },
});
// Export type for use in components
export type MetadataStore = ReturnType<typeof useMetadataStore> & MetadataStoreTaskLookup;
