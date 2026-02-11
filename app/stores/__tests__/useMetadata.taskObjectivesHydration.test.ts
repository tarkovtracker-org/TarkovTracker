import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
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
});
