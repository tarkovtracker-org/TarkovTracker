// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useKappaOverview } from '@/features/kappa/useKappaOverview';
import type { Task, Trader } from '@/types/tarkov';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const traders: Trader[] = [
  { id: 'prapor', name: 'Prapor', normalizedName: 'prapor' },
  { id: 'therapist', name: 'Therapist', normalizedName: 'therapist' },
  { id: 'jaeger', name: 'Jaeger', normalizedName: 'jaeger' },
];
const tasks: Task[] = [
  {
    id: 't-prapor-low',
    name: 'Prapor Low Level',
    minPlayerLevel: 1,
    kappaRequired: true,
    trader: { id: 'prapor', name: 'Prapor' },
  },
  {
    id: 't-prapor-mid',
    name: 'Prapor Mid Level',
    minPlayerLevel: 20,
    kappaRequired: true,
    trader: { id: 'prapor', name: 'Prapor' },
    taskRequirements: [{ task: { id: 't-prapor-low', name: 'Prapor Low Level' } }],
  },
  {
    id: 't-therapist',
    name: 'Therapist Quest',
    minPlayerLevel: 5,
    kappaRequired: true,
    trader: { id: 'therapist', name: 'Therapist' },
  },
  {
    id: 't-jaeger-lk',
    name: 'Jaeger Lightkeeper',
    minPlayerLevel: 30,
    lightkeeperRequired: true,
    trader: { id: 'jaeger', name: 'Jaeger' },
  },
  {
    id: 't-no-trader',
    name: 'Orphan Quest',
    kappaRequired: true,
  },
];
let completionState: Record<string, boolean> = {};
let failedState: Record<string, boolean> = {};
let unlockedState: Record<string, { self: boolean }> = {};
let invalidState: Record<string, { self: boolean }> = {};
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks,
    sortedTraders: traders,
    editions: [],
    prestigeTaskMap: new Map(),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskComplete: (id: string) => completionState[id] === true,
    isTaskFailed: (id: string) => failedState[id] === true,
    getPMCFaction: () => 'Any',
    getGameEdition: () => undefined,
    getPrestigeLevel: () => 0,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    unlockedTasks: unlockedState,
    invalidTasks: invalidState,
  }),
}));
describe('useKappaOverview', () => {
  beforeEach(() => {
    completionState = {};
    failedState = {};
    unlockedState = {};
    invalidState = {};
  });
  it('filters by kappaRequired tab', () => {
    const tab = ref<'kappa' | 'lightkeeper'>('kappa');
    const { sourceTasks } = useKappaOverview(() => tab.value);
    expect(sourceTasks.value.map((task) => task.id)).toEqual([
      't-prapor-low',
      't-prapor-mid',
      't-therapist',
      't-no-trader',
    ]);
  });
  it('filters by lightkeeperRequired tab', () => {
    const tab = ref<'kappa' | 'lightkeeper'>('lightkeeper');
    const { sourceTasks } = useKappaOverview(() => tab.value);
    expect(sourceTasks.value.map((task) => task.id)).toEqual(['t-jaeger-lk']);
  });
  it('classifies tasks into complete, failed, available, locked', () => {
    completionState['t-prapor-low'] = true;
    failedState['t-prapor-mid'] = true;
    unlockedState['t-therapist'] = { self: true };
    // t-no-trader is locked (no unlock entry, not complete, not failed)
    const { totals, tasksWithStatus } = useKappaOverview(() => 'kappa');
    expect(totals.value).toEqual({
      total: 3,
      completed: 1,
      failed: 1,
      available: 1,
      locked: 1,
    });
    const byId = Object.fromEntries(tasksWithStatus.value.map((row) => [row.task.id, row.status]));
    expect(byId).toEqual({
      't-prapor-low': 'complete',
      't-prapor-mid': 'failed',
      't-therapist': 'available',
      't-no-trader': 'locked',
    });
  });
  it('excludes failed tasks from group totalCount and overview total', () => {
    completionState['t-prapor-low'] = true;
    failedState['t-prapor-mid'] = true;
    const { totals, groupedByTrader } = useKappaOverview(() => 'kappa');
    expect(totals.value.total).toBe(3);
    const prapor = groupedByTrader.value.find((group) => group.trader.id === 'prapor');
    expect(prapor?.totalCount).toBe(1);
    expect(prapor?.completedCount).toBe(1);
  });
  it('groups tasks by trader, sorts groups by sortedTraders order, sorts rows by level then name', () => {
    const { groupedByTrader } = useKappaOverview(() => 'kappa');
    const groupOrder = groupedByTrader.value.map((group) => group.trader.id);
    expect(groupOrder).toEqual(['prapor', 'therapist', '__other__']);
    const praporRows = groupedByTrader.value
      .find((group) => group.trader.id === 'prapor')!
      .rows.map((row) => row.task.id);
    expect(praporRows).toEqual(['t-prapor-low', 't-prapor-mid']);
  });
  it('reports per-group completion totals', () => {
    completionState['t-prapor-low'] = true;
    const { groupedByTrader } = useKappaOverview(() => 'kappa');
    const prapor = groupedByTrader.value.find((group) => group.trader.id === 'prapor');
    expect(prapor?.totalCount).toBe(2);
    expect(prapor?.completedCount).toBe(1);
  });
  it('orders rows strictly by required level (spreadsheet-style), ignoring dependency depth', () => {
    // t-prapor-low (Lv 1) and t-prapor-mid (Lv 20) share a trader column.
    // t-prapor-mid depends on t-prapor-low, but the spreadsheet sorts purely
    // by required level so we expect Lv 1 first then Lv 20.
    const { groupedByTrader } = useKappaOverview(() => 'kappa');
    const ids = groupedByTrader.value
      .find((group) => group.trader.id === 'prapor')!
      .rows.map((row) => row.task.id);
    expect(ids).toEqual(['t-prapor-low', 't-prapor-mid']);
  });
  it('exposes lockedBy hint pointing at the first uncompleted required predecessor', () => {
    const { tasksWithStatus } = useKappaOverview(() => 'kappa');
    const mid = tasksWithStatus.value.find((row) => row.task.id === 't-prapor-mid');
    expect(mid?.status).toBe('locked');
    expect(mid?.lockedBy).toEqual({ id: 't-prapor-low', name: 'Prapor Low Level' });
  });
  it('clears lockedBy hint once the predecessor is complete', () => {
    completionState['t-prapor-low'] = true;
    unlockedState['t-prapor-mid'] = { self: true };
    const { tasksWithStatus } = useKappaOverview(() => 'kappa');
    const mid = tasksWithStatus.value.find((row) => row.task.id === 't-prapor-mid');
    expect(mid?.status).toBe('available');
    expect(mid?.lockedBy).toBeUndefined();
  });
  it('excludes invalid locked tasks from group totals and overview total', () => {
    invalidState['t-prapor-mid'] = { self: true };
    const { totals, groupedByTrader } = useKappaOverview(() => 'kappa');
    // Middling quest is invalid, so only low, therapist, and no-trader are counted (total = 3)
    expect(totals.value.total).toBe(3);
    const prapor = groupedByTrader.value.find((group) => group.trader.id === 'prapor');
    expect(prapor?.totalCount).toBe(1); // mid is excluded
  });
});
describe('useKappaOverview chain ordering', () => {
  it('keeps multi-part chains together anchored at the first part level', async () => {
    const chainTasks: Task[] = [
      {
        id: 't-hp-p1',
        name: 'Healthcare Privacy - Part 1',
        minPlayerLevel: 28,
        kappaRequired: true,
        trader: { id: 'therapist', name: 'Therapist' },
      },
      {
        id: 't-hp-p2',
        name: 'Healthcare Privacy - Part 2',
        minPlayerLevel: 32,
        kappaRequired: true,
        trader: { id: 'therapist', name: 'Therapist' },
      },
      {
        id: 't-hp-p3',
        name: 'Healthcare Privacy - Part 3',
        minPlayerLevel: 35,
        kappaRequired: true,
        trader: { id: 'therapist', name: 'Therapist' },
      },
      {
        id: 't-other-30',
        name: 'Sample Quest',
        minPlayerLevel: 30,
        kappaRequired: true,
        trader: { id: 'therapist', name: 'Therapist' },
      },
    ];
    vi.resetModules();
    vi.doMock('@/stores/useMetadata', () => ({
      useMetadataStore: () => ({
        tasks: chainTasks,
        sortedTraders: [{ id: 'therapist', name: 'Therapist', normalizedName: 'therapist' }],
        editions: [],
        prestigeTaskMap: new Map(),
      }),
    }));
    vi.doMock('@/stores/useTarkov', () => ({
      useTarkovStore: () => ({
        isTaskComplete: () => false,
        isTaskFailed: () => false,
        getPMCFaction: () => 'Any',
        getGameEdition: () => undefined,
        getPrestigeLevel: () => 0,
      }),
    }));
    vi.doMock('@/stores/useProgress', () => ({
      useProgressStore: () => ({ unlockedTasks: {}, invalidTasks: {} }),
    }));
    const { useKappaOverview: useFresh } = await import('@/features/kappa/useKappaOverview');
    const { groupedByTrader } = useFresh(() => 'kappa');
    const ids = groupedByTrader.value
      .find((group) => group.trader.id === 'therapist')!
      .rows.map((row) => row.task.id);
    // Anchor for the chain is Lv 28 (Part 1), so all three parts come before
    // the standalone Lv 30 quest, in part-number order.
    expect(ids).toEqual(['t-hp-p1', 't-hp-p2', 't-hp-p3', 't-other-30']);
    vi.doUnmock('@/stores/useMetadata');
    vi.doUnmock('@/stores/useTarkov');
    vi.doUnmock('@/stores/useProgress');
  });
});
