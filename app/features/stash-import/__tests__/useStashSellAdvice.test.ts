// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { useStashSellAdvice } from '@/features/stash-import/useStashSellAdvice';
import type { useMetadataStore } from '@/stores/useMetadata';
import type { useTarkovStore } from '@/stores/useTarkov';
import type { ReviewedCell, ScanResult } from '@/utils/stashScan/types';
const h = vi.hoisted(() => ({
  metadata: {} as ReturnType<typeof useMetadataStore>,
  store: {} as ReturnType<typeof useTarkovStore>,
  write: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => h.metadata }));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => h.store }));
const rows = () =>
  ref([
    {
      cell: { key: 1, x: 0, y: 0, width: 65, height: 65, empty: false },
      itemId: 'item',
      quantity: 1,
      reviewed: true,
      raidStatus: 'unknown',
      excluded: false,
    },
  ] as ReviewedCell[]);
const result = {
  catalog: {
    items: [
      {
        id: 'item',
        name: 'Item',
        maxStack: 1,
        width: 1,
        height: 1,
      },
    ],
  },
} as ScanResult;
beforeEach(() => {
  h.metadata = reactive({
    initialized: true,
    initializationFailed: false,
    loading: false,
    tasksCoreRefreshing: false,
    tasksObjectivesPending: false,
    tasksObjectivesHydrated: true,
    tasksObjectivesError: null,
    error: null,
    hideoutLoading: false,
    hideoutError: null,
    itemsError: null,
    currentGameMode: 'pvp',
    itemsGameMode: 'regular',
    tasks: [
      {
        id: 'later',
        minPlayerLevel: 60,
        objectives: [{ id: 'objective', type: 'giveItem', item: { id: 'other' } }],
      },
    ],
    hideoutModules: [{ id: 'module', itemRequirements: [] }],
    getItemById: vi.fn(() => ({ id: 'item' })),
    fetchAllData: h.fetch,
  }) as unknown as ReturnType<typeof useMetadataStore>;
  h.store = reactive({
    currentGameMode: 'pvp',
    isTaskComplete: vi.fn(() => false),
    isTaskFailed: vi.fn(() => false),
    isTaskObjectiveComplete: vi.fn(() => false),
    isHideoutModuleComplete: vi.fn(() => false),
    setTaskObjectiveCount: h.write,
    setHideoutPartCount: h.write,
  }) as unknown as ReturnType<typeof useTarkovStore>;
});
describe('read-only sell advice adapter', () => {
  it('recomputes after catalog and progress changes without writing or fetching', () => {
    const advice = useStashSellAdvice(rows(), result);
    expect(advice.groups.value[0]?.quantity).toBe(1);
    h.metadata.tasks[0]!.objectives![0]!.item = { id: 'item' } as never;
    expect(advice.groups.value).toEqual([]);
    vi.mocked(h.store.isTaskObjectiveComplete).mockReturnValue(true);
    // Mock behavior changes are not reactive, so trigger the real reactive catalog dependency.
    h.metadata.tasks = [...h.metadata.tasks];
    expect(advice.groups.value[0]?.quantity).toBe(1);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it.each(['loading', 'tasksCoreRefreshing', 'tasksObjectivesPending', 'hideoutLoading'] as const)(
    'withholds advice during %s',
    (flag) => {
      const advice = useStashSellAdvice(rows(), result);
      h.metadata[flag] = true;
      expect(advice.ready.value).toBe(false);
      expect(advice.groups.value).toEqual([]);
    }
  );
  it.each(['tasksObjectivesError', 'hideoutError', 'itemsError', 'error'] as const)(
    'withholds advice when %s is present',
    (key) => {
      h.metadata[key] = new Error('unavailable');
      const advice = useStashSellAdvice(rows(), result);
      expect(advice.ready.value).toBe(false);
      expect(advice.groups.value).toEqual([]);
    }
  );
  it('withdraws stale advice on mode changes and evaluates the new mode only after reopening', () => {
    const advice = useStashSellAdvice(rows(), result);
    expect(advice.groups.value).toHaveLength(1);
    h.store.currentGameMode = 'pve';
    expect(advice.ready.value).toBe(false);
    h.metadata.currentGameMode = 'pve';
    h.metadata.itemsGameMode = 'pve';
    h.metadata.tasks[0]!.objectives![0]!.item = { id: 'item' } as never;
    expect(advice.groups.value).toEqual([]);
    const reopened = useStashSellAdvice(rows(), result);
    expect(reopened.ready.value).toBe(true);
    expect(reopened.groups.value).toEqual([]);
  });
  it('identifies the actual catalog gap instead of suggesting unmapped quests have no item use', () => {
    h.metadata.tasks[0]!.objectives = [{ id: 'placeholder' }];
    const advice = useStashSellAdvice(rows(), result);
    expect(advice.ready.value).toBe(false);
    expect(advice.groups.value).toEqual([]);
    expect(advice.incompleteTasks.value).toEqual(['later']);
  });
  it('does not claim an unknown current-mode metadata item can be sold', () => {
    vi.mocked(h.metadata.getItemById).mockReturnValue(undefined);
    expect(useStashSellAdvice(rows(), result).groups.value).toEqual([]);
  });
});
