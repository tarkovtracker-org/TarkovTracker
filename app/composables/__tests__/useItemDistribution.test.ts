import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NeededItemHideoutModule, NeededItemTaskObjective, TarkovItem } from '@/types/tarkov';
const mockStoreState = {
  tasks: new Map<string, { kappaRequired?: boolean; minPlayerLevel?: number }>(),
  objectiveCounts: {} as Record<string, number>,
  hideoutPartCounts: {} as Record<string, number>,
  patchedState: null as unknown,
};
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    getTaskById: (id: string) => mockStoreState.tasks.get(id),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getObjectiveCount: (id: string) => mockStoreState.objectiveCounts[id] ?? 0,
    getHideoutPartCount: (id: string) => mockStoreState.hideoutPartCounts[id] ?? 0,
    $patch: (fn: (state: unknown) => void) => {
      const state = {
        currentGameMode: 'pvp',
        pvp: { taskObjectives: {}, hideoutParts: {} },
        pve: { taskObjectives: {}, hideoutParts: {} },
      };
      fn(state);
      mockStoreState.patchedState = state;
    },
  }),
}));
const expectDefined = <T>(value: T, message?: string): NonNullable<T> => {
  if (value === undefined || value === null) {
    throw new Error(message ?? 'Expected value to be defined');
  }
  return value;
};
const createItem = (id: string): TarkovItem => ({
  id,
  name: `Item ${id}`,
  shortName: id,
  normalizedName: id.toLowerCase(),
  iconLink: `https://example.com/${id}.png`,
  link: `https://example.com/${id}`,
  wikiLink: `https://wiki.example.com/${id}`,
});
const createTaskObjective = (
  id: string,
  taskId: string,
  options: {
    count?: number;
    foundInRaid?: boolean;
    item?: TarkovItem;
  } = {}
): NeededItemTaskObjective => ({
  id,
  needType: 'taskObjective',
  taskId,
  count: options.count ?? 1,
  foundInRaid: options.foundInRaid ?? false,
  item: options.item ?? createItem('item-1'),
});
const createHideoutModule = (
  id: string,
  options: {
    count?: number;
    foundInRaid?: boolean;
    level?: number;
    item?: TarkovItem;
  } = {}
): NeededItemHideoutModule => ({
  id,
  needType: 'hideoutModule',
  count: options.count ?? 1,
  foundInRaid: options.foundInRaid ?? false,
  item: options.item ?? createItem('item-1'),
  hideoutModule: {
    id: `module-${id}`,
    level: options.level ?? 1,
    stationId: 'station-1',
    predecessors: [],
    successors: [],
    parents: [],
    children: [],
    description: '',
    constructionTime: 0,
    itemRequirements: [],
    stationLevelRequirements: [],
    skillRequirements: [],
    traderRequirements: [],
    crafts: [],
  },
});
describe('useItemDistribution', () => {
  beforeEach(() => {
    mockStoreState.tasks.clear();
    mockStoreState.objectiveCounts = {};
    mockStoreState.hideoutPartCounts = {};
    mockStoreState.patchedState = null;
    vi.clearAllMocks();
  });
  describe('getObjectiveCurrentCount', () => {
    it('returns task objective count from store', async () => {
      mockStoreState.objectiveCounts = { 'obj-1': 5 };
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { getObjectiveCurrentCount } = useItemDistribution();
      const objective = createTaskObjective('obj-1', 'task-1');
      expect(getObjectiveCurrentCount(objective)).toBe(5);
    });
    it('returns hideout part count from store', async () => {
      mockStoreState.hideoutPartCounts = { 'hideout-1': 3 };
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { getObjectiveCurrentCount } = useItemDistribution();
      const module = createHideoutModule('hideout-1');
      expect(getObjectiveCurrentCount(module)).toBe(3);
    });
    it('returns 0 for missing counts', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { getObjectiveCurrentCount } = useItemDistribution();
      const objective = createTaskObjective('missing', 'task-1');
      expect(getObjectiveCurrentCount(objective)).toBe(0);
    });
  });
  describe('sortTaskObjectives', () => {
    it('prioritizes kappa-required tasks', async () => {
      mockStoreState.tasks.set('task-kappa', { kappaRequired: true, minPlayerLevel: 20 });
      mockStoreState.tasks.set('task-normal', { kappaRequired: false, minPlayerLevel: 10 });
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { sortTaskObjectives } = useItemDistribution();
      const objectives = [
        createTaskObjective('obj-1', 'task-normal'),
        createTaskObjective('obj-2', 'task-kappa'),
      ];
      const sorted = sortTaskObjectives(objectives);
      const first = expectDefined(sorted[0]);
      const second = expectDefined(sorted[1]);
      expect(first.taskId).toBe('task-kappa');
      expect(second.taskId).toBe('task-normal');
    });
    it('sorts by minPlayerLevel within same kappa priority', async () => {
      mockStoreState.tasks.set('task-high', { kappaRequired: true, minPlayerLevel: 30 });
      mockStoreState.tasks.set('task-low', { kappaRequired: true, minPlayerLevel: 10 });
      mockStoreState.tasks.set('task-mid', { kappaRequired: true, minPlayerLevel: 20 });
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { sortTaskObjectives } = useItemDistribution();
      const objectives = [
        createTaskObjective('obj-1', 'task-high'),
        createTaskObjective('obj-2', 'task-low'),
        createTaskObjective('obj-3', 'task-mid'),
      ];
      const sorted = sortTaskObjectives(objectives);
      const first = expectDefined(sorted[0]);
      const second = expectDefined(sorted[1]);
      const third = expectDefined(sorted[2]);
      expect(first.taskId).toBe('task-low');
      expect(second.taskId).toBe('task-mid');
      expect(third.taskId).toBe('task-high');
    });
    it('handles missing task metadata gracefully', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { sortTaskObjectives } = useItemDistribution();
      const objectives = [
        createTaskObjective('obj-1', 'unknown-task'),
        createTaskObjective('obj-2', 'another-unknown'),
      ];
      expect(() => sortTaskObjectives(objectives)).not.toThrow();
    });
  });
  describe('sortHideoutModules', () => {
    it('sorts by hideout level', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { sortHideoutModules } = useItemDistribution();
      const modules = [
        createHideoutModule('mod-3', { level: 3 }),
        createHideoutModule('mod-1', { level: 1 }),
        createHideoutModule('mod-2', { level: 2 }),
      ];
      const sorted = sortHideoutModules(modules);
      const first = expectDefined(sorted[0]);
      const second = expectDefined(sorted[1]);
      const third = expectDefined(sorted[2]);
      expect(first.hideoutModule.level).toBe(1);
      expect(second.hideoutModule.level).toBe(2);
      expect(third.hideoutModule.level).toBe(3);
    });
  });
  describe('distributeItems', () => {
    it('distributes FIR items to FIR task objectives first', async () => {
      mockStoreState.tasks.set('task-1', { kappaRequired: true, minPlayerLevel: 10 });
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-fir', 'task-1', { count: 3, foundInRaid: true }),
      ];
      const result = distributeItems(5, 0, taskObjectives, []);
      expect(result.updates).toHaveLength(1);
      const update = expectDefined(result.updates[0]);
      expect(update).toEqual({
        id: 'obj-fir',
        type: 'task',
        count: 3,
        needed: 3,
      });
      expect(result.remainingFir).toBe(2);
      expect(result.remainingNonFir).toBe(0);
    });
    it('distributes non-FIR items to non-FIR task objectives', async () => {
      mockStoreState.tasks.set('task-1', { kappaRequired: true, minPlayerLevel: 10 });
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-nonfir', 'task-1', { count: 3, foundInRaid: false }),
      ];
      const result = distributeItems(0, 5, taskObjectives, []);
      expect(result.updates).toHaveLength(1);
      const update = expectDefined(result.updates[0]);
      expect(update.count).toBe(3);
      expect(result.remainingNonFir).toBe(2);
    });
    it('uses FIR items for non-FIR objectives when non-FIR pool is depleted', async () => {
      mockStoreState.tasks.set('task-1', { kappaRequired: true, minPlayerLevel: 10 });
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-nonfir', 'task-1', { count: 5, foundInRaid: false }),
      ];
      const result = distributeItems(3, 2, taskObjectives, []);
      expect(result.updates).toHaveLength(1);
      const update = expectDefined(result.updates[0]);
      expect(update.count).toBe(5);
      expect(result.remainingFir).toBe(0);
      expect(result.remainingNonFir).toBe(0);
    });
    it('distributes to hideout modules after task objectives', async () => {
      mockStoreState.tasks.set('task-1', { kappaRequired: true, minPlayerLevel: 10 });
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-1', 'task-1', { count: 2, foundInRaid: true }),
      ];
      const hideoutModules = [createHideoutModule('mod-1', { count: 3, foundInRaid: true })];
      const result = distributeItems(6, 0, taskObjectives, hideoutModules);
      expect(result.updates).toHaveLength(2);
      const objectiveUpdate = expectDefined(result.updates.find((u) => u.id === 'obj-1'));
      const hideoutUpdate = expectDefined(result.updates.find((u) => u.id === 'mod-1'));
      expect(objectiveUpdate.count).toBe(2);
      expect(hideoutUpdate.count).toBe(3);
      expect(result.remainingFir).toBe(1);
    });
    it('respects current progress when distributing', async () => {
      mockStoreState.tasks.set('task-1', { kappaRequired: true, minPlayerLevel: 10 });
      mockStoreState.objectiveCounts = { 'obj-1': 2 };
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-1', 'task-1', { count: 5, foundInRaid: true }),
      ];
      const result = distributeItems(2, 0, taskObjectives, []);
      const update = expectDefined(result.updates[0]);
      expect(update.count).toBe(4);
      expect(result.remainingFir).toBe(0);
    });
    it('returns empty updates when objectives are already satisfied', async () => {
      mockStoreState.tasks.set('task-1', { kappaRequired: true, minPlayerLevel: 10 });
      mockStoreState.objectiveCounts = { 'obj-1': 5 };
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-1', 'task-1', { count: 5, foundInRaid: true }),
      ];
      const result = distributeItems(10, 0, taskObjectives, []);
      expect(result.updates).toHaveLength(0);
      expect(result.remainingFir).toBe(10);
    });
    it('handles empty objectives array', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { distributeItems } = useItemDistribution();
      const result = distributeItems(5, 5, [], []);
      expect(result.updates).toHaveLength(0);
      expect(result.remainingFir).toBe(5);
      expect(result.remainingNonFir).toBe(5);
    });
  });
  describe('applyDistribution', () => {
    it('updates task objectives in store', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { applyDistribution } = useItemDistribution();
      applyDistribution({
        updates: [{ id: 'obj-1', type: 'task', count: 3, needed: 5 }],
        remainingFir: 0,
        remainingNonFir: 0,
      });
      const state = mockStoreState.patchedState as {
        pvp: { taskObjectives: Record<string, { count: number }> };
      };
      expect(state.pvp.taskObjectives['obj-1']).toEqual({
        count: 3,
      });
    });
    it('updates hideout parts in store', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { applyDistribution } = useItemDistribution();
      applyDistribution({
        updates: [{ id: 'mod-1', type: 'hideout', count: 5, needed: 5 }],
        remainingFir: 0,
        remainingNonFir: 0,
      });
      const state = mockStoreState.patchedState as {
        pvp: { hideoutParts: Record<string, { count: number; complete: boolean }> };
      };
      const part = expectDefined(state.pvp.hideoutParts['mod-1']);
      expect(part.count).toBe(5);
      expect(part.complete).toBe(true);
    });
    it('does not set complete flag for task objectives when count reaches needed', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { applyDistribution } = useItemDistribution();
      applyDistribution({
        updates: [{ id: 'obj-1', type: 'task', count: 5, needed: 5 }],
        remainingFir: 0,
        remainingNonFir: 0,
      });
      const state = mockStoreState.patchedState as {
        pvp: {
          taskObjectives: Record<string, { count: number; complete?: boolean; timestamp?: number }>;
        };
      };
      const objective = expectDefined(state.pvp.taskObjectives['obj-1']);
      expect(objective.count).toBe(5);
      expect(objective.complete).toBeUndefined();
      expect(objective.timestamp).toBeUndefined();
    });
    it('does not patch store when updates array is empty', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { applyDistribution } = useItemDistribution();
      applyDistribution({
        updates: [],
        remainingFir: 0,
        remainingNonFir: 0,
      });
      expect(mockStoreState.patchedState).toBeNull();
    });
  });
  describe('resetObjectives', () => {
    it('resets task objective counts to zero', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { resetObjectives } = useItemDistribution();
      const taskObjectives = [
        createTaskObjective('obj-1', 'task-1'),
        createTaskObjective('obj-2', 'task-2'),
      ];
      resetObjectives(taskObjectives, []);
      const state = mockStoreState.patchedState as {
        pvp: { taskObjectives: Record<string, { count: number }> };
      };
      expect(state.pvp.taskObjectives['obj-1']).toEqual({
        count: 0,
      });
      expect(state.pvp.taskObjectives['obj-2']).toEqual({
        count: 0,
      });
    });
    it('resets hideout part counts to zero', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { resetObjectives } = useItemDistribution();
      const hideoutModules = [createHideoutModule('mod-1'), createHideoutModule('mod-2')];
      resetObjectives([], hideoutModules);
      const state = mockStoreState.patchedState as {
        pvp: { hideoutParts: Record<string, { count: number; complete: boolean }> };
      };
      const firstPart = expectDefined(state.pvp.hideoutParts['mod-1']);
      const secondPart = expectDefined(state.pvp.hideoutParts['mod-2']);
      expect(firstPart.count).toBe(0);
      expect(secondPart.count).toBe(0);
    });
    it('does not patch store when both arrays are empty', async () => {
      const { useItemDistribution } = await import('@/composables/useItemDistribution');
      const { resetObjectives } = useItemDistribution();
      resetObjectives([], []);
      expect(mockStoreState.patchedState).toBeNull();
    });
  });
});
