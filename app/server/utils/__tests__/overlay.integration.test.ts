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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('overlay URL validation', () => {
  it.each([
    'http://overlay.example.com/overlay.json',
    'ftp://overlay.example.com/overlay.json',
    'file:///tmp/overlay.json',
    'not-a-url',
  ])('falls back to the trusted HTTPS overlay for %s', async (overlayUrl) => {
    vi.stubEnv('OVERLAY_URL', overlayUrl);
    const fetchMock = stubOverlayFetch({ $meta: { version: 'url-test-v1' } });
    const { applyOverlay } = await import('@/server/utils/overlay');
    await applyOverlay({ data: { tasks: [] } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json',
      expect.any(Object)
    );
  });
  it('uses a configured HTTPS overlay URL', async () => {
    vi.stubEnv('OVERLAY_URL', 'https://overlay.example.com/custom.json');
    const fetchMock = stubOverlayFetch({ $meta: { version: 'url-test-v1' } });
    const { applyOverlay } = await import('@/server/utils/overlay');
    await applyOverlay({ data: { tasks: [] } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://overlay.example.com/custom.json',
      expect.any(Object)
    );
  });
});
describe('overlay redirect handling', () => {
  const redirectTo = (location: string) =>
    new Response(null, { status: 302, headers: { location } });
  const redirectWithBody = (location: string, cancel: () => Promise<undefined>) =>
    ({
      status: 302,
      headers: new Headers({ location }),
      body: { cancel },
    }) as unknown as Response;
  it('rejects a redirect to a non-HTTPS overlay target', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('http://overlay.example.com/overlay.json'));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay({ data: { tasks: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'manual' })
    );
    expect(result.dataOverlay).toMatchObject({ status: 'missing' });
  });
  it('rejects a redirect that omits a location header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302 }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay({ data: { tasks: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.dataOverlay).toMatchObject({ status: 'missing' });
  });
  it('follows an HTTPS redirect and applies the overlay', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('https://overlay.example.com/redirected.json'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ $meta: { version: 'redirect-v1' } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay({ data: { tasks: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://overlay.example.com/redirected.json',
      expect.any(Object)
    );
    expect(result.dataOverlay).toMatchObject({ status: 'fresh', version: 'redirect-v1' });
  });
  it('stops following once the redirect limit is exceeded', async () => {
    let hop = 0;
    const fetchMock = vi.fn(async () => {
      hop += 1;
      return redirectTo(`https://overlay.example.com/hop-${hop}.json`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay({ data: { tasks: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.dataOverlay).toMatchObject({ status: 'missing' });
  });
  it.each([
    ['follows', 'https://overlay.example.com/redirected.json'],
    ['rejects', 'http://overlay.example.com/overlay.json'],
  ])('releases the redirect body when it %s the next target', async (_outcome, location) => {
    const cancel = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectWithBody(location, cancel))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ $meta: { version: 'redirect-v2' } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    await applyOverlay({ data: { tasks: [] } });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
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
  it('serves stale data while coalescing a deferred overlay refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    let resolveRefresh!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ $meta: { version: 'v1' } }), { status: 200 })
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        })
      );
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const payload = { data: { tasks: [] } };
    await applyOverlay(payload);
    vi.setSystemTime(new Date('2026-08-14T13:00:00.001Z'));
    const backgroundTasks: Array<Promise<unknown>> = [];
    const scheduleRefresh = (task: Promise<unknown>) => backgroundTasks.push(task);
    const [first, second] = await Promise.all([
      applyOverlay(payload, { scheduleRefresh }),
      applyOverlay(payload, { scheduleRefresh }),
    ]);
    expect(first.dataOverlay).toMatchObject({ status: 'stale', version: 'v1' });
    expect(second.dataOverlay).toMatchObject({ status: 'stale', version: 'v1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(backgroundTasks).toHaveLength(1);
    resolveRefresh(new Response(JSON.stringify({ $meta: { version: 'v2' } }), { status: 200 }));
    await backgroundTasks[0];
    const refreshed = await applyOverlay(payload, { scheduleRefresh });
    expect(refreshed.dataOverlay).toMatchObject({ status: 'cached', version: 'v2' });
  });
  it('keeps the fetch timeout active while parsing the overlay body', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      return {
        json: () =>
          new Promise((_resolve, reject) => {
            const rejectWithAbort = () => {
              const error = new Error('body parsing aborted');
              error.name = 'AbortError';
              reject(error);
            };
            if (signal.aborted) rejectWithAbort();
            else signal.addEventListener('abort', rejectWithAbort, { once: true });
          }),
        ok: true,
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const resultPromise = applyOverlay({ data: { tasks: [] } });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;
    expect(result.dataOverlay).toMatchObject({ status: 'missing' });
  });
  it('backs off deferred refreshes after an overlay fetch failure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ $meta: { version: 'v1' } }), { status: 200 })
      )
      .mockRejectedValueOnce(new Error('overlay unavailable'));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const { applyOverlay } = await import('@/server/utils/overlay');
    const payload = { data: { tasks: [] } };
    await applyOverlay(payload);
    vi.setSystemTime(new Date('2026-08-14T13:00:00.001Z'));
    const backgroundTasks: Array<Promise<unknown>> = [];
    const scheduleRefresh = (task: Promise<unknown>) => backgroundTasks.push(task);
    const stale = await applyOverlay(payload, { scheduleRefresh });
    expect(stale.dataOverlay.status).toBe('stale');
    await backgroundTasks[0];
    await applyOverlay(payload, { scheduleRefresh });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(backgroundTasks).toHaveLength(1);
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
