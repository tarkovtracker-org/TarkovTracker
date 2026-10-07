// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
import type { TarkovHideoutQueryResult, TarkovTasksCoreQueryResult } from '@/types/tarkov';
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    migrateDuplicateObjectiveProgress: vi.fn(),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => 'pvp',
    repairCompletedTaskObjectives: vi.fn(),
    repairFailedTaskStates: vi.fn(),
  }),
}));
const tasksCorePayload = (): TarkovTasksCoreQueryResult => ({
  maps: [{ id: 'map-1', name: 'Map 1', normalizedName: 'map-1' }],
  tasks: [
    {
      id: 'task-1',
      name: 'Task 1',
      objectives: [],
      failConditions: [],
      taskRequirements: [],
    },
  ] as TarkovTasksCoreQueryResult['tasks'],
  traders: [{ id: 'trader-1', name: 'Trader 1', normalizedName: 'trader-1' }],
});
const hideoutPayload = (): TarkovHideoutQueryResult => ({
  hideoutStations: [
    {
      id: 'station-1',
      name: 'Station 1',
      normalizedName: 'station-1',
      levels: [
        {
          id: 'station-1-l1',
          level: 1,
          constructionTime: 0,
          itemRequirements: [],
          stationLevelRequirements: [],
          skillRequirements: [],
          traderRequirements: [],
          crafts: [],
        },
      ],
    },
  ] as TarkovHideoutQueryResult['hideoutStations'],
});
describe('useMetadataStore promise tracking', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('advances the core revision on cache replacement but not detail merges', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(tasksCorePayload());
    await store.fetchTasksCoreData();
    expect(store.tasksCoreRevision).toBe(1);
    expect(store.loading).toBe(false);
    await store.fetchTasksCoreData();
    expect(store.tasksCoreRevision).toBe(2);
    expect(store.loading).toBe(false);
    store.mergeTaskObjectives([{ id: 'task-1', objectives: [], failConditions: [] }]);
    expect(store.tasksCoreRevision).toBe(2);
  });
  it('populates tasks and hideout when JSON API responses return valid { data } envelopes', async () => {
    const store = useMetadataStore();
    const fetchMock = vi.fn(async (endpoint: string) => {
      if (endpoint === '/api/tarkov/tasks-core') {
        return { data: tasksCorePayload() };
      }
      if (endpoint === '/api/tarkov/hideout') {
        return { data: hideoutPayload() };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    });
    vi.stubGlobal('$fetch', fetchMock);
    await store.fetchTasksCoreData();
    await store.fetchHideoutData();
    expect(store.tasks.map((task) => task.id)).toEqual(['task-1']);
    expect(store.hideoutStations.map((station) => station.id)).toEqual(['station-1']);
    expect(store.error).toBeNull();
    expect(store.hideoutError).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.hideoutLoading).toBe(false);
    expect(store.prestigeLoading).toBe(false);
    expect(store.prestigeError).toBeNull();
    expect(cacheUtils.setCachedData).toHaveBeenCalledWith(
      'hideout',
      'json-v5-regular',
      'en',
      expect.anything(),
      60 * 60 * 1000
    );
  });
  it('keeps tasks-core hydration working when each action call sees a fresh `this` proxy (Pinia devtools wrapping)', async () => {
    const store = useMetadataStore();
    type StoreRecord = Record<string, (...args: unknown[]) => unknown>;
    const record = store as unknown as StoreRecord;
    const wrappableNames = [
      '_doFetchWithCache',
      'fetchTasksCoreData',
      'fetchWithCache',
      'getApiGameMode',
      'processTasksCoreData',
      'resetTasksData',
    ];
    for (const name of wrappableNames) {
      const original = record[name];
      if (!original) continue;
      record[name] = function patched(this: unknown, ...args: unknown[]) {
        const trackedThis = new Proxy(store, {});
        return original.apply(trackedThis as typeof store, args);
      };
    }
    const fetchMock = vi.fn().mockResolvedValue({ data: tasksCorePayload() });
    vi.stubGlobal('$fetch', fetchMock);
    await store.fetchTasksCoreData();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.tasks.map((task) => task.id)).toEqual(['task-1']);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });
  it('dedupes concurrent in-flight fetches for the same request key', async () => {
    const store = useMetadataStore();
    let resolveFetch!: (value: { data: TarkovTasksCoreQueryResult }) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<{ data: TarkovTasksCoreQueryResult }>((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('$fetch', fetchMock);
    const first = store.fetchTasksCoreData();
    const second = store.fetchTasksCoreData();
    resolveFetch({ data: tasksCorePayload() });
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.tasks.map((task) => task.id)).toEqual(['task-1']);
  });
  it('passes cancellation to the network and rejects without applying data or errors', async () => {
    const store = useMetadataStore();
    const controller = new AbortController();
    let resolveFetch!: (value: { data: TarkovTasksCoreQueryResult }) => void;
    const fetchMock = vi.fn().mockImplementation((_endpoint, options) => {
      expect(options.signal).toBe(controller.signal);
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });
    vi.stubGlobal('$fetch', fetchMock);
    const process = vi.spyOn(store, 'processTasksCoreData');
    const request = store.fetchTasksCoreData(true, controller.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    resolveFetch({ data: tasksCorePayload() });
    await rejected;
    expect(process).not.toHaveBeenCalled();
    expect(cacheUtils.setCachedData).not.toHaveBeenCalled();
    expect(store.error).toBeNull();
  });
  it('never starts network work when aborted during an IndexedDB lookup', async () => {
    const store = useMetadataStore();
    const controller = new AbortController();
    let resolveCache!: (value: null) => void;
    vi.mocked(cacheUtils.getCachedData).mockReturnValue(
      new Promise((resolve) => {
        resolveCache = resolve;
      })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('$fetch', fetchMock);
    const request = store.fetchTasksCoreData(false, controller.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    resolveCache(null);
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.error).toBeNull();
  });
  it('cancels a pending network request without reporting a fetch error', async () => {
    const store = useMetadataStore();
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_endpoint, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        })
    );
    vi.stubGlobal('$fetch', fetchMock);
    const request = store.fetchHideoutData(true, controller.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(store.hideoutError).toBeNull();
    expect(store.hideoutLoading).toBe(false);
  });
  it('clears loading when a cached request replaces an aborted network request', async () => {
    const store = useMetadataStore();
    const oldController = new AbortController();
    let resolveFetch!: (value: { data: TarkovTasksCoreQueryResult }) => void;
    vi.stubGlobal(
      '$fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const oldRequest = store.fetchTasksCoreData(true, oldController.signal);
    const rejected = expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
    expect(store.loading).toBe(true);
    oldController.abort();
    vi.mocked(cacheUtils.getCachedData).mockResolvedValue(tasksCorePayload());
    await store.fetchTasksCoreData(false, new AbortController().signal);
    const loadingAfterCache = store.loading;
    resolveFetch({ data: tasksCorePayload() });
    await rejected;
    expect(loadingAfterCache).toBe(false);
  });
  it('checks the target locale cache without changing the active language', async () => {
    const store = useMetadataStore();
    const lookup = vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue(null);
    expect(await store.hasCriticalLocaleCache('de')).toBe(false);
    expect(lookup).toHaveBeenCalledWith('de');
    expect(store.languageCode).toBe('en');
  });
  it('requires all switch datasets before treating a locale as cached', async () => {
    const store = useMetadataStore();
    vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue({ scope: 'regular-de' } as never);
    vi.mocked(cacheUtils.getCachedData).mockImplementation(async (type) =>
      type === 'tasks-rewards' ? null : {}
    );
    expect(await store.hasCriticalLocaleCache('de')).toBe(false);
    vi.mocked(cacheUtils.getCachedData).mockResolvedValue({});
    expect(await store.hasCriticalLocaleCache('de')).toBe(true);
    expect(cacheUtils.getCachedData).toHaveBeenCalledWith(
      'tasks-objectives',
      'json-v3-regular',
      'de'
    );
    expect(cacheUtils.getCachedData).toHaveBeenCalledWith('bootstrap', 'json-v2-regular', 'en');
  });
});
