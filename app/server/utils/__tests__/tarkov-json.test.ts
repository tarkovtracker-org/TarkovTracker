import { describe, expect, it, vi } from 'vitest';
import {
  adaptBootstrapResponse,
  adaptHideoutResponse,
  adaptItemsResponse,
  adaptMapSpawnsResponse,
  adaptPrestigeResponse,
  adaptTaskObjectivesResponse,
  adaptTaskRewardsResponse,
  adaptTasksCoreResponse,
  fetchTarkovJsonEndpoint,
} from '@/server/utils/tarkov-json';
type TestJsonFetcher = <T = unknown>(
  url: string,
  request: { headers: { Accept: string }; retry: number; timeout: number }
) => Promise<T>;
const createFetcher = (responses: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    const response = responses[url];
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error(`Unexpected URL: ${url}`);
    return response;
  }) as unknown as TestJsonFetcher;
describe('fetchTarkovJsonEndpoint', () => {
  it('merges English translations into the base response', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': {
        data: { items: { item1: { id: 'item1', name: 'item.name' } } },
        translations: ['$.data.items.*.name'],
      },
      'https://json.tarkov.dev/regular/items_en': {
        data: { 'item.name': 'Bandage' },
      },
    });
    const result = await fetchTarkovJsonEndpoint<{ items: Record<string, { name: string }> }>(
      'items',
      {
        deps: { fetcher },
        lang: 'en',
      }
    );
    expect(result.items.item1?.name).toBe('Bandage');
  });
  it('supports an overridden JSON base URL', async () => {
    const fetcher = createFetcher({
      'https://json-mirror.example/regular/items': {
        data: { items: { item1: { id: 'item1', name: 'item.name' } } },
        translations: ['$.data.items.*.name'],
      },
      'https://json-mirror.example/regular/items_en': {
        data: { 'item.name': 'Bandage' },
      },
    });
    const result = await fetchTarkovJsonEndpoint<{ items: Record<string, { name: string }> }>(
      'items',
      {
        baseUrl: 'https://json-mirror.example/',
        deps: { fetcher },
        lang: 'en',
      }
    );
    expect(result.items.item1?.name).toBe('Bandage');
  });
  it('falls back to English translations when the primary language is missing a key', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/tasks': {
        data: { tasks: { task1: { id: 'task1', name: 'task.name' } } },
        translations: ['$.data.tasks.*.name'],
      },
      'https://json.tarkov.dev/regular/tasks_de': {
        data: {},
      },
      'https://json.tarkov.dev/regular/tasks_en': {
        data: { 'task.name': 'Debut' },
      },
    });
    const result = await fetchTarkovJsonEndpoint<{ tasks: Record<string, { name: string }> }>(
      'tasks',
      {
        deps: { fetcher },
        lang: 'de',
      }
    );
    expect(result.tasks.task1?.name).toBe('Debut');
  });
  it('falls back to English translations when the primary language fetch fails', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/tasks': {
        data: { tasks: { task1: { id: 'task1', name: 'task.name' } } },
        translations: ['$.data.tasks.*.name'],
      },
      'https://json.tarkov.dev/regular/tasks_de': new Error('missing translation file'),
      'https://json.tarkov.dev/regular/tasks_en': {
        data: { 'task.name': 'Debut' },
      },
    });
    const result = await fetchTarkovJsonEndpoint<{ tasks: Record<string, { name: string }> }>(
      'tasks',
      {
        deps: { fetcher, logger: { error: vi.fn(), warn: vi.fn() }, sleep: vi.fn() },
        lang: 'de',
        maxRetries: 1,
      }
    );
    expect(result.tasks.task1?.name).toBe('Debut');
  });
  it('returns base data when the English translation fetch fails', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': {
        data: { items: { item1: { id: 'item1', name: 'item.name' } } },
        translations: ['$.data.items.*.name'],
      },
      'https://json.tarkov.dev/regular/items_en': new Error('missing translation file'),
    });
    const result = await fetchTarkovJsonEndpoint<{ items: Record<string, { name: string }> }>(
      'items',
      {
        deps: { fetcher, logger: { error: vi.fn(), warn: vi.fn() }, sleep: vi.fn() },
        lang: 'en',
        maxRetries: 1,
      }
    );
    expect(result.items.item1?.name).toBe('item.name');
  });
  it('keeps the translation key when no translation exists', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/maps': {
        data: { maps: { map1: { id: 'map1', name: 'map.name' } } },
        translations: ['$.data.maps.*.name'],
      },
      'https://json.tarkov.dev/regular/maps_de': {
        data: {},
      },
      'https://json.tarkov.dev/regular/maps_en': {
        data: {},
      },
    });
    const result = await fetchTarkovJsonEndpoint<{ maps: Record<string, { name: string }> }>(
      'maps',
      {
        deps: { fetcher },
        lang: 'de',
      }
    );
    expect(result.maps.map1?.name).toBe('map.name');
  });
  it('ignores unsafe and non-string translation values', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': {
        data: {
          items: {
            item1: { id: 'item1', name: '__proto__', shortName: 'item.short' },
            item2: { id: 'item2', name: 'item.name' },
          },
        },
        translations: ['$.data.items.*.name', '$.data.items.*.shortName'],
      },
      'https://json.tarkov.dev/regular/items_en': {
        data: { 'item.name': { nested: true }, 'item.short': 'Short' },
      },
    });
    const result = await fetchTarkovJsonEndpoint<{
      items: Record<string, { name: string; shortName?: string }>;
    }>('items', {
      deps: { fetcher },
      lang: 'en',
    });
    expect(result.items.item1?.name).toBe('__proto__');
    expect(result.items.item1?.shortName).toBe('Short');
    expect(result.items.item2?.name).toBe('item.name');
  });
  it('falls back to JSONPath when the fast path cannot parse a translation path', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': {
        data: { items: [{ id: 'item1', name: 'item.name', tags: ['tag.one', 'tag.two'] }] },
        translations: ['$..name', '$.data.items[*].tags[*]'],
      },
      'https://json.tarkov.dev/regular/items_en': {
        data: { 'item.name': 'Bandage', 'tag.one': 'Medical', 'tag.two': 'Healing' },
      },
    });
    const result = await fetchTarkovJsonEndpoint<{
      items: Array<{ id: string; name: string; tags: string[] }>;
    }>('items', {
      deps: { fetcher },
      lang: 'en',
    });
    expect(result.items[0]?.name).toBe('Bandage');
    expect(result.items[0]?.tags).toEqual(['Medical', 'Healing']);
  });
  it('does not fetch translation files when the base response has no translation paths', async () => {
    const payload = { items: {} };
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': { data: payload, translations: [] },
    });
    const result = await fetchTarkovJsonEndpoint('items', {
      deps: { fetcher },
      lang: 'de',
    });
    expect(result).toBe(payload);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('dedupes simultaneous upstream envelope fetches by URL', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as TestJsonFetcher;
    const first = fetchTarkovJsonEndpoint('items', { deps: { fetcher }, lang: 'en' });
    const second = fetchTarkovJsonEndpoint('items', { deps: { fetcher }, lang: 'en' });
    resolveFetch({ data: { items: {} }, translations: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([{ items: {} }, { items: {} }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries transient failures', async () => {
    let baseAttempts = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'https://json.tarkov.dev/regular/items') {
        baseAttempts++;
        if (baseAttempts === 1) throw new Error('network');
        return { data: { items: {} }, translations: [] };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as TestJsonFetcher;
    const sleep = vi.fn(async () => undefined);
    const result = await fetchTarkovJsonEndpoint('items', {
      deps: { fetcher, logger: { error: vi.fn(), warn: vi.fn() }, sleep },
      lang: 'en',
      maxRetries: 2,
    });
    expect(result).toEqual({ items: {} });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it('throws for malformed envelopes', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': { nope: true },
      'https://json.tarkov.dev/regular/items_en': { data: {} },
    });
    const sleep = vi.fn(async () => undefined);
    await expect(
      fetchTarkovJsonEndpoint('items', {
        deps: { fetcher, logger: { error: vi.fn(), warn: vi.fn() }, sleep },
        lang: 'en',
        maxRetries: 3,
      })
    ).rejects.toThrow('missing data');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
  it('throws for null envelope data without retrying validation failures', async () => {
    const fetcher = createFetcher({
      'https://json.tarkov.dev/regular/items': { data: null },
    });
    const sleep = vi.fn(async () => undefined);
    await expect(
      fetchTarkovJsonEndpoint('items', {
        deps: { fetcher, logger: { error: vi.fn(), warn: vi.fn() }, sleep },
        lang: 'en',
        maxRetries: 3,
      })
    ).rejects.toThrow('missing data');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
describe('tarkov JSON adapters', () => {
  const itemsPayload = {
    itemCategories: {
      cat1: { id: 'cat1', name: 'Medical' },
    },
    items: {
      item1: {
        id: 'item1',
        name: 'Salewa',
        shortName: 'Salewa',
        iconLink: 'icon.webp',
        image512pxLink: 'image.webp',
        backgroundColor: 'blue',
        categories: ['cat1'],
        properties: { cures: ['LightBleeding'], useTime: 3 },
      },
      item2: { id: 'item2', name: 'Roubles' },
    },
    playerLevels: [{ level: 1, exp: 0, levelBadgeImageLink: 'level.webp' }],
  };
  const mapsPayload = {
    maps: {
      map1: {
        id: 'map1',
        name: 'Customs',
        normalizedName: 'customs',
        spawns: [{ zoneName: 'spawn-a', position: { x: 1, y: 2, z: 3 } }],
      },
    },
  };
  const tradersPayload = {
    trader1: { id: 'trader1', name: 'Prapor', levels: [{ id: 'trader1-1', level: 1 }] },
  };
  const hideoutPayload = {
    station1: {
      id: 'station1',
      name: 'Medstation',
      levels: [
        {
          id: 'station1-1',
          level: 1,
          constructionTime: 0,
          itemRequirements: [
            { id: 'req1', item: 'item1', count: 1, attributes: { foundInRaid: true } },
          ],
          stationLevelRequirements: [],
          skillRequirements: [
            { id: '5d494a0e5b56502f18c98a02-1-2', level: 5 },
            {
              id: 'skill-req2',
              level: 3,
              name: 'Skill requirement label',
              skill: { id: 'Strength', name: 'Strength' },
            },
          ],
          traderRequirements: [{ id: 'trader-req1', trader: 'trader1', value: 1 }],
        },
      ],
    },
  };
  const tasksPayload = {
    prestige: [
      {
        id: 'prestige1',
        prestigeLevel: 1,
        conditions: [
          { id: 'level1', type: 'playerLevel', playerLevel: 47 },
          { id: 'task-status1', type: 'taskStatus', task: 'task1', status: ['complete'] },
          { id: 'station1', type: 'hideoutStation', station: 'station1', stationLevel: 1 },
          { id: 'item-condition1', type: 'haveItem', items: ['item1'], count: 2 },
        ],
      },
    ],
    questItems: {
      questItem1: {
        id: 'questItem1',
        name: 'Bronze pocket watch',
        shortName: 'Watch',
        iconLink: 'quest-icon.webp',
      },
    },
    tasks: {
      task1: {
        id: 'task1',
        name: 'Debut',
        trader: 'trader1',
        map: 'map1',
        taskRequirements: [{ task: 'task0', status: ['complete'] }],
        traderRequirements: [{ trader: 'trader1', value: 0.2 }],
        objectives: [
          {
            id: 'objective1',
            type: 'giveItem',
            items: ['item1', ...Array.from({ length: 25 }, (_, index) => `bulk-item-${index}`)],
            maps: ['map1'],
            count: 1,
            requiredKeys: [['item1'], ['item2', 'missing-item']],
          },
          {
            id: 'objective2',
            type: 'findQuestItem',
            questItem: 'questItem1',
          },
        ],
        failConditions: [{ id: 'fail1', type: 'taskStatus', task: 'task2' }],
        startRewards: { items: [{ item: 'item2', count: 1000 }] },
        finishRewards: {
          traderStanding: [{ trader: 'trader1', standing: 0.01 }],
          items: [{ item: 'item1', count: 1 }],
        },
        failureOutcome: { skillLevelReward: [{ skill: 'Strength', level: 1 }] },
      },
    },
  };
  it('adapts items and bootstrap data', () => {
    const items = adaptItemsResponse(itemsPayload).data.items;
    expect(items[0]).toMatchObject({
      category: { id: 'cat1', name: 'Medical' },
      id: 'item1',
      name: 'Salewa',
    });
    expect(adaptItemsResponse(itemsPayload, { lite: true }).data.items[0]).not.toHaveProperty(
      'category'
    );
    expect(adaptBootstrapResponse(itemsPayload).data.playerLevels).toHaveLength(1);
  });
  it('adapts tasks, maps, and traders for core route data', () => {
    const result = adaptTasksCoreResponse(tasksPayload, mapsPayload, tradersPayload).data;
    expect(result.tasks[0]).toMatchObject({
      id: 'task1',
      map: { id: 'map1', name: 'Customs' },
      trader: { id: 'trader1', name: 'Prapor' },
    });
    expect(result.maps[0]?.spawns).toHaveLength(1);
    expect(result.traders[0]?.levels).toHaveLength(1);
  });
  it('adapts map spawns', () => {
    expect(adaptMapSpawnsResponse(mapsPayload).data.maps[0]).toMatchObject({
      id: 'map1',
      spawns: [{ zoneName: 'spawn-a' }],
    });
  });
  it('adapts task objectives and rewards without items/maps lookups', () => {
    const objectives = adaptTaskObjectivesResponse(tasksPayload, {
      hideoutPayload,
      tradersPayload,
    }).data.tasks[0];
    expect(objectives?.objectives?.[0]?.maps).toEqual([{ id: 'map1' }]);
    expect(objectives?.objectives?.[0]?.requiredKeys).toEqual([
      [{ id: 'item1' }],
      [{ id: 'item2' }, { id: 'missing-item' }],
    ]);
    expect(objectives?.objectives?.[0]?.__typename).toBe('TaskObjectiveItem');
    expect(objectives?.objectives?.[0]?.items?.[0]).toEqual({ id: 'item1' });
    expect(objectives?.objectives?.[0]?.items?.[24]).toEqual({ id: 'bulk-item-23' });
    expect(objectives?.objectives?.[0]?.items?.[25]).toEqual({ id: 'bulk-item-24' });
    expect(objectives?.objectives?.[1]).toMatchObject({
      __typename: 'TaskObjectiveQuestItem',
      questItem: { id: 'questItem1', name: 'Bronze pocket watch' },
    });
    const rewards = adaptTaskRewardsResponse(tasksPayload, { tradersPayload }).data.tasks[0];
    expect(rewards?.finishRewards?.items?.[0]?.item).toEqual({ id: 'item1' });
    expect(rewards?.failureOutcome?.skillLevelReward?.[0]?.skill).toMatchObject({
      name: 'Strength',
    });
  });
  it('adapts task objectives with full item/map lookups when provided', () => {
    const objectives = adaptTaskObjectivesResponse(tasksPayload, {
      hideoutPayload,
      itemsPayload,
      mapsPayload,
      tradersPayload,
    }).data.tasks[0];
    expect(objectives?.objectives?.[0]).toMatchObject({
      __typename: 'TaskObjectiveItem',
      maps: [{ id: 'map1', name: 'Customs' }],
      items: expect.arrayContaining([expect.objectContaining({ id: 'item1', name: 'Salewa' })]),
    });
  });
  it('adapts hideout and prestige data without items lookup', () => {
    const hideout = adaptHideoutResponse(hideoutPayload, { tradersPayload }).data;
    expect(hideout.hideoutStations[0]?.levels[0]?.itemRequirements[0]).toMatchObject({
      item: { id: 'item1' },
      quantity: 1,
      attributes: [{ name: 'foundInRaid', type: 'foundInRaid', value: 'true' }],
    });
    expect(hideout.hideoutStations[0]?.levels[0]?.skillRequirements[0]).toMatchObject({
      id: '5d494a0e5b56502f18c98a02-1-2',
      level: 5,
      name: 'Hideout Management',
      skill: { id: 'HideoutManagement', name: 'Hideout Management' },
    });
    expect(hideout.hideoutStations[0]?.levels[0]?.skillRequirements[1]).toMatchObject({
      id: 'skill-req2',
      level: 3,
      name: 'Strength',
      skill: { id: 'Strength', name: 'Strength' },
    });
    const prestige = adaptPrestigeResponse(tasksPayload, {
      hideoutPayload,
      tradersPayload,
    }).data.prestige[0];
    expect(prestige?.conditions?.map((condition) => condition.__typename)).toEqual([
      'TaskObjectivePlayerLevel',
      'TaskObjectiveTaskStatus',
      'TaskObjectiveHideoutStation',
      'TaskObjectiveItem',
    ]);
    expect(prestige?.conditions?.[1]?.task).toMatchObject({ id: 'task1', name: 'Debut' });
  });
});
