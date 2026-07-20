import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHideoutStations, getTasks } from '../services/tarkov';
import { deleteMemoryCache } from '../utils/memory-cache';
const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
describe('Tarkov data modes', () => {
  beforeEach(() => {
    deleteMemoryCache('tarkov:tasks:regular');
    deleteMemoryCache('tarkov:tasks:pve');
    deleteMemoryCache('tarkov:hideout:regular');
    deleteMemoryCache('tarkov:hideout:pve');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('loads and caches regular and PVE data independently', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/tasks')) {
        const mode = url.includes('/pve/') ? 'pve' : 'regular';
        return jsonResponse({ data: { tasks: { [mode]: { id: mode, name: mode } } } });
      }
      const mode = url.includes('/pve/') ? 'pve' : 'regular';
      return jsonResponse({ data: { [mode]: { id: mode, levels: [] } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getTasks('pvp')).resolves.toEqual([expect.objectContaining({ id: 'regular' })]);
    await expect(getTasks('pve')).resolves.toEqual([expect.objectContaining({ id: 'pve' })]);
    await expect(getHideoutStations('pvp')).resolves.toEqual([
      expect.objectContaining({ id: 'regular' }),
    ]);
    await expect(getHideoutStations('pve')).resolves.toEqual([
      expect.objectContaining({ id: 'pve' }),
    ]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://json.tarkov.dev/regular/tasks',
      'https://json.tarkov.dev/pve/tasks',
      'https://json.tarkov.dev/regular/hideout',
      'https://json.tarkov.dev/pve/hideout',
    ]);
    await getTasks('pvp');
    await getTasks('pve');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('skips malformed task metadata entries instead of throwing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/tasks')) {
        return jsonResponse({
          data: {
            tasks: {
              valid: {
                id: 'valid',
                name: 'Valid',
                objectives: [null, { id: 'objective-1', type: 'find', count: 2 }],
                taskRequirements: [null, { task: 'required-task', status: ['complete'] }],
              },
              invalid: null,
            },
          },
        });
      }
      return jsonResponse({ data: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getTasks('pvp')).resolves.toEqual([
      {
        id: 'valid',
        name: 'Valid',
        objectives: [{ id: 'objective-1', type: 'find', count: 2 }],
        taskRequirements: [{ task: { id: 'required-task' }, status: ['complete'] }],
      },
    ]);
  });
  it('maps hideout requirement rows to item template IDs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/hideout')) {
        return jsonResponse({
          data: {
            stash: {
              id: 'stash',
              levels: [
                {
                  id: 'stash-1',
                  level: 1,
                  itemRequirements: [
                    { id: 'requirement-row-1', item: 'item-template-1', count: 2 },
                  ],
                },
              ],
            },
          },
        });
      }
      return jsonResponse({ data: { tasks: {} } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getHideoutStations('pvp')).resolves.toEqual([
      {
        id: 'stash',
        levels: [
          {
            id: 'stash-1',
            level: 1,
            itemRequirements: [{ id: 'item-template-1', count: 2 }],
          },
        ],
      },
    ]);
  });
  it('skips malformed hideout levels and requirement entries', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/hideout')) {
        return jsonResponse({
          data: {
            stash: {
              id: 'stash',
              levels: [
                null,
                {
                  id: 'stash-1',
                  level: 1,
                  itemRequirements: [null, { item: 'item-template-1', count: 2 }],
                },
              ],
            },
          },
        });
      }
      return jsonResponse({ data: { tasks: {} } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getHideoutStations('pvp')).resolves.toEqual([
      {
        id: 'stash',
        levels: [
          {
            id: 'stash-1',
            level: 1,
            itemRequirements: [{ id: 'item-template-1', count: 2 }],
          },
        ],
      },
    ]);
  });
});
