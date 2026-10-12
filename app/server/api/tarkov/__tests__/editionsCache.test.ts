// @vitest-environment node
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createApp, createError, defineEventHandler, getQuery, setHeader, toWebHandler } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeasonalPerk } from '@/types/tarkov';
const { fetchOverlay, fetchSeason, config } = vi.hoisted(() => ({
  fetchOverlay: vi.fn(),
  fetchSeason: vi.fn(),
  config: { public: { appUrl: 'https://tarkovtracker.org' } },
}));
mockNuxtImport('useRuntimeConfig', () => () => config);
vi.mock('@/server/utils/overlay', () => ({ fetchOverlay }));
vi.mock('@/server/utils/tarkov-json', () => ({ fetchTarkovJsonEndpoint: fetchSeason }));
const sourcePerk = (id: string) => ({
  id,
  name: `Name ${id}`,
  description: `Description ${id}`,
  points: 2,
  exclusiveToPerks: [],
});
const overlay = {
  overlay: { seasonalPerks: { perk: { effects: [{ effectId: 'health' }] } } },
  meta: { status: 'fresh', sha256: 'overlay-sha' },
};
const request = () =>
  new Request('https://tarkovtracker.org/api/tarkov/editions?gameMode=pvp-season&lang=en');
describe('editions metadata cache boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('defineEventHandler', defineEventHandler);
    vi.stubGlobal('getQuery', getQuery);
    vi.stubGlobal('createError', createError);
    vi.stubGlobal('setHeader', setHeader);
    fetchOverlay.mockResolvedValue(overlay);
    fetchSeason.mockResolvedValue({
      perks: { personal: [sourcePerk('perk'), sourcePerk('metadata-only')] },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const createHandler = async (cache: object, background: Promise<unknown>[] = []) => {
    vi.stubGlobal('caches', { default: cache });
    const { default: route } = await import('@/server/api/tarkov/editions.get');
    return toWebHandler(
      createApp().use(
        defineEventHandler((event) => {
          event.context.cloudflare = {
            context: { waitUntil: (task: Promise<unknown>) => background.push(task) },
          };
          return route(event);
        })
      )
    );
  };
  it('does not admit a schema-valid partial refresh missing an effect-bearing perk', async () => {
    let stored: Response | undefined;
    const cache = {
      match: vi.fn(async () => stored?.clone()),
      put: vi.fn(async (_key: Request, response: Response) => {
        stored = response.clone();
      }),
    };
    const background: Promise<unknown>[] = [];
    const handler = await createHandler(cache, background);
    const first = await handler(request());
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('no-cache');
    await Promise.all(background);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(stored!.headers.get('Cache-Control')).toBe('public, max-age=43200, s-maxage=86400');
    const lastGood = (await stored!.clone().json()) as SeasonalPerk[];
    stored!.headers.set('X-Cache-Stored-At', String(Date.now() - 43_201_000));
    fetchSeason.mockResolvedValue({ perks: { personal: [sourcePerk('metadata-only')] } });
    const stale = await handler(request());
    expect(stale.status).toBe(200);
    expect(stale.headers.get('X-Cache-Status')).toBe('STALE');
    await Promise.all(background);
    expect(await stored!.clone().json()).toEqual(lastGood);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const next = await handler(request());
    expect(next.status).toBe(200);
    expect(next.headers.get('X-Cache-Status')).toBe('STALE');
    await Promise.all(background);
  });
  it('refreshes metadata when a new overlay SHA adds an upstream perk', async () => {
    const entries = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
      put: vi.fn(async (key: Request, response: Response) => {
        entries.set(key.url, response.clone());
      }),
    };
    const background: Promise<unknown>[] = [];
    const handler = await createHandler(cache, background);
    expect((await handler(request())).status).toBe(200);
    await Promise.all(background);
    fetchOverlay.mockResolvedValue({
      overlay: {
        seasonalPerks: { perk: { effects: [] }, added: { effects: [{ effectId: 'new' }] } },
      },
      meta: { status: 'fresh', sha256: 'new-overlay-sha' },
    });
    fetchSeason.mockResolvedValue({
      perks: { personal: [sourcePerk('perk'), sourcePerk('metadata-only'), sourcePerk('added')] },
    });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('MISS');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect((await response.json()).data.seasonalPerks).toHaveLength(3);
    await Promise.all(background);
    expect(fetchSeason).toHaveBeenCalledTimes(2);
    expect(entries.size).toBe(2);
  });
  it.each([new Error('source unavailable'), { perks: {} }])(
    'returns a no-store 502 for a failed cold upstream read (%#)',
    async (payload) => {
      const cache = { match: vi.fn(async () => undefined), put: vi.fn() };
      if (payload instanceof Error) fetchSeason.mockRejectedValueOnce(payload);
      else fetchSeason.mockResolvedValueOnce(payload);
      const handler = await createHandler(cache);
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(cache.put).not.toHaveBeenCalled();
    }
  );
  it('returns a no-store 503 when the current overlay introduces an unknown cached ID', async () => {
    const cache = {
      match: vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 'metadata-only',
                type: 'personal',
                name: 'Metadata only',
                description: 'Description',
                points: 2,
                mutuallyExclusiveSeasonalPerkIds: [],
                effects: [],
              },
            ]),
            { headers: { 'X-Cache-Stored-At': String(Date.now()) } }
          )
      ),
      put: vi.fn(),
    };
    const handler = await createHandler(cache);
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchSeason).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
