import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { GAME_MODES } from '@/utils/constants';
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
    vi.restoreAllMocks();
  });
  it('rebuilds derived task data when objectives load before items', async () => {
    const store = useMetadataStore();
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
      query: { gameMode: 'pve', lang: 'en', version: 'json-v3' },
    });
    // A language switch reloads the catalog; the counts come from the session memo.
    store.languageCode = 'fr';
    store.objectiveModeCountDifferencesHydrated = false;
    await store.fetchObjectiveModeCountDifferences();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.objectiveModeCountDifferences).toEqual({ 'obj-1': { pvp: 1, pve: 3 } });
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
    expect(getCached).toHaveBeenCalledWith('tasks-objectives', 'json-v3-counts-regular', 'en');
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
