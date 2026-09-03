import { describe, expect, it, vi } from 'vitest';
import { computed, isRef, ref } from 'vue';
import type { Task } from '@/types/tarkov';
const objectiveCompletions = ref<Record<string, Record<string, boolean>>>({});
const tasksCompletions = ref<Record<string, Record<string, boolean>>>({});
const tasksFailed = ref<Record<string, Record<string, boolean>>>({});
const unlockedTasks = ref<Record<string, Record<string, boolean>>>({});
const visibleTeamStores = ref<Record<string, Record<string, unknown>>>({ self: {} });
const objectiveMaps = ref<Record<string, Array<{ objectiveID: string; mapID: string }>>>({});
const objectiveGPS = ref<Record<string, Array<{ objectiveID: string; x: number; y: number }>>>({});
const mapTeamAllHidden = ref(false);
const pinnedTaskIds = ref<string[]>([]);
const completedObjectiveIds = ref<Set<string>>(new Set());
const completedTaskIds = ref<Set<string>>(new Set());
const failedTaskIds = ref<Set<string>>(new Set());
const setup = async () => {
  vi.resetModules();
  objectiveCompletions.value = {};
  tasksCompletions.value = {};
  tasksFailed.value = {};
  unlockedTasks.value = {};
  visibleTeamStores.value = { self: {} };
  objectiveMaps.value = {};
  objectiveGPS.value = {};
  mapTeamAllHidden.value = false;
  pinnedTaskIds.value = [];
  completedObjectiveIds.value = new Set();
  completedTaskIds.value = new Set();
  failedTaskIds.value = new Set();
  vi.doMock('pinia', async () => {
    const actual = await vi.importActual<typeof import('pinia')>('pinia');
    return {
      ...actual,
      storeToRefs: (store: Record<string, unknown>) => {
        const refs: Record<string, unknown> = {};
        Object.entries(store).forEach(([key, value]) => {
          if (typeof value === 'function') return;
          refs[key] = isRef(value) ? value : computed(() => store[key as keyof typeof store]);
        });
        return refs;
      },
    };
  });
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      objectiveMaps: objectiveMaps.value,
      objectiveGPS: objectiveGPS.value,
    }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => ({
      get mapTeamAllHidden() {
        return mapTeamAllHidden.value;
      },
      get getPinnedTaskIds() {
        return pinnedTaskIds.value;
      },
    }),
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => ({
      objectiveCompletions,
      tasksCompletions,
      tasksFailed,
      unlockedTasks,
      visibleTeamStores: visibleTeamStores.value,
    }),
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => ({
      isTaskObjectiveComplete: (objId: string) => completedObjectiveIds.value.has(objId),
      isTaskComplete: (taskId: string) => completedTaskIds.value.has(taskId),
      isTaskFailed: (taskId: string) => failedTaskIds.value.has(taskId),
    }),
  }));
  const { useMapObjectiveMarks } = await import('@/composables/useMapObjectiveMarks');
  return { useMapObjectiveMarks };
};
const objectiveWithLocation = (id: string, mapId: string) => ({
  id,
  zones: [],
  possibleLocations: [
    {
      map: { id: mapId },
      positions: [{ x: 1, y: 0, z: 1 }],
    },
  ],
});
describe('useMapObjectiveMarks', () => {
  it('marks a pinned task objective as pinned:true and an unpinned one as pinned:false', async () => {
    const { useMapObjectiveMarks } = await setup();
    const tasks: Task[] = [
      {
        id: 'task-pinned',
        name: 'Pinned Task',
        objectives: [objectiveWithLocation('obj-pinned', 'customs')],
      },
      {
        id: 'task-unpinned',
        name: 'Unpinned Task',
        objectives: [objectiveWithLocation('obj-unpinned', 'customs')],
      },
    ];
    unlockedTasks.value = {
      'task-pinned': { self: true },
      'task-unpinned': { self: true },
    };
    pinnedTaskIds.value = ['task-pinned'];
    const mapId = computed(() => 'customs');
    const shouldShowCompletedObjectives = computed(() => false);
    const { mapObjectiveMarks, mapObjectiveVisibility } = useMapObjectiveMarks({
      mapId,
      shouldShowCompletedObjectives,
      tasks: computed(() => tasks),
    });
    const pinnedMark = mapObjectiveMarks.value.find((mark) => mark.id === 'obj-pinned');
    const unpinnedMark = mapObjectiveMarks.value.find((mark) => mark.id === 'obj-unpinned');
    expect(pinnedMark?.pinned).toBe(true);
    expect(unpinnedMark?.pinned).toBe(false);
    expect(mapObjectiveVisibility.value.get('obj-pinned')).toEqual({
      category: 'pinned',
      selfNeedsObjective: true,
    });
  });
  // A pinned task keeps `category: 'pinned'` even when the local player has no stake in the
  // objective, so the visibility record has to report that separately or the required-items
  // summary cannot tell a real requirement from a teammate's.
  it.each([
    {
      route: 'the player has not unlocked the task',
      apply: () => {
        unlockedTasks.value = { 'task-pinned': { 'teammate-a': true } };
      },
    },
    {
      route: 'the player failed the task',
      apply: () => {
        unlockedTasks.value = { 'task-pinned': { self: true, 'teammate-a': true } };
        failedTaskIds.value = new Set(['task-pinned']);
      },
    },
  ])(
    'reports selfNeedsObjective:false on a pinned objective only a teammate needs when $route',
    async ({ apply }) => {
      const { useMapObjectiveMarks } = await setup();
      visibleTeamStores.value = { self: {}, 'teammate-a': {} };
      pinnedTaskIds.value = ['task-pinned'];
      apply();
      const tasks: Task[] = [
        {
          id: 'task-pinned',
          name: 'Pinned Task',
          objectives: [objectiveWithLocation('obj-pinned', 'customs')],
        },
      ];
      const { mapObjectiveVisibility } = useMapObjectiveMarks({
        mapId: computed(() => 'customs'),
        shouldShowCompletedObjectives: computed(() => false),
        tasks: computed(() => tasks),
      });
      expect(mapObjectiveVisibility.value.get('obj-pinned')).toEqual({
        category: 'pinned',
        selfNeedsObjective: false,
      });
    }
  );
  it('determines pinned state from task.id, not obj.id', async () => {
    const { useMapObjectiveMarks } = await setup();
    // The objective id on task-1 deliberately collides with a pinned id string,
    // to prove pinning is resolved via the enclosing task, not the objective.
    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Task One',
        objectives: [objectiveWithLocation('task-2', 'customs')],
      },
      {
        id: 'task-2',
        name: 'Task Two',
        objectives: [objectiveWithLocation('obj-2', 'customs')],
      },
    ];
    unlockedTasks.value = {
      'task-1': { self: true },
      'task-2': { self: true },
    };
    pinnedTaskIds.value = ['task-2'];
    const mapId = computed(() => 'customs');
    const shouldShowCompletedObjectives = computed(() => false);
    const { mapObjectiveMarks } = useMapObjectiveMarks({
      mapId,
      shouldShowCompletedObjectives,
      tasks: computed(() => tasks),
    });
    const markFromTask1 = mapObjectiveMarks.value.find((mark) => mark.id === 'task-2');
    const markFromTask2 = mapObjectiveMarks.value.find((mark) => mark.id === 'obj-2');
    expect(markFromTask1?.pinned).toBe(false);
    expect(markFromTask2?.pinned).toBe(true);
  });
  it('keeps marks for unpinned tasks (map-level pinned filtering is applied downstream)', async () => {
    const { useMapObjectiveMarks } = await setup();
    unlockedTasks.value = {
      'task-pinned': { self: true },
      'task-unpinned': { self: true },
    };
    pinnedTaskIds.value = ['task-pinned'];
    const tasks: Task[] = [
      {
        id: 'task-pinned',
        name: 'Pinned Task',
        objectives: [objectiveWithLocation('obj-pinned', 'customs')],
      },
      {
        id: 'task-unpinned',
        name: 'Unpinned Task',
        objectives: [objectiveWithLocation('obj-unpinned', 'customs')],
      },
    ];
    const mapId = computed(() => 'customs');
    const shouldShowCompletedObjectives = computed(() => false);
    const { mapObjectiveMarks } = useMapObjectiveMarks({
      mapId,
      shouldShowCompletedObjectives,
      tasks: computed(() => tasks),
    });
    expect(mapObjectiveMarks.value.find((mark) => mark.id === 'obj-pinned')?.pinned).toBe(true);
    expect(mapObjectiveMarks.value.find((mark) => mark.id === 'obj-unpinned')?.pinned).toBe(false);
    expect(mapObjectiveMarks.value).toHaveLength(2);
  });
});
