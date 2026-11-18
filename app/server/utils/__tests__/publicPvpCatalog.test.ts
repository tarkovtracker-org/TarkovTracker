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
  const fetch = vi.fn(async (url: string, options: ResponseOptions) => {
    released(options, '1');
    return { data: responses[url.split('/').at(-1)!] };
  });
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
      {
        query: { gameMode: 'regular' },
        timeout: 20000,
        retry: 1,
        onResponse: expect.any(Function),
      },
    ],
    [
      'https://tarkovtracker.org/api/tarkov/items-lite',
      {
        query: { gameMode: 'regular' },
        timeout: 20000,
        retry: 1,
        onResponse: expect.any(Function),
      },
    ],
    [
      'https://tarkovtracker.org/api/tarkov/strings',
      { query: { lang: 'en' }, timeout: 20000, retry: 1, onResponse: expect.any(Function) },
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
    vi.fn(async (url: string, options: ResponseOptions) => {
      released(options, '1');
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
    vi.fn(async (url: string, options: ResponseOptions) => {
      released(options, '1');
      return {
        data: url.endsWith('/strings') ? { strings: {} } : { name: '@tt:regular:tasks:name' },
      };
    })
  );
  await expect(fetchPublicPvpCatalogs<[{ name: string }]>(['tasks-core'])).rejects.toMatchObject({
    statusCode: 503,
  });
});
type ResponseOptions = { onResponse?: (context: { response: { headers: Headers } }) => void };
function released(options: ResponseOptions, release: string) {
  options.onResponse?.({ response: { headers: new Headers({ 'X-Catalog-Release': release }) } });
}
it('refetches the whole bundle when keys exist but the table belongs to another release', async () => {
  let catalogs = 0;
  const key = '@tt:regular:tasks:name';
  const fetch = vi.fn(async (url: string, options: ResponseOptions) => {
    if (!url.endsWith('/strings')) catalogs++;
    released(options, url.endsWith('/strings') || catalogs > 1 ? '2' : '1');
    return {
      data: url.endsWith('/strings')
        ? { strings: { [key]: 'Release two' } }
        : { name: key, version: catalogs },
    };
  });
  vi.stubGlobal('$fetch', fetch);
  expect(await fetchPublicPvpCatalogs(['tasks-core'])).toEqual([
    { name: 'Release two', version: 2 },
  ]);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('fails with 503 after one retry on persistent release skew', async () => {
  const fetch = vi.fn(async (url: string, options: ResponseOptions) => {
    released(options, url.endsWith('/strings') ? '2' : '1');
    return {
      data: url.endsWith('/strings')
        ? { strings: { '@tt:key': 'Wrong generation' } }
        : { name: '@tt:key' },
    };
  });
  vi.stubGlobal('$fetch', fetch);
  await expect(fetchPublicPvpCatalogs(['tasks-core'])).rejects.toMatchObject({ statusCode: 503 });
  expect(fetch).toHaveBeenCalledTimes(4);
});
it.each(['2', null])(
  'refuses neutral bundles with a mismatched or missing dataset release: %s',
  async (otherRelease) => {
    const fetch = vi.fn(async (url: string, options: ResponseOptions) => {
      const release = url.endsWith('/items-lite') ? otherRelease : '1';
      if (release) released(options, release);
      return {
        data: url.endsWith('/strings') ? { strings: { '@tt:key': 'Label' } } : { name: '@tt:key' },
      };
    });
    vi.stubGlobal('$fetch', fetch);
    await expect(fetchPublicPvpCatalogs(['hideout', 'items-lite'])).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/strings'))).toBe(false);
  }
);
it('rejects mixed release plaintext catalogs and retries a temporary 503', async () => {
  let calls = 0;
  const fetch = vi.fn(async (_url: string, options: ResponseOptions) => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('Temporary unavailable'), { statusCode: 503 });
    released(options, '2');
    return { data: { name: 'Current' } };
  });
  vi.stubGlobal('$fetch', fetch);
  expect(await fetchPublicPvpCatalogs(['hideout'])).toEqual([{ name: 'Current' }]);
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockImplementation(async (_url, options) => {
    released(options, String(calls++));
    return { data: { name: 'Mixed' } };
  });
  await expect(fetchPublicPvpCatalogs(['hideout', 'items-lite'])).rejects.toMatchObject({
    statusCode: 503,
  });
});
