import { afterEach, expect, it, vi } from 'vitest';
import { fetchPublicPvpCatalogs } from '@/server/utils/publicPvpCatalog';
afterEach(() => vi.unstubAllGlobals());
it('resolves a public bundle with one English table and fixed credential-free request scopes', async () => {
  const taskName = '@tt:regular:tasks:task name';
  const itemName = '@tt:regular:items:item name';
  const responses: Record<string, unknown> = {
    'tasks-core': { id: 'task', name: taskName },
    'items-lite': { id: 'item', name: itemName },
    strings: { strings: { [taskName]: 'Task name', [itemName]: 'Item name' } },
  };
  const fetch = vi.fn(async (url: string, _options: unknown) => ({
    data: responses[url.split('/').at(-1)!],
  }));
  vi.stubGlobal('$fetch', fetch);
  const result = await fetchPublicPvpCatalogs<
    [{ id: string; name: string }, { id: string; name: string }]
  >(['tasks-core', 'items-lite']);
  expect(result).toEqual([
    { id: 'task', name: 'Task name' },
    { id: 'item', name: 'Item name' },
  ]);
  expect(fetch.mock.calls).toEqual([
    [
      'https://tarkovtracker.org/api/tarkov/tasks-core',
      { query: { gameMode: 'regular' }, timeout: 20000, retry: 1 },
    ],
    [
      'https://tarkovtracker.org/api/tarkov/items-lite',
      { query: { gameMode: 'regular' }, timeout: 20000, retry: 1 },
    ],
    [
      'https://tarkovtracker.org/api/tarkov/strings',
      { query: { lang: 'en' }, timeout: 20000, retry: 1 },
    ],
  ]);
});
it('uses the preceding production release during prerender without requiring a strings route', async () => {
  const fetch = vi.fn(async () => ({ data: { name: 'Already localized' } }));
  vi.stubGlobal('$fetch', fetch);
  expect(await fetchPublicPvpCatalogs<[{ name: string }]>(['hideout'])).toEqual([
    { name: 'Already localized' },
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('propagates an unavailable English table instead of returning translation references', async () => {
  vi.stubGlobal(
    '$fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/strings')) throw new Error('Public strings unavailable');
      return { data: { name: '@tt:regular:tasks:name' } };
    })
  );
  await expect(fetchPublicPvpCatalogs<[{ name: string }]>(['tasks-core'])).rejects.toThrow(
    'Public strings unavailable'
  );
});
it('rejects a table missing a referenced public label', async () => {
  vi.stubGlobal(
    '$fetch',
    vi.fn(async (url: string) => ({
      data: url.endsWith('/strings') ? { strings: {} } : { name: '@tt:regular:tasks:name' },
    }))
  );
  await expect(fetchPublicPvpCatalogs<[{ name: string }]>(['tasks-core'])).rejects.toThrow(
    'Missing game data string'
  );
});
