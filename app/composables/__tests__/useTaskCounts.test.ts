import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskCounts } from '@/composables/useTaskCounts';
import type { Task } from '@/types/tarkov';
const task = (id: string) =>
  ({ id, name: id, factionName: 'Any', trader: { id: 'trader-1', name: 'Trader' } }) as Task;
const metadataStore = {
  tasks: [
    task('available'),
    task('hidden-available'),
    task('hidden-locked'),
    task('hidden-done'),
    task('hidden-failed'),
  ],
  tasksObjectivesHydrated: true,
  prestigeTaskMap: new Map<string, number>(),
  getExcludedTaskIdsForEdition: () => new Set<string>(),
};
const preferencesStore = {
  getHideNonKappaTasks: false,
  getShowLightkeeperTasks: true,
  getShowNonSpecialTasks: true,
  getOnlyTasksWithRequiredKeys: false,
  getHiddenTaskIds: [] as string[],
};
const progressStore = {
  visibleTeamStores: { self: {} },
  playerFaction: { self: 'USEC' },
  unlockedTasks: {
    available: { self: true },
    'hidden-available': { self: true },
    'hidden-done': { self: true },
    'hidden-failed': { self: true },
  },
  tasksCompletions: { 'hidden-done': { self: true }, 'hidden-failed': { self: true } },
  tasksFailed: { 'hidden-failed': { self: true } },
  invalidTasks: {},
};
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => metadataStore }));
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => preferencesStore }));
vi.mock('@/stores/useProgress', () => ({ useProgressStore: () => progressStore }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ getPrestigeLevel: () => 0, getGameEdition: () => 1 }),
}));
describe('useTaskCounts hidden tasks', () => {
  beforeEach(() => {
    preferencesStore.getHiddenTaskIds = [];
  });
  it('counts every task when nothing is hidden', () => {
    expect(useTaskCounts().calculateStatusCounts('self')).toEqual({
      all: 5,
      available: 2,
      locked: 1,
      completed: 1,
      failed: 1,
    });
  });
  it('leaves hidden tasks out of to-do counts but keeps them once completed', () => {
    preferencesStore.getHiddenTaskIds = [
      'hidden-available',
      'hidden-locked',
      'hidden-done',
      'hidden-failed',
    ];
    const { calculateStatusCounts, calculateTraderCounts } = useTaskCounts();
    expect(calculateStatusCounts('self')).toEqual({
      all: 1,
      available: 1,
      locked: 0,
      completed: 1,
      failed: 1,
    });
    expect(calculateTraderCounts('self', 'available')).toEqual({ 'trader-1': 1 });
    expect(calculateTraderCounts('self', 'locked')).toEqual({ 'trader-1': 0 });
    expect(calculateTraderCounts('self', 'all')).toEqual({ 'trader-1': 1 });
    expect(calculateTraderCounts('self', 'completed')).toEqual({ 'trader-1': 1 });
    expect(calculateTraderCounts('self', 'failed')).toEqual({ 'trader-1': 1 });
  });
  it('applies the same rule in the all-users view', () => {
    preferencesStore.getHiddenTaskIds = [
      'hidden-available',
      'hidden-locked',
      'hidden-done',
      'hidden-failed',
    ];
    expect(useTaskCounts().calculateStatusCounts('all')).toMatchObject({
      all: 1,
      available: 1,
      locked: 0,
      completed: 1,
      failed: 1,
    });
  });
});
