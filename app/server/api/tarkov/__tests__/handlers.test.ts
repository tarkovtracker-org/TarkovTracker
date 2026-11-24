// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import type { H3Event } from 'h3';
const CACHE_META_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  Vary: 'Origin',
};
const {
  mockFetchOverlay,
  mockFetch,
  mockSetHeader,
  mockSetOverlayResponseHeaders,
  mockGetPrecomputedStore,
  mockSetResponseHeaders,
} = vi.hoisted(() => ({
  mockFetchOverlay: vi.fn(),
  mockFetch: vi.fn(),
  mockSetHeader: vi.fn(),
  mockSetOverlayResponseHeaders: vi.fn(),
  mockGetPrecomputedStore: vi.fn(),
  mockSetResponseHeaders: vi.fn(),
}));
const runtimeConfig = { supabaseServiceKey: '', supabaseUrl: '' };
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  setResponseHeaders: mockSetResponseHeaders,
}));
vi.mock('~/server/utils/edgeCache', () => ({ shouldBypassCache: () => false }));
vi.mock('~/server/utils/overlay', () => ({ fetchOverlay: mockFetchOverlay }));
vi.mock('~/server/utils/overlayResponseHeaders', () => ({
  setOverlayResponseHeaders: mockSetOverlayResponseHeaders,
}));
vi.mock('~/server/utils/precomputedTarkov', () => ({
  getPrecomputedStore: mockGetPrecomputedStore,
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
describe('Tarkov API handlers', () => {
  const event = {} as H3Event;
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.supabaseServiceKey = '';
    runtimeConfig.supabaseUrl = '';
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
    vi.stubGlobal('setHeader', mockSetHeader);
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('useRuntimeConfig', () => runtimeConfig);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('serves valid overlay extract rules with their cues, and null until both are valid', async () => {
    const extractRequirements = {
      sources: { regular: { clientBuild: '1.3.0.0.48484', definitionsSha256: 'a'.repeat(64) } },
      maps: { map: { exit: { name: 'exit', rules: [{ type: 'coop' }] } } },
    };
    const extractCues = {
      map: { exit: { name: 'exit', cues: [{ type: 'flare' }], reference: 'https://example.com' } },
    };
    const meta = { status: 'fresh', sha256: 'overlay-sha' };
    const { default: handler } = await import('@/server/api/tarkov/extract-requirements.get');
    mockFetchOverlay.mockResolvedValueOnce({ overlay: { extractRequirements, extractCues }, meta });
    const response = await handler(event);
    expect(response).toEqual({
      data: { requirements: extractRequirements, cues: extractCues },
      dataOverlay: meta,
    });
    expect(mockSetHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'no-cache');
    expect(mockSetOverlayResponseHeaders).toHaveBeenCalledWith(event, response);
    mockFetchOverlay.mockResolvedValueOnce({ overlay: { extractRequirements }, meta });
    expect((await handler(event)).data).toBeNull();
  });
  describe('overlay-status', () => {
    const loadHandler = async () =>
      (await import('@/server/api/tarkov/overlay-status.get')).default;
    it('serves the precompute manifest without storing it', async () => {
      const manifest = { entries: [{ key: 'tasks-core-json-v3-en-regular', overlay: 'sha-1' }] };
      const get = vi.fn(async () => manifest);
      mockGetPrecomputedStore.mockReturnValue({ get });
      const handler = await loadHandler();
      await expect(handler(event)).resolves.toEqual(manifest);
      expect(get).toHaveBeenCalledWith(CATALOG_MANIFEST_KEY, 'json');
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
  it('returns last successful cache purge timestamp from audit log', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co/?ignored=1#fragment';
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
    const auditUrl = new URL(String(mockFetch.mock.calls[0]?.[0]));
    expect(auditUrl.pathname).toBe('/rest/v1/admin_audit_log');
    expect(auditUrl.hash).toBe('');
    const auditQuery = auditUrl.searchParams;
    expect(auditQuery.get('details')).toBe('cs.{"success":true}');
    expect(auditQuery.get('limit')).toBe('1');
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
