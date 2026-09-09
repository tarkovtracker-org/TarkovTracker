// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const CACHE_META_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  Vary: 'Origin',
};
const {
  mockFetchOverlay,
  mockApplyOverlay,
  mockCreateTarkovJsonBootstrapFetcher,
  mockCreateTarkovJsonHideoutFetcher,
  mockCreateTarkovJsonItemsFetcher,
  mockCreateTarkovJsonMapSpawnsFetcher,
  mockCreateTarkovJsonPrestigeFetcher,
  mockCreateTarkovJsonTaskObjectivesFetcher,
  mockCreateTarkovJsonTaskRewardsFetcher,
  mockCreateTarkovJsonTasksCoreFetcher,
  mockEdgeCache,
  mockFetch,
  mockGetPrecomputedStore,
  mockGetQuery,
  mockGetValidatedLanguage,
  mockSanitizeTaskRewards,
  mockScheduleBackgroundTask,
  mockSetHeader,
  mockSetOverlayResponseHeaders,
  mockSetResponseHeaders,
  mockShouldBypassCache,
  mockValidateGameMode,
} = vi.hoisted(() => ({
  mockFetchOverlay: vi.fn(async () => ({ overlay: {}, meta: { status: 'fresh' } })),
  mockApplyOverlay: vi.fn(),
  mockCreateTarkovJsonBootstrapFetcher: vi.fn(),
  mockCreateTarkovJsonHideoutFetcher: vi.fn(),
  mockCreateTarkovJsonItemsFetcher: vi.fn(),
  mockCreateTarkovJsonMapSpawnsFetcher: vi.fn(),
  mockCreateTarkovJsonPrestigeFetcher: vi.fn(),
  mockCreateTarkovJsonTaskObjectivesFetcher: vi.fn(),
  mockCreateTarkovJsonTaskRewardsFetcher: vi.fn(),
  mockCreateTarkovJsonTasksCoreFetcher: vi.fn(),
  mockEdgeCache: vi.fn(),
  mockFetch: vi.fn(),
  mockGetPrecomputedStore: vi.fn(),
  mockGetQuery: vi.fn(),
  mockGetValidatedLanguage: vi.fn(),
  mockSanitizeTaskRewards: vi.fn(),
  mockScheduleBackgroundTask: vi.fn(),
  mockSetHeader: vi.fn(),
  mockSetOverlayResponseHeaders: vi.fn(),
  mockSetResponseHeaders: vi.fn(),
  mockShouldBypassCache: vi.fn(),
  mockValidateGameMode: vi.fn(),
}));
const runtimeConfig = {
  supabaseServiceKey: '',
  supabaseUrl: '',
};
vi.mock('h3', async () => {
  const actual = await vi.importActual('h3');
  return {
    ...actual,
    getQuery: mockGetQuery,
    setResponseHeaders: mockSetResponseHeaders,
  };
});
vi.mock('~/server/utils/backgroundTask', () => ({
  scheduleBackgroundTask: mockScheduleBackgroundTask,
}));
vi.mock('~/server/utils/edgeCache', () => ({
  edgeCache: mockEdgeCache,
  shouldBypassCache: mockShouldBypassCache,
}));
vi.mock('~/server/utils/language-helpers', () => ({
  getValidatedLanguage: mockGetValidatedLanguage,
}));
vi.mock('~/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('~/server/utils/overlay', () => ({
  applyOverlay: mockApplyOverlay,
  fetchOverlay: mockFetchOverlay,
}));
vi.mock('~/server/utils/overlayResponseHeaders', () => ({
  setOverlayResponseHeaders: mockSetOverlayResponseHeaders,
}));
vi.mock('~/server/utils/precomputedTarkov', async () => {
  const actual = await vi.importActual<typeof import('~/server/utils/precomputedTarkov')>(
    '~/server/utils/precomputedTarkov'
  );
  return { ...actual, getPrecomputedStore: mockGetPrecomputedStore };
});
vi.mock('~/server/utils/tarkov-cache-config', () => ({
  CACHE_TTL_DEFAULT: 111,
  CACHE_TTL_EXTENDED: 222,
  validateGameMode: mockValidateGameMode,
}));
vi.mock('~/server/utils/tarkov-sanitization', () => ({
  sanitizeTaskRewards: mockSanitizeTaskRewards,
}));
vi.mock('~/server/utils/tarkov-json', () => ({
  createTarkovJsonBootstrapFetcher: mockCreateTarkovJsonBootstrapFetcher,
  createTarkovJsonHideoutFetcher: mockCreateTarkovJsonHideoutFetcher,
  createTarkovJsonItemsFetcher: mockCreateTarkovJsonItemsFetcher,
  createTarkovJsonMapSpawnsFetcher: mockCreateTarkovJsonMapSpawnsFetcher,
  createTarkovJsonPrestigeFetcher: mockCreateTarkovJsonPrestigeFetcher,
  createTarkovJsonTaskObjectivesFetcher: mockCreateTarkovJsonTaskObjectivesFetcher,
  createTarkovJsonTaskRewardsFetcher: mockCreateTarkovJsonTaskRewardsFetcher,
  createTarkovJsonTasksCoreFetcher: mockCreateTarkovJsonTasksCoreFetcher,
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
describe('Tarkov API handlers', () => {
  const event = {} as H3Event;
  const baseFetcher = vi.fn(async () => ({ data: { tasks: [] } }));
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.supabaseServiceKey = '';
    runtimeConfig.supabaseUrl = '';
    mockGetQuery.mockReturnValue({ gameMode: 'pvp', lang: 'en' });
    mockGetValidatedLanguage.mockReturnValue('en');
    mockValidateGameMode.mockReturnValue('regular');
    mockShouldBypassCache.mockReturnValue(false);
    mockCreateTarkovJsonBootstrapFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonHideoutFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonItemsFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonMapSpawnsFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonPrestigeFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonTaskObjectivesFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonTaskRewardsFetcher.mockReturnValue(baseFetcher);
    mockCreateTarkovJsonTasksCoreFetcher.mockReturnValue(baseFetcher);
    mockApplyOverlay.mockImplementation(async (payload) => payload);
    mockSanitizeTaskRewards.mockImplementation((payload) => payload);
    mockEdgeCache.mockImplementation(async (_eventArg, _key, fetcher: () => Promise<unknown>) => {
      return await fetcher();
    });
    mockGetPrecomputedStore.mockReturnValue(null);
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
    vi.stubGlobal('getQuery', mockGetQuery);
    vi.stubGlobal('setHeader', mockSetHeader);
    vi.stubGlobal('useRuntimeConfig', () => runtimeConfig);
    vi.stubGlobal('fetch', mockFetch as typeof fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('builds expected cache key for bootstrap', async () => {
    const { default: handler } = await import('@/server/api/tarkov/bootstrap.get');
    await handler(event);
    expect(mockCreateTarkovJsonBootstrapFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'bootstrap-json-v1-en-regular',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('builds expected cache key for hideout with mode and language', async () => {
    const { default: handler } = await import('@/server/api/tarkov/hideout.get');
    await handler(event);
    expect(mockCreateTarkovJsonHideoutFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'regular',
      locale: 'en',
      scheduleRefresh: expect.any(Function),
    });
    const overlayOptions = mockApplyOverlay.mock.calls[0]?.[1] as {
      scheduleRefresh: (task: Promise<unknown>) => void;
    };
    const refreshTask = Promise.resolve();
    overlayOptions.scheduleRefresh(refreshTask);
    expect(mockScheduleBackgroundTask).toHaveBeenCalledWith(event, refreshTask);
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'hideout-json-v5-en-regular',
      baseFetcher,
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
    expect(mockSetOverlayResponseHeaders).toHaveBeenCalledWith(event, {
      data: { tasks: [] },
    });
  });
  it('rethrows hideout cache failures', async () => {
    mockEdgeCache.mockRejectedValueOnce(new Error('hideout cache failed'));
    const { default: handler } = await import('@/server/api/tarkov/hideout.get');
    await expect(handler(event)).rejects.toThrow('hideout cache failed');
    expect(mockApplyOverlay).not.toHaveBeenCalled();
    expect(mockSetOverlayResponseHeaders).not.toHaveBeenCalled();
  });
  it('builds expected cache key for items-lite', async () => {
    const { default: handler } = await import('@/server/api/tarkov/items-lite.get');
    await handler(event);
    expect(mockCreateTarkovJsonItemsFetcher).toHaveBeenCalledWith(
      { gameMode: 'regular', lang: 'en' },
      { lite: true }
    );
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'regular',
      locale: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'items-lite-json-v2-en-regular',
      expect.any(Function),
      222,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('builds expected cache key for items', async () => {
    const { default: handler } = await import('@/server/api/tarkov/items.get');
    await handler(event);
    expect(mockCreateTarkovJsonItemsFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'regular',
      locale: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'items-json-v2-en-regular',
      expect.any(Function),
      222,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('throws for malformed upstream payloads on items-lite', async () => {
    mockCreateTarkovJsonItemsFetcher.mockReturnValueOnce(async () => {
      throw new Error('Invalid json.tarkov.dev response');
    });
    const { default: handler } = await import('@/server/api/tarkov/items-lite.get');
    await expect(handler(event)).rejects.toThrow('Invalid json.tarkov.dev response');
  });
  it('throws for malformed upstream payloads on items', async () => {
    mockCreateTarkovJsonItemsFetcher.mockReturnValueOnce(async () => {
      throw new Error('Invalid json.tarkov.dev response');
    });
    const { default: handler } = await import('@/server/api/tarkov/items.get');
    await expect(handler(event)).rejects.toThrow('Invalid json.tarkov.dev response');
  });
  it.each(['regular', 'pve', 'pvp-season'])(
    'serves scoped progression catalogs for %s',
    async (gameMode) => {
      mockValidateGameMode.mockReturnValue(gameMode);
      mockFetchOverlay.mockResolvedValueOnce({
        overlay: {
          editions: { standard: { title: 'Standard', value: 1 } },
          storyChapters: { shared: { name: 'Shared', order: 1 } },
          modes: { pve: { storyChapters: { added: { name: 'PvE chapter', order: 2 } } } },
          seasonalPerks: { perk: { name: 'Perk', effects: [] } },
        },
        meta: { status: 'fresh' },
      });
      const { default: handler } = await import('@/server/api/tarkov/editions.get');
      const response = await handler(event);
      expect(response.data.editions[0]?.id).toBe('standard');
      expect(mockFetchOverlay).toHaveBeenCalledWith(false);
      expect(response.data.storyChapters).toHaveLength(gameMode === 'pve' ? 2 : 1);
      expect(response.data.seasonalPerks).toHaveLength(gameMode === 'pvp-season' ? 1 : 0);
      expect(mockSetOverlayResponseHeaders).toHaveBeenCalledWith(event, response);
    }
  );
  it.each(['editions', 'prestige'] as const)(
    'fails closed when the %s overlay is unavailable',
    async (catalog) => {
      mockFetchOverlay.mockResolvedValueOnce({
        overlay: null as unknown as object,
        meta: { status: 'unavailable' },
      });
      const { default: handler } =
        catalog === 'editions'
          ? await import('@/server/api/tarkov/editions.get')
          : await import('@/server/api/tarkov/prestige.get');
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
      expect(mockCreateTarkovJsonPrestigeFetcher).not.toHaveBeenCalled();
    }
  );
  describe('overlay-status', () => {
    const loadHandler = async () =>
      (await import('@/server/api/tarkov/overlay-status.get')).default;
    it('serves the precompute manifest without storing it', async () => {
      const manifest = { entries: [{ key: 'tasks-core-json-v4-en-regular', overlay: 'sha-1' }] };
      const get = vi.fn(async () => manifest);
      mockGetPrecomputedStore.mockReturnValue({ get });
      const handler = await loadHandler();
      await expect(handler(event)).resolves.toEqual(manifest);
      expect(get).toHaveBeenCalledWith('overlay-precompute-manifest-json-v4', 'json');
      expect(mockSetHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store');
    });
    it.each([
      ['the binding is missing', () => null],
      ['the manifest is absent', () => ({ get: vi.fn(async () => null) })],
    ])('answers 503 when %s', async (_case, store) => {
      mockGetPrecomputedStore.mockReturnValue(store());
      const handler = await loadHandler();
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
      expect(mockSetHeader).not.toHaveBeenCalled();
    });
    it('answers 503 instead of surfacing a store read failure', async () => {
      mockGetPrecomputedStore.mockReturnValue({
        get: vi.fn(async () => {
          throw new Error('KV unavailable');
        }),
      });
      const handler = await loadHandler();
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
    });
  });
  it('passes raw prestige payloads through the scoped overlay projector', async () => {
    const { default: handler } = await import('@/server/api/tarkov/prestige.get');
    mockFetchOverlay.mockResolvedValueOnce({
      overlay: { prestige: { level: { level: 2 } } },
      meta: { status: 'fresh' },
    });
    await handler(event);
    const project = mockCreateTarkovJsonPrestigeFetcher.mock.calls[0]![0].project;
    expect(project({ prestige: [{ id: 'level', level: 1 }] }).prestige).toEqual([
      expect.objectContaining({ id: 'level', level: 2 }),
    ]);
  });
  it('builds expected cache key for prestige', async () => {
    const { default: handler } = await import('@/server/api/tarkov/prestige.get');
    await handler(event);
    expect(mockFetchOverlay).toHaveBeenCalledWith(false);
    expect(mockCreateTarkovJsonPrestigeFetcher).toHaveBeenCalledWith({
      lang: 'en',
      gameMode: 'regular',
      project: expect.any(Function),
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'prestige-json-v3-en-regular',
      expect.any(Function),
      222,
      {
        cacheKeyPrefix: 'tarkov',
      }
    );
  });
  it('builds expected cache key for map spawns', async () => {
    const { default: handler } = await import('@/server/api/tarkov/map-spawns.get');
    await handler(event);
    expect(mockCreateTarkovJsonMapSpawnsFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'map-spawns-json-v1-en-regular',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('applies overlay for tasks-core with bypass flag', async () => {
    const { default: handler } = await import('@/server/api/tarkov/tasks-core.get');
    await handler(event);
    expect(mockShouldBypassCache).toHaveBeenCalledWith(event);
    expect(mockCreateTarkovJsonTasksCoreFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'regular',
      locale: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-core-json-v4-en-regular',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov', precomputed: true }
    );
  });
  it('applies overlay for tasks-objectives with versioned cache key', async () => {
    const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
    await handler(event);
    expect(mockCreateTarkovJsonTaskObjectivesFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'regular',
      locale: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-objectives-json-v3-en-regular',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('sanitizes and overlays tasks-rewards before caching', async () => {
    const { default: handler } = await import('@/server/api/tarkov/tasks-rewards.get');
    await handler(event);
    expect(mockCreateTarkovJsonTaskRewardsFetcher).toHaveBeenCalledWith({
      gameMode: 'regular',
      lang: 'en',
    });
    expect(mockSanitizeTaskRewards).toHaveBeenCalled();
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'regular',
      locale: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-rewards-json-v2-en-regular',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('returns last successful cache purge timestamp from audit log', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { created_at: '2026-02-18T12:00:00.000Z', details: { success: false } },
        { created_at: '2026-02-17T12:00:00.000Z', details: { success: true } },
      ],
      ok: true,
    });
    const { default: handler } = await import('@/server/api/tarkov/cache-meta.get');
    const result = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, CACHE_META_HEADERS);
    expect(result).toEqual({
      data: {
        lastPurgeAt: '2026-02-17T12:00:00.000Z',
      },
    });
  });
  it('returns fallback cache meta when fetch fails', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    mockFetch.mockRejectedValueOnce(new Error('network-failure'));
    const { default: handler } = await import('@/server/api/tarkov/cache-meta.get');
    const result = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, CACHE_META_HEADERS);
    expect(result).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
  });
  it('returns fallback cache meta when Supabase responds with non-OK status', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    mockFetch.mockResolvedValueOnce({
      json: async () => ({}),
      ok: false,
    });
    const { default: handler } = await import('@/server/api/tarkov/cache-meta.get');
    const result = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, CACHE_META_HEADERS);
    expect(result).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
  });
  it('returns null lastPurgeAt when audit log is empty', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    mockFetch.mockResolvedValueOnce({
      json: async () => [],
      ok: true,
    });
    const { default: handler } = await import('@/server/api/tarkov/cache-meta.get');
    const result = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, CACHE_META_HEADERS);
    expect(result).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
  });
  it('returns null lastPurgeAt when audit log has only unsuccessful entries', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    mockFetch.mockResolvedValueOnce({
      json: async () => [{ details: { success: false } }],
      ok: true,
    });
    const { default: handler } = await import('@/server/api/tarkov/cache-meta.get');
    const result = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, CACHE_META_HEADERS);
    expect(result).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
  });
});
