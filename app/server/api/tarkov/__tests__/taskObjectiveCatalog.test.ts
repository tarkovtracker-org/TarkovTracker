// @vitest-environment node
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createError, defineEventHandler, type H3Event } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
const { scope, baseFetcher, setHeaders, runtimeConfig } = vi.hoisted(() => ({
  scope: { lang: 'en', gameMode: 'regular' },
  baseFetcher: vi.fn(),
  setHeaders: vi.fn(),
  runtimeConfig: {
    public: { appUrl: 'https://tarkovtracker.org' },
    supabaseUrl: '',
    supabaseServiceKey: '',
  },
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  getQuery: () => scope,
  setResponseHeaders: setHeaders,
}));
vi.mock('~/server/utils/tarkov-json', async (original) => ({
  ...(await original<typeof import('~/server/utils/tarkov-json')>()),
  createTarkovJsonTaskObjectivesFetcher: () => baseFetcher,
}));
const token = 'synthetic-catalog-token';
const overlay = {
  editions: testOverlayEditions,
  $meta: { version: 'catalog-test', generated: '2026-10-12', sha256: 'catalog-sha' },
  tasksAdd: {
    'overlay-task': { id: 'overlay-task', objectives: [{ id: 'overlay-objective', count: 2 }] },
  },
  privateSourceMarker: 'raw-overlay-only',
};
const good = {
  data: { tasks: [{ id: 'good-task', objectives: [] }] },
  dataOverlay: { status: 'fresh', version: 'catalog-test', sha256: 'catalog-sha' },
};
describe('objective catalog cache admission', () => {
  const puts = vi.fn(async (_request: Request, _response: Response) => undefined);
  const matches = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OVERLAY_TOKEN', token);
    vi.stubEnv('NUXT_CACHE_BYPASS_ENABLED', 'false');
    vi.stubEnv(
      'OVERLAY_URL',
      'https://raw.githubusercontent.com/example/private/main/overlay.json'
    );
    vi.stubGlobal('caches', { default: { match: matches, put: puts } });
    vi.stubGlobal('defineEventHandler', defineEventHandler);
    vi.stubGlobal('getQuery', () => scope);
    vi.stubGlobal('createError', createError);
    vi.stubGlobal('useRuntimeConfig', () => runtimeConfig);
    runtimeConfig.supabaseUrl = '';
    runtimeConfig.supabaseServiceKey = '';
    matches.mockResolvedValue(undefined);
    puts.mockResolvedValue(undefined);
    baseFetcher.mockResolvedValue({ data: { tasks: [{ id: 'upstream-task', objectives: [] }] } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('refreshes an already-cached objective catalog and overlay after a successful purge', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T14:00:00Z'));
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'test-key';
    scope.gameMode = 'regular';
    const cached = new Map<string, Response>();
    matches.mockImplementation(async (request: Request) => cached.get(request.url)?.clone());
    puts.mockImplementation(async (request, response) => {
      cached.set(request.url, response);
    });
    let latestPurge = '2026-11-18T13:00:00Z';
    const marker = {
      id: 'ice-cream-cones',
      objectives: [{ id: 'bunker', zones: [{ position: { x: 886.28 } }] }],
    };
    baseFetcher.mockResolvedValue({ data: { tasks: [marker] } });
    let currentOverlay: (typeof overlay & { tasks?: Record<string, unknown> }) | null = overlay;
    const fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/rest/v1/admin_audit_log')) {
        return Response.json([{ created_at: latestPurge, details: { success: true } }]);
      }
      return currentOverlay ? Response.json(currentOverlay) : new Response(null, { status: 503 });
    });
    vi.stubGlobal('fetch', fetch);
    const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
    const event = { context: {} } as H3Event;
    const before = await handler(event);
    expect(before.headers.get('X-Cache-Key')).toContain(String(Date.parse(latestPurge)));
    expect((await before.json()).data.tasks[0].objectives[0].zones[0].position.x).toBe(886.28);
    latestPurge = '2026-11-18T14:01:00Z';
    vi.setSystemTime(new Date('2026-11-18T14:02:00Z'));
    currentOverlay = null;
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
    expect(cached.size).toBe(1);
    currentOverlay = {
      ...overlay,
      $meta: { ...overlay.$meta, version: 'catalog-updated', sha256: 'updated-sha' },
      tasks: {
        'ice-cream-cones': {
          objectives: { bunker: { zones: [{ position: { x: 443.27 } }] } },
        },
      },
    };
    vi.setSystemTime(new Date('2026-11-18T14:06:00Z'));
    const after = await handler(event);
    const payload = await after.json();
    expect(payload.data.tasks[0].objectives[0].zones[0].position.x).toBe(443.27);
    expect(payload.dataOverlay.version).toBe('catalog-updated');
    expect(after.headers.get('Cache-Control')).toBe('no-store');
    expect(after.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
    expect(after.headers.get('X-Cache-Key')).not.toBe(before.headers.get('X-Cache-Key'));
    // An older audit result must not switch the isolate back to that generation.
    latestPurge = '2026-11-18T13:00:00Z';
    vi.setSystemTime(new Date('2026-11-18T14:08:00Z'));
    const hit = await handler(event);
    expect(hit.headers.get('X-Cache-Key')).toBe(after.headers.get('X-Cache-Key'));
    expect(hit.headers.get('X-Cache-Status')).toBe('HIT');
    expect(hit.headers.get('Cache-Control')).toBe('no-store');
  });
  it('joins a fresh overlay refresh after a failing pre-purge request finishes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T14:00:00Z'));
    const earlierRefresh = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(earlierRefresh.promise)
      .mockResolvedValueOnce(Response.json(overlay));
    vi.stubGlobal('fetch', fetchMock);
    const { applyOverlay, fetchOverlay } = await import('@/server/utils/overlay');
    const prePurge = fetchOverlay();
    const purgedAt = Date.parse('2026-11-18T14:01:00Z');
    vi.setSystemTime(purgedAt + 1000);
    const payload = { data: { tasks: [] } };
    const postPurge = applyOverlay(payload, { purgedAt });
    const concurrent = applyOverlay(payload, { purgedAt });
    earlierRefresh.resolve(new Response(null, { status: 503 }));
    expect((await prePurge).meta.status).toBe('missing');
    for (const result of await Promise.all([postPurge, concurrent])) {
      expect(result.dataOverlay).toMatchObject({
        version: 'catalog-test',
        fetchedAt: new Date(purgedAt + 1000).toISOString(),
      });
    }
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`tarkovPurge=${purgedAt}`),
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['regular', 'pve', 'pvp-season'])(
    'generates authenticated merged objectives for %s',
    async (mode) => {
      scope.gameMode = mode;
      const fetch = vi.fn(async () => new Response(JSON.stringify(overlay)));
      vi.stubGlobal('fetch', fetch);
      const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
      const payload = await (await handler({ context: {} } as H3Event)).json();
      expect(payload.data.tasks.map((task: { id: string }) => task.id)).toEqual([
        'upstream-task',
        'overlay-task',
      ]);
      expect(payload.dataOverlay).toMatchObject({ version: 'catalog-test', sha256: 'catalog-sha' });
      expect(fetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/example/private/main/overlay.json',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        })
      );
      expect(JSON.stringify(payload)).not.toContain(token);
      expect(JSON.stringify(payload)).not.toContain('raw-overlay-only');
      expect(puts.mock.calls[0]?.[0].url).toContain(`tasks-objectives-json-v5-en-${mode}-0`);
    }
  );
  it('does not cache an upstream-only payload after a private overlay fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
    await expect(handler({ context: {} } as H3Event)).rejects.toMatchObject({ statusCode: 503 });
    expect(puts).not.toHaveBeenCalled();
    expect(setHeaders).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        'Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store',
      })
    );
  });
  it('retains a good stale objective entry when background overlay refresh fails', async () => {
    matches.mockResolvedValue(
      new Response(JSON.stringify(good), {
        headers: { 'X-Cache-Stored-At': String(Date.now() - 43201_000) },
      })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    const background: Promise<unknown>[] = [];
    const event = {
      context: {
        cloudflare: { context: { waitUntil: (p: Promise<unknown>) => background.push(p) } },
      },
    } as unknown as H3Event;
    const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
    expect(await (await handler(event)).json()).toEqual(good);
    await Promise.all(background);
    expect(puts).not.toHaveBeenCalled();
    expect(setHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ 'X-Cache-Status': 'STALE' })
    );
  });
});
