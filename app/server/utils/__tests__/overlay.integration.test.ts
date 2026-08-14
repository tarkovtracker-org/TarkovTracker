import { afterEach, describe, expect, it, vi } from 'vitest';
const stubOverlayFetch = (overlay: unknown) => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify(overlay), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  });
  vi.stubGlobal('fetch', fetchMock as typeof fetch);
  return fetchMock;
};
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});
describe('applyOverlay locale integration', () => {
  it('applies the selected locale after global and mode corrections', async () => {
    const fetchMock = stubOverlayFetch({
      $meta: {
        generated: '2026-08-14T12:00:00.000Z',
        sha256: 'overlay-sha',
        version: 'locale-test-v1',
      },
      items: {
        'item-1': { shortName: 'Global item' },
      },
      locales: {
        de: {
          items: { 'item-1': { name: 'Deutscher Gegenstand' } },
          tasks: { 'task-1': { name: 'Deutsche Aufgabe' } },
          traders: { 'trader-1': { name: 'Deutscher Händler' } },
        },
        en: {
          items: { 'item-1': { name: 'English Item' } },
          tasks: {
            'task-1': {
              name: 'English Task',
              objectives: { 'objective-1': { description: 'English objective' } },
            },
          },
          traders: { 'trader-1': { name: 'English Trader' } },
        },
      },
      modes: {
        pve: {
          tasks: { 'task-1': { name: 'PvE Task' } },
        },
      },
      tasks: {
        'task-1': { name: 'Global Task' },
      },
    });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const payload = {
      data: {
        items: [{ id: 'item-1', name: 'Base Item', shortName: 'Base' }],
        tasks: [
          {
            id: 'task-1',
            name: 'Base Task',
            objectives: [{ id: 'objective-1', description: 'Base objective' }],
          },
        ],
        traders: [{ id: 'trader-1', name: 'Base Trader' }],
      },
    };
    const english = await applyOverlay(payload, { gameMode: 'pve' });
    expect(english.data).toEqual({
      items: [{ id: 'item-1', name: 'English Item', shortName: 'Global item' }],
      tasks: [
        {
          id: 'task-1',
          name: 'English Task',
          objectives: [{ id: 'objective-1', description: 'English objective' }],
        },
      ],
      traders: [{ id: 'trader-1', name: 'English Trader' }],
    });
    expect(english.dataOverlay).toMatchObject({
      sha256: 'overlay-sha',
      status: 'fresh',
      version: 'locale-test-v1',
    });
    const german = await applyOverlay(payload, { gameMode: 'pve', locale: 'de' });
    expect(german.data?.tasks?.[0]).toMatchObject({ name: 'Deutsche Aufgabe' });
    expect(german.data?.items?.[0]).toMatchObject({
      name: 'Deutscher Gegenstand',
      shortName: 'Global item',
    });
    expect(german.data?.traders?.[0]).toMatchObject({ name: 'Deutscher Händler' });
    expect(german.data?.tasks?.[0]).not.toHaveProperty(
      'objectives.0.description',
      'English objective'
    );
    expect(german.dataOverlay?.status).toBe('cached');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('leaves unsupported locales unchanged by locale corrections', async () => {
    stubOverlayFetch({
      $meta: { version: 'locale-test-v1' },
      locales: {
        en: { tasks: { 'task-1': { name: 'English Task' } } },
      },
    });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const payload = { data: { tasks: [{ id: 'task-1', name: 'Base Task' }] } };
    const result = await applyOverlay(payload, { locale: 'fr' });
    expect(result.data?.tasks).toEqual([{ id: 'task-1', name: 'Base Task' }]);
  });
  it.each([
    ['locale map', []],
    ['locale entry', { en: null }],
    ['locale collection', { en: { tasks: [] } }],
    ['locale patch', { en: { tasks: { 'task-1': 'garbage' } } }],
  ])('handles a malformed %s without changing base data', async (_label, locales) => {
    stubOverlayFetch({
      $meta: { version: 'locale-test-v1' },
      locales,
    });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const payload = { data: { tasks: [{ id: 'task-1', name: 'Base Task' }] } };
    const result = await applyOverlay(payload);
    expect(result.data).toEqual(payload.data);
    expect(result.dataOverlay.status).toBe('fresh');
  });
});
