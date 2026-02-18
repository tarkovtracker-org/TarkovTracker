// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const {
  mockApplyOverlay,
  mockCreateTarkovFetcher,
  mockEdgeCache,
  mockFetch,
  mockGetQuery,
  mockGetValidatedLanguage,
  mockSanitizeTaskRewards,
  mockSetResponseHeaders,
  mockShouldBypassCache,
  mockValidateAndThrow,
  mockValidateGameMode,
} = vi.hoisted(() => ({
  mockApplyOverlay: vi.fn(),
  mockCreateTarkovFetcher: vi.fn(),
  mockEdgeCache: vi.fn(),
  mockFetch: vi.fn(),
  mockGetQuery: vi.fn(),
  mockGetValidatedLanguage: vi.fn(),
  mockSanitizeTaskRewards: vi.fn(),
  mockSetResponseHeaders: vi.fn(),
  mockShouldBypassCache: vi.fn(),
  mockValidateAndThrow: vi.fn(),
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
  createTarkovFetcher: mockCreateTarkovFetcher,
  edgeCache: mockEdgeCache,
  shouldBypassCache: mockShouldBypassCache,
}));
vi.mock('~/server/utils/graphql-validation', () => ({
  validateAndThrow: mockValidateAndThrow,
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
vi.mock('~/server/utils/tarkov-queries', () => ({
  TARKOV_BOOTSTRAP_QUERY: 'BOOTSTRAP_QUERY',
  TARKOV_HIDEOUT_QUERY: 'HIDEOUT_QUERY',
  TARKOV_ITEMS_LITE_QUERY: 'ITEMS_LITE_QUERY',
  TARKOV_ITEMS_QUERY: 'ITEMS_QUERY',
  TARKOV_MAP_SPAWNS_QUERY: 'MAP_SPAWNS_QUERY',
  TARKOV_PRESTIGE_QUERY: 'PRESTIGE_QUERY',
  TARKOV_TASKS_CORE_QUERY: 'TASKS_CORE_QUERY',
  TARKOV_TASKS_OBJECTIVES_QUERY: 'TASKS_OBJECTIVES_QUERY',
  TARKOV_TASKS_REWARDS_QUERY: 'TASKS_REWARDS_QUERY',
}));
vi.mock('~/server/utils/tarkov-sanitization', () => ({
  sanitizeTaskRewards: mockSanitizeTaskRewards,
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
    mockValidateGameMode.mockReturnValue('pvp');
    mockShouldBypassCache.mockReturnValue(false);
    mockCreateTarkovFetcher.mockReturnValue(baseFetcher);
    mockValidateAndThrow.mockReturnValue(undefined);
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
    expect(mockCreateTarkovFetcher).toHaveBeenCalledWith('BOOTSTRAP_QUERY', {});
    expect(mockEdgeCache).toHaveBeenCalledWith(event, 'bootstrap-en', expect.any(Function), 111, {
      cacheKeyPrefix: 'tarkov',
    });
  });
  it('builds expected cache key for hideout with mode and language', async () => {
    const { default: handler } = await import('@/server/api/tarkov/hideout.get');
    await handler(event);
    expect(mockCreateTarkovFetcher).toHaveBeenCalledWith('HIDEOUT_QUERY', {
      gameMode: 'pvp',
      lang: 'en',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(event, 'hideout-en-pvp', expect.any(Function), 111, {
      cacheKeyPrefix: 'tarkov',
    });
  });
  it('builds expected cache key for items-lite', async () => {
    const { default: handler } = await import('@/server/api/tarkov/items-lite.get');
    await handler(event);
    expect(mockCreateTarkovFetcher).toHaveBeenCalledWith('ITEMS_LITE_QUERY', { lang: 'en' });
    expect(mockEdgeCache).toHaveBeenCalledWith(event, 'items-lite-en', expect.any(Function), 222, {
      cacheKeyPrefix: 'tarkov',
    });
  });
  it('builds expected cache key for items', async () => {
    const { default: handler } = await import('@/server/api/tarkov/items.get');
    await handler(event);
    expect(mockCreateTarkovFetcher).toHaveBeenCalledWith('ITEMS_QUERY', { lang: 'en' });
    expect(mockEdgeCache).toHaveBeenCalledWith(event, 'items-en', expect.any(Function), 222, {
      cacheKeyPrefix: 'tarkov',
    });
  });
  it('builds expected cache key for prestige', async () => {
    const { default: handler } = await import('@/server/api/tarkov/prestige.get');
    await handler(event);
    expect(mockCreateTarkovFetcher).toHaveBeenCalledWith('PRESTIGE_QUERY', { lang: 'en' });
    expect(mockEdgeCache).toHaveBeenCalledWith(event, 'prestige-en', expect.any(Function), 222, {
      cacheKeyPrefix: 'tarkov',
    });
  });
  it('validates map spawn response before caching', async () => {
    const { default: handler } = await import('@/server/api/tarkov/map-spawns.get');
    await handler(event);
    expect(mockValidateAndThrow).toHaveBeenCalled();
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'map-spawns-en-pvp',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('applies overlay for tasks-core with bypass flag', async () => {
    const { default: handler } = await import('@/server/api/tarkov/tasks-core.get');
    await handler(event);
    expect(mockShouldBypassCache).toHaveBeenCalledWith(event);
    expect(mockValidateAndThrow).toHaveBeenCalled();
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'pvp',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-core-en-pvp',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('applies overlay for tasks-objectives with versioned cache key', async () => {
    const { default: handler } = await import('@/server/api/tarkov/tasks-objectives.get');
    await handler(event);
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'pvp',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-objectives-v2-en-pvp',
      expect.any(Function),
      111,
      { cacheKeyPrefix: 'tarkov' }
    );
  });
  it('sanitizes and overlays tasks-rewards before caching', async () => {
    const { default: handler } = await import('@/server/api/tarkov/tasks-rewards.get');
    await handler(event);
    expect(mockSanitizeTaskRewards).toHaveBeenCalled();
    expect(mockApplyOverlay).toHaveBeenCalledWith(expect.anything(), {
      bypassCache: false,
      gameMode: 'pvp',
    });
    expect(mockEdgeCache).toHaveBeenCalledWith(
      event,
      'tasks-rewards-en-pvp',
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
  it('returns null lastPurgeAt when audit log has no successful purge entries', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    const { default: handler } = await import('@/server/api/tarkov/cache-meta.get');
    mockFetch.mockResolvedValueOnce({
      json: async () => [],
      ok: true,
    });
    const emptyLogResult = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenLastCalledWith(event, { 'Cache-Control': 'no-store' });
    expect(emptyLogResult).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
    mockFetch.mockResolvedValueOnce({
      json: async () => [{ details: { success: false } }],
      ok: true,
    });
    const unsuccessfulLogResult = await handler(event);
    expect(mockSetResponseHeaders).toHaveBeenLastCalledWith(event, { 'Cache-Control': 'no-store' });
    expect(unsuccessfulLogResult).toEqual({
      data: {
        lastPurgeAt: null,
      },
    });
  });
});
