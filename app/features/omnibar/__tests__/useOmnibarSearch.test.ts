// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useOmnibarSearch } from '@/features/omnibar/useOmnibarSearch';
import type { HideoutStation, TarkovItem, Task } from '@/types/tarkov';
const metadataState = reactive({
  tasks: [] as Task[],
  items: [] as TarkovItem[],
  hideoutStations: [] as HideoutStation[],
});
const routeState = reactive({ name: 'index' as string });
mockNuxtImport('useRoute', () => () => routeState);
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataState,
}));
const createTask = (
  id: string,
  name: string,
  mapName?: string,
  traderName?: string,
  rewardName?: string,
  offerUnlockName?: string
): Task =>
  ({
    finishRewards:
      rewardName || offerUnlockName
        ? {
            items: rewardName
              ? [{ count: 1, item: { id: `${id}-reward`, name: rewardName } }]
              : undefined,
            offerUnlock: offerUnlockName
              ? [
                  {
                    id: `${id}-unlock`,
                    item: { id: `${id}-unlock-item`, name: offerUnlockName },
                    level: 1,
                    trader: { id: 'trader', name: 'Trader' },
                  },
                ]
              : undefined,
          }
        : undefined,
    id,
    name,
    map: mapName ? { name: mapName } : undefined,
    trader: traderName ? { name: traderName } : undefined,
  }) as Task;
const createItem = (id: string, name: string, shortName?: string): TarkovItem =>
  ({ id, name, shortName }) as TarkovItem;
const createStation = (id: string, name: string): HideoutStation =>
  ({ id, name }) as HideoutStation;
describe('useOmnibarSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    metadataState.tasks = [
      createTask('t1', 'Debut', 'Customs', 'Prapor'),
      createTask('t2', 'Shooter Born in Heaven', 'Lighthouse'),
      createTask('t3', 'Gunsmith', 'Factory', 'Mechanic', 'Graphics card'),
      createTask(
        't4',
        'Postman Pat',
        'Streets of Tarkov',
        'Peacekeeper',
        undefined,
        'Ledx Skin Transilluminator'
      ),
    ];
    metadataState.items = [
      createItem('i1', 'Bitcoin', 'BTC'),
      createItem('i2', 'Graphics card', 'GPU'),
    ];
    metadataState.hideoutStations = [
      createStation('h1', 'Bitcoin Farm'),
      createStation('h2', 'Workbench'),
    ];
    routeState.name = 'index';
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('returns empty groups until the query reaches two characters', async () => {
    const { searchQuery, results } = useOmnibarSearch();
    searchQuery.value = 'b';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value).toEqual({ tasks: [], items: [], hideout: [] });
  });
  it('matches task reward items', async () => {
    const { searchQuery, results } = useOmnibarSearch();
    searchQuery.value = 'graphics';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.tasks.map((task) => task.id)).toEqual(['t3']);
  });
  it('matches task offer unlock reward items', async () => {
    const { searchQuery, results } = useOmnibarSearch();
    searchQuery.value = 'ledx';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.tasks.map((task) => task.id)).toEqual(['t4']);
  });
  it('matches tasks by name, map, and trader', async () => {
    const { searchQuery, results } = useOmnibarSearch();
    searchQuery.value = 'customs';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.tasks.map((task) => task.id)).toEqual(['t1']);
    searchQuery.value = 'mechanic';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.tasks.map((task) => task.id)).toEqual(['t3']);
  });
  it('matches items by name and short name across groups', async () => {
    const { searchQuery, results } = useOmnibarSearch();
    searchQuery.value = 'bitcoin';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.items.map((item) => item.id)).toEqual(['i1']);
    expect(results.value.hideout.map((station) => station.id)).toEqual(['h1']);
    searchQuery.value = 'gpu';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.items.map((item) => item.id)).toEqual(['i2']);
  });
  it('caps each result group at five entries', async () => {
    metadataState.items = Array.from({ length: 8 }, (_, index) =>
      createItem(`bulk-${index}`, `Bulk Item ${index}`)
    );
    const { searchQuery, results } = useOmnibarSearch();
    searchQuery.value = 'bulk item';
    await vi.advanceTimersByTimeAsync(250);
    expect(results.value.items).toHaveLength(5);
  });
  it('derives the current context from the active route name', () => {
    routeState.name = 'tasks';
    expect(useOmnibarSearch().currentContext.value).toBe('tasks');
    routeState.name = 'hideout';
    expect(useOmnibarSearch().currentContext.value).toBe('hideout');
    routeState.name = 'needed-items';
    expect(useOmnibarSearch().currentContext.value).toBe('items');
    routeState.name = 'dashboard';
    expect(useOmnibarSearch().currentContext.value).toBe('global');
  });
});
