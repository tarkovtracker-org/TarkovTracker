// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { fuzzyMatch } from '@/utils/fuzzySearch';
import * as cache from '@/utils/tarkovCache';
import { sortTasksByName } from '@/utils/taskSorter';
import { createDeferred } from '@/utils/test-helpers';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const name = '@tt:regular:tasks:name';
const secondName = '@tt:regular:tasks:second';
const wikiLink = '@tt:overlay:tasks:task:wikiLink';
const itemName = '@tt:regular:items:name';
const objective = '@tt:regular:tasks:objective';
const pveObjective = '@tt:pve:tasks:objective';
const tables = {
  en: {
    [name]: 'Task',
    [secondName]: 'Zebra',
    [wikiLink]: 'https://example.com/en/task',
    [itemName]: 'Apple',
    [objective]: 'Prestige 1',
    [pveObjective]: 'Level 20',
  },
  de: {
    [name]: 'Aufgabe',
    [secondName]: 'Aal',
    [wikiLink]: 'https://example.com/de/task',
    [itemName]: 'Apfel',
    [objective]: 'Prestige 1 DE',
    [pveObjective]: 'Stufe 20',
  },
};
const catalogs: Record<string, unknown> = {
  bootstrap: { playerLevels: [] },
  'tasks-core': {
    tasks: [
      { id: 'task', name, wikiLink },
      { id: 'second', name: secondName },
    ],
    maps: [],
    traders: [],
  },
  hideout: { hideoutStations: [{ id: 'station', name, levels: [] }] },
  'items-lite': { items: [{ id: 'item', name: itemName, shortName: itemName }] },
  'tasks-objectives': {
    tasks: [{ id: 'task', objectives: [{ id: 'objective', description: objective }] }],
  },
  'tasks-rewards': { tasks: [] },
  prestige: { prestige: [] },
  editions: {
    editions: [
      {
        id: 'standard',
        title: name,
        value: 1,
        defaultStashLevel: 1,
        defaultCultistCircleLevel: 0,
        traderRepBonus: {},
      },
    ],
    storyChapters: [
      { id: 'tour', name, order: 1, objectives: {}, normalizedName: 'tour', wikiLink: '' },
    ],
  },
};
describe('language-neutral metadata catalogs', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const entries = new Map<string, unknown>();
    vi.spyOn(cache, 'getCachedData').mockImplementation(
      async (type, key, language) => (entries.get(`${type}/${key}/${language}`) ?? null) as never
    );
    vi.spyOn(cache, 'setCachedData').mockImplementation(async (type, key, language, data) => {
      entries.set(`${type}/${key}/${language}`, structuredClone(data));
    });
    vi.spyOn(cache, 'cleanupExpiredCache').mockResolvedValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('switches with one strings request and returns to the cached language with zero requests', async () => {
    const store = useMetadataStore();
    vi.spyOn(store, 'checkCachePurge').mockResolvedValue(undefined);
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    const fetch = vi.fn(async (url: string, options: { query: Record<string, string> }) => {
      const type = url.split('/').at(-1)!;
      if (type === 'strings')
        return { data: { strings: tables[options.query.lang as 'en' | 'de'] } };
      expect(options.query).not.toHaveProperty('lang');
      return { data: structuredClone(catalogs[type]) };
    });
    vi.stubGlobal('$fetch', fetch);
    await store.fetchAllData();
    expect(store.tasks[0]?.name).toBe('Task');
    expect(store.items[0]?.name).toBe('Apple');
    expect(sortTasksByName(store.tasks, 'asc').map((task) => task.id)).toEqual(['task', 'second']);
    expect(store.tasks[0]?.wikiLink).toBe('https://example.com/en/task');
    fetch.mockClear();
    store.languageCode = 'de';
    await store.fetchAllData();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/tarkov/strings']);
    expect(store.tasks[0]?.name).toBe('Aufgabe');
    expect(store.items[0]?.name).toBe('Apfel');
    expect(
      store.tasks.filter((task) => fuzzyMatch(task.name ?? '', 'aufgabe')).map((task) => task.id)
    ).toEqual(['task']);
    expect(sortTasksByName(store.tasks, 'asc').map((task) => task.id)).toEqual(['second', 'task']);
    expect(store.tasks[0]?.wikiLink).toBe('https://example.com/de/task');
    expect(store.tasks[0]?.objectives?.[0]).toMatchObject({
      id: 'objective',
      description: 'Prestige 1 DE',
    });
    expect(cache.setCachedData).toHaveBeenCalledWith(
      'tasks-core',
      'neutral-v1-regular',
      'en',
      catalogs['tasks-core'],
      expect.any(Number),
      expect.any(Function)
    );
    fetch.mockClear();
    store.languageCode = 'en';
    await store.fetchAllData();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.tasks[0]?.name).toBe('Task');
    expect(store.items[0]?.name).toBe('Apple');
  });
  it('keeps mode-specific objective text and IDs independent with the same language table', async () => {
    const store = useMetadataStore();
    store.languageCode = 'de';
    const fetch = vi.fn(async (url: string, options: { query: Record<string, string> }) => {
      if (url.endsWith('/strings')) return { data: { strings: tables.de } };
      if (url.endsWith('/tasks-core')) return { data: catalogs['tasks-core'] };
      return {
        data: {
          tasks: [
            {
              id: 'task',
              objectives: [
                {
                  id: 'objective',
                  description: options.query.gameMode === 'pve' ? pveObjective : objective,
                },
              ],
            },
          ],
        },
      };
    });
    vi.stubGlobal('$fetch', fetch);
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    await store.fetchTasksCoreData();
    await store.fetchTaskObjectivesData();
    expect(store.tasks[0]?.objectives?.[0]).toMatchObject({
      id: 'objective',
      description: 'Prestige 1 DE',
    });
    store.currentGameMode = 'pve';
    await store.fetchTasksCoreData();
    await store.fetchTaskObjectivesData();
    expect(store.tasks[0]?.objectives?.[0]).toMatchObject({
      id: 'objective',
      description: 'Stufe 20',
    });
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/strings'))).toHaveLength(1);
  });
  it('fences a superseded language table before publishing a localized catalog', async () => {
    const store = useMetadataStore();
    const english = createDeferred<{ data: { strings: typeof tables.en } }>();
    const fetch = vi.fn(async (url: string, options: { query: Record<string, string> }) => {
      if (!url.endsWith('/strings')) return { data: catalogs['tasks-core'] };
      return options.query.lang === 'en' ? english.promise : { data: { strings: tables.de } };
    });
    vi.stubGlobal('$fetch', fetch);
    const first = store.fetchTasksCoreData();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    store.languageCode = 'de';
    await store.fetchTasksCoreData();
    expect(store.tasks[0]?.name).toBe('Aufgabe');
    english.resolve({ data: { strings: tables.en } });
    await first;
    expect(store.tasks[0]?.name).toBe('Aufgabe');
    expect(store.error).toBeNull();
  });
  it('replaces an older neutral cache when the current table has retired its references', async () => {
    const store = useMetadataStore();
    vi.mocked(cache.getCachedData).mockImplementation(async (type) => {
      if (type === 'strings') return tables.en as never;
      return { tasks: [{ id: 'task', name: '@tt:retired:name' }], maps: [], traders: [] } as never;
    });
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/strings') ? { data: { strings: tables.en } } : { data: catalogs['tasks-core'] }
    );
    vi.stubGlobal('$fetch', fetch);
    await store.fetchTasksCoreData();
    expect(store.tasks[0]?.name).toBe('Task');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/tarkov/strings',
      '/api/tarkov/tasks-core',
    ]);
    expect(store.error).toBeNull();
  });
  it('retries one older network snapshot against the current strings inventory', async () => {
    const store = useMetadataStore();
    vi.mocked(cache.getCachedData).mockImplementation(async (type) =>
      type === 'strings' ? (tables.en as never) : null
    );
    let catalogsRead = 0;
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/strings')) return { data: { strings: tables.en } };
      catalogsRead += 1;
      return {
        data:
          catalogsRead === 1
            ? { tasks: [{ id: 'task', name: '@tt:retired:name' }], maps: [], traders: [] }
            : catalogs['tasks-core'],
      };
    });
    vi.stubGlobal('$fetch', fetch);
    await store.fetchTasksCoreData();
    expect(catalogsRead).toBe(2);
    expect(store.tasks[0]?.name).toBe('Task');
    expect(store.error).toBeNull();
  });
  it('retains the rendered catalog after the bounded network retry stays incompatible', async () => {
    const store = useMetadataStore();
    store.tasks = [{ id: 'last-good', name: 'Last good' }] as never;
    vi.mocked(cache.getCachedData).mockImplementation(async (type) =>
      type === 'strings' ? (tables.en as never) : null
    );
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/strings')
        ? { data: { strings: tables.en } }
        : { data: { tasks: [{ id: 'task', name: '@tt:retired:name' }], maps: [], traders: [] } }
    );
    vi.stubGlobal('$fetch', fetch);
    await expect(store.fetchTasksCoreData(true)).rejects.toThrow('Missing game data string');
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/tasks-core'))).toHaveLength(2);
    expect(store.tasks[0]).toMatchObject({ id: 'last-good', name: 'Last good' });
    expect(cache.setCachedData).not.toHaveBeenCalledWith(
      'tasks-core',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });
  it('uses a fresh-only retry and retains the rendered catalog when that retry returns 503', async () => {
    const store = useMetadataStore();
    store.tasks = [{ id: 'last-good', name: 'Last good' }] as never;
    vi.mocked(cache.getCachedData).mockImplementation(async (type) =>
      type === 'strings' ? (tables.en as never) : null
    );
    let reads = 0;
    const unavailable = Object.assign(new Error('Catalog unavailable'), { statusCode: 503 });
    const fetch = vi.fn(async (url: string, options: { query: Record<string, string> }) => {
      if (url.endsWith('/strings')) return { data: { strings: tables.en } };
      if (++reads === 1)
        return {
          data: { tasks: [{ id: 'task', name: '@tt:retired:name' }], maps: [], traders: [] },
        };
      expect(options.query.cacheBust).toBe('1');
      throw unavailable;
    });
    vi.stubGlobal('$fetch', fetch);
    await expect(store.fetchTasksCoreData()).rejects.toMatchObject({
      name: 'MissingGameDataStringError',
      cause: unavailable,
    });
    expect(reads).toBe(2);
    expect(store.tasks[0]).toMatchObject({ id: 'last-good', name: 'Last good' });
  });
});
