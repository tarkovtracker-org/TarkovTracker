import { createError, defineEventHandler, type H3Event } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
const { scope, baseFetcher, setHeaders } = vi.hoisted(() => ({
  scope: { lang: 'en', gameMode: 'regular' },
  baseFetcher: vi.fn(),
  setHeaders: vi.fn(),
}));
vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ public: { appUrl: 'https://tarkovtracker.org' } }),
}));
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
    matches.mockResolvedValue(undefined);
    baseFetcher.mockResolvedValue({ data: { tasks: [{ id: 'upstream-task', objectives: [] }] } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it.each(['regular', 'pve', 'pvp-season'])(
    'generates authenticated merged objectives for %s',
    async (mode) => {
      scope.gameMode = mode;
      const fetch = vi.fn(async () => new Response(JSON.stringify(overlay)));
      vi.stubGlobal('fetch', fetch);
      const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
      const payload = await handler({ context: {} } as H3Event);
      expect(payload.data.tasks.map((task) => task.id)).toEqual(['upstream-task', 'overlay-task']);
      expect(payload.dataOverlay).toMatchObject({ version: 'catalog-test', sha256: 'catalog-sha' });
      expect(fetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/example/private/main/overlay.json',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        })
      );
      expect(JSON.stringify(payload)).not.toContain(token);
      expect(JSON.stringify(payload)).not.toContain('raw-overlay-only');
      expect(puts.mock.calls[0]?.[0].url).toContain(`tasks-objectives-json-v4-en-${mode}`);
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
    expect(await handler(event)).toEqual(good);
    await Promise.all(background);
    expect(puts).not.toHaveBeenCalled();
    expect(setHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ 'X-Cache-Status': 'STALE' })
    );
  });
});
