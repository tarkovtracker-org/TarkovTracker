import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { GAME_MODES } from '@/utils/constants';
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
    await pending;
    expect(store.objectiveModeCountDifferences).toEqual({
      stable: { pve: 6, pvp: 5 },
    });
    expect(store.objectiveModeCountDifferencesHydrated).toBe(true);
  });
});
