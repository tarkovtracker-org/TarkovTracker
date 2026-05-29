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
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks,
    sortedTraders: traders,
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskComplete: (id: string) => completionState[id] === true,
    isTaskFailed: (id: string) => failedState[id] === true,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    unlockedTasks: unlockedState,
  }),
}));
describe('useKappaOverview', () => {
  beforeEach(() => {
    completionState = {};
    failedState = {};
    unlockedState = {};
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
      total: 4,
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
});
