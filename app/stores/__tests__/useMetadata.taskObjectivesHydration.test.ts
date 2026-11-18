import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as asyncUtils from '@/utils/async';
import { GAME_MODES } from '@/utils/constants';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import * as cacheUtils from '@/utils/tarkovCache';
import type { Task } from '@/types/tarkov';
const progressStoreMock = vi.hoisted(() => ({
  migrateDuplicateObjectiveProgress: vi.fn(),
}));
const tarkovStoreMock = vi.hoisted(() => ({
  repairCompletedTaskObjectives: vi.fn(),
  repairFailedTaskStates: vi.fn(),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => progressStoreMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStoreMock,
}));
describe('useMetadataStore fetchTaskObjectivesData', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem(STORAGE_KEYS.cachePurgeAt);
    vi.restoreAllMocks();
  });
  it('rebuilds derived task data when objectives load before items', async () => {
    const store = useMetadataStore();
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    store.tasks = [
      {
        id: 'task-1',
        failConditions: [],
        name: 'Task 1',
        objectives: [],
        taskRequirements: [],
      },
    ] as Task[];
    store.rebuildTaskDerivedData();
    expect(store.objectiveMaps).toEqual({});
    const hydrateSpy = vi.spyOn(store, 'hydrateTaskItems');
    const rebuildSpy = vi.spyOn(store, 'rebuildTaskDerivedData');
    vi.spyOn(store, 'fetchWithCache').mockImplementation(async (config) => {
      const typedConfig = config as { processData: (data: { tasks: unknown[] }) => void };
      typedConfig.processData({
        tasks: [
          {
            failConditions: [],
            id: 'task-1',
            objectives: [{ id: 'obj-1', location: { id: 'map-1' } }],
          },
        ],
      });
    });
    await store.fetchTaskObjectivesData();
    expect(hydrateSpy).toHaveBeenCalledWith({ rebuildDerivedData: false });
    expect(rebuildSpy).toHaveBeenCalled();
    expect(store.objectiveMaps).toEqual({
      'task-1': [{ mapID: 'map-1', objectiveID: 'obj-1' }],
    });
    expect(store.tasksObjectivesHydrated).toBe(true);
  });
  it('exposes a load error and shares a retry for the current objective catalog', async () => {
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const store = useMetadataStore();
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    store.tasks = [{ id: 'task-1', objectives: [] }] as Task[];
    const tasks = [{ id: 'task-1', objectives: [{ id: 'obj-1', count: 2 }] }];
    const response = Promise.withResolvers<{ data: { tasks: typeof tasks } }>();
    const failure = new Error('Objectives unavailable');
    const fetchMock = vi.fn().mockRejectedValueOnce(failure).mockReturnValueOnce(response.promise);
    vi.stubGlobal('$fetch', fetchMock);
    await store.fetchTaskObjectivesData();
    expect(store.tasksObjectivesError).toBe(failure);
    expect(store.tasksObjectivesPending).toBe(false);
    expect(store.tasksObjectivesHydrated).toBe(false);
    const first = store.fetchTaskObjectivesData();
    const second = store.fetchTaskObjectivesData();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(store.tasksObjectivesError).toBeNull();
    expect(store.tasksObjectivesPending).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/tarkov/tasks-objectives',
      expect.objectContaining({
        query: expect.objectContaining({ gameMode: 'regular', lang: 'en' }),
      })
    );
    response.resolve({ data: { tasks } });
    await Promise.all([first, second]);
    expect(store.tasksObjectivesError).toBeNull();
    expect(store.tasksObjectivesPending).toBe(false);
    expect(store.tasksObjectivesHydrated).toBe(true);
    expect(store.getTaskById('task-1')?.objectives?.[0]?.count).toBe(2);
  });
  it('does not persist objective data that predates an observed cache purge', async () => {
    const retry = Promise.withResolvers<undefined>();
    const wait = vi.spyOn(asyncUtils, 'delay').mockReturnValue(retry.promise);
    const setCached = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const store = useMetadataStore();
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    store.tasks = [{ id: 'task-1', objectives: [{ id: 'obj-1', count: 1 }] }] as Task[];
    const catalog = {
      data: {
        tasks: [{ id: 'task-1', failConditions: [], objectives: [{ id: 'obj-1', count: 3 }] }],
      },
    };
    const oldResponse = Promise.withResolvers<
      typeof catalog & { dataOverlay: { fetchedAt: string } }
    >();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce({
        ...catalog,
        dataOverlay: { fetchedAt: '2026-11-18T14:02:00Z' },
      });
    vi.stubGlobal('$fetch', fetchMock);
    const pending = store.fetchTaskObjectivesData(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const purge = '2026-11-18T14:01:00Z';
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purge);
    oldResponse.resolve({ ...catalog, dataOverlay: { fetchedAt: '2026-11-18T14:00:00Z' } });
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    expect(setCached).not.toHaveBeenCalled();
    expect(store.tasks[0]?.objectives?.[0]?.count).toBe(1);
    retry.resolve(undefined);
    await pending;
    expect(store.tasks[0]?.objectives?.[0]?.count).toBe(3);
    expect(setCached).toHaveBeenCalledWith(
      'tasks-objectives',
      `json-v5-regular-${Date.parse(purge)}`,
      'en',
      catalog.data,
      expect.any(Number)
    );
  });
  it('shares the retry and only merges the current objective catalog', async () => {
    const retry = Promise.withResolvers<undefined>();
    const wait = vi.spyOn(asyncUtils, 'delay').mockReturnValue(retry.promise);
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, '2025-01-03T00:00:00Z');
    const store = useMetadataStore();
    store.tasks = [{ id: 'task-1', objectives: [] }] as Task[];
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    const merge = vi.spyOn(store, 'mergeTaskObjectives');
    const objectives = [{ id: 'bunker', count: 3 }];
    const tasks = [{ id: 'task-1', failConditions: [], objectives }];
    const oldTasks = [{ ...tasks[0], objectives: [{ id: 'old-bunker', count: 1 }] }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: { tasks: oldTasks },
        dataOverlay: { fetchedAt: '2025-01-02T00:00:00Z' },
      })
      .mockResolvedValueOnce({
        data: { tasks },
        dataOverlay: { fetchedAt: '2025-01-04T00:00:00Z' },
      });
    vi.stubGlobal('$fetch', fetchMock);
    const first = store.fetchTaskObjectivesData();
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    const finished = vi.fn();
    const second = store.fetchTaskObjectivesData().then(finished);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(merge).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
    retry.resolve(undefined);
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(merge).toHaveBeenCalledExactlyOnceWith(tasks, expect.anything());
    expect(store.tasks[0]?.objectives?.[0]?.id).toBe('bunker');
    expect(store.tasksObjectivesHydrated).toBe(true);
  });
  it('reports handled count failures without marking them stale', async () => {
    const store = useMetadataStore();
    store.tasks = [{ id: 'task-1', objectives: [] }] as Task[];
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await store.fetchObjectiveModeCountDifferences()).toBeUndefined();
    expect(store.objectiveModeCountDifferencesHydrated).toBe(false);
  });
  it('ignores stale objective mode differences response after mode changes', async () => {
    const store = useMetadataStore();
    store.currentGameMode = GAME_MODES.PVP;
    store.languageCode = 'en';
    store.tasks = [
      {
        failConditions: [],
        id: 'task-1',
        name: 'Task 1',
        objectives: [{ count: 1, id: 'obj-1' }],
        taskRequirements: [],
      },
    ] as Task[];
    type ObjectiveModeResponse = {
      data: {
        tasks: Array<{
          failConditions: unknown[];
          id: string;
          objectives: Array<{ count: number; id: string }>;
        }>;
      };
    };
    let resolveFetch!: (value: ObjectiveModeResponse | PromiseLike<ObjectiveModeResponse>) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<ObjectiveModeResponse>((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('$fetch', fetchMock);
    const pending = store.fetchObjectiveModeCountDifferences(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    store.currentGameMode = GAME_MODES.PVE;
    store.tasks = [
      {
        failConditions: [],
        id: 'task-2',
        name: 'Task 2',
        objectives: [{ count: 4, id: 'obj-2' }],
        taskRequirements: [],
      },
    ] as Task[];
    store.objectiveModeCountDifferences = {
      stable: { pve: 6, pvp: 5 },
    };
    store.objectiveModeCountDifferencesHydrated = true;
    resolveFetch({
      data: {
        tasks: [
          {
            failConditions: [],
            id: 'task-1',
            objectives: [{ count: 3, id: 'obj-1' }],
          },
        ],
      },
    });
    expect(await pending).toBe('stale');
    expect(store.objectiveModeCountDifferences).toEqual({
      stable: { pve: 6, pvp: 5 },
    });
    expect(store.objectiveModeCountDifferencesHydrated).toBe(true);
  });
  it('requests other-mode counts once in English and keeps them across task array swaps', async () => {
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const store = useMetadataStore();
    store.currentGameMode = GAME_MODES.PVP;
    store.languageCode = 'de';
    store.tasks = [{ id: 'task-1', objectives: [{ count: 1, id: 'obj-1' }] }] as Task[];
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('$fetch', fetchMock);
    const pending = store.fetchObjectiveModeCountDifferences();
    // Reward/item hydration replaces the array reference without changing the catalog.
    store.tasks = [...store.tasks] as Task[];
    resolveFetch({ data: { tasks: [{ id: 'task-1', objectives: [{ count: 3, id: 'obj-1' }] }] } });
    expect(await pending).toBeUndefined();
    expect(store.objectiveModeCountDifferences).toEqual({ 'obj-1': { pvp: 1, pve: 3 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/tarkov/tasks-objectives', {
      query: { gameMode: 'pve', lang: 'en', version: 'json-v5' },
    });
    // A language switch reloads the catalog; the counts come from the session memo.
    store.languageCode = 'fr';
    store.objectiveModeCountDifferencesHydrated = false;
    await store.fetchObjectiveModeCountDifferences();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.objectiveModeCountDifferences).toEqual({ 'obj-1': { pvp: 1, pve: 3 } });
  });
  it('reloads memoized other-mode counts after the local purge generation changes', async () => {
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const store = useMetadataStore();
    const catalog = { data: { tasks: [] }, dataOverlay: { fetchedAt: '2025-01-04T00:00:00Z' } };
    const fetchMock = vi.fn().mockResolvedValue(catalog);
    vi.stubGlobal('$fetch', fetchMock);
    await store.loadModeObjectiveCounts('pve');
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, '2025-01-03T00:00:00Z');
    await store.loadModeObjectiveCounts('pve');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('discards stale other-mode counts and retries in the same purge generation', async () => {
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, '2025-01-03T00:00:00Z');
    const store = useMetadataStore();
    const catalog = { data: { tasks: [] } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ...catalog, dataOverlay: { fetchedAt: '2025-01-02T00:00:00Z' } })
      .mockResolvedValueOnce({ ...catalog, dataOverlay: { fetchedAt: '2025-01-04T00:00:00Z' } });
    vi.stubGlobal('$fetch', fetchMock);
    await expect(store.loadModeObjectiveCounts('pve')).rejects.toThrow(
      'Objective catalog predates the latest cache purge'
    );
    await expect(store.loadModeObjectiveCounts('pve')).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('can fetch objectives when local storage is blocked', async () => {
    const store = useMetadataStore();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    const fetch = vi.spyOn(store, 'fetchWithCache').mockResolvedValue();
    await store.fetchTaskObjectivesData(true);
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ cacheKey: 'json-v5-regular' }));
  });
  it('reads persisted other-mode counts without a request', async () => {
    const getCached = vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({ 'obj-1': 5 });
    const store = useMetadataStore();
    store.currentGameMode = GAME_MODES.PVE;
    store.tasks = [{ id: 'task-1', objectives: [{ count: 2, id: 'obj-1' }] }] as Task[];
    const fetchMock = vi.fn();
    vi.stubGlobal('$fetch', fetchMock);
    await store.fetchObjectiveModeCountDifferences();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCached).toHaveBeenCalledWith('tasks-objectives', 'json-v5-counts-regular', 'en');
    expect(store.objectiveModeCountDifferences).toEqual({ 'obj-1': { pvp: 5, pve: 2 } });
  });
  it('retries other-mode counts after a failed load', async () => {
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const store = useMetadataStore();
    store.currentGameMode = GAME_MODES.PVP;
    store.tasks = [{ id: 'task-1', objectives: [{ count: 1, id: 'obj-1' }] }] as Task[];
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: { tasks: [{ id: 'task-1', objectives: [{ count: 2, id: 'obj-1' }] }] },
      });
    vi.stubGlobal('$fetch', fetchMock);
    await store.fetchObjectiveModeCountDifferences();
    expect(store.objectiveModeCountDifferencesHydrated).toBe(false);
    await store.fetchObjectiveModeCountDifferences();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.objectiveModeCountDifferences).toEqual({ 'obj-1': { pvp: 1, pve: 2 } });
  });
});
