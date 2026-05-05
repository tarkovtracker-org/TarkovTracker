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
});
