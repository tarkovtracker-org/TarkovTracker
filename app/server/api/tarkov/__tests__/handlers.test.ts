// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const {
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
  mockGetQuery,
  mockGetValidatedLanguage,
  mockSanitizeTaskRewards,
  mockSetResponseHeaders,
  mockShouldBypassCache,
  mockValidateGameMode,
} = vi.hoisted(() => ({
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
  mockGetQuery: vi.fn(),
  mockGetValidatedLanguage: vi.fn(),
  mockSanitizeTaskRewards: vi.fn(),
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
}));
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
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
    vi.stubGlobal('getQuery', mockGetQuery);
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
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'hideout-json-v3-en-regular',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
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
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'items-lite-json-v1-en-regular',
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
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'items-json-v1-en-regular',
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
  it('builds expected cache key for prestige', async () => {
    const { default: handler } = await import('@/server/api/tarkov/prestige.get');
    await handler(event);
    expect(mockCreateTarkovJsonPrestigeFetcher).toHaveBeenCalledWith({
      lang: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'prestige-json-v2-en',
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
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-core-json-v1-en-regular',
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
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, { 'Cache-Control': 'no-store' });
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
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, { 'Cache-Control': 'no-store' });
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
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, { 'Cache-Control': 'no-store' });
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
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, { 'Cache-Control': 'no-store' });
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
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(event, { 'Cache-Control': 'no-store' });
    expect(result).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
  });
});
