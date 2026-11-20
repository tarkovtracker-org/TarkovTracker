// @vitest-environment node
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
mockNuxtImport('useRuntimeConfig', () => () => ({
  public: { appUrl: 'https://tarkovtracker.org' },
  supabaseUrl: '',
  supabaseServiceKey: '',
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
describe('overlay purge concurrency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OVERLAY_TOKEN', token);
    vi.stubEnv('NUXT_CACHE_BYPASS_ENABLED', 'false');
    vi.stubEnv(
      'OVERLAY_URL',
      'https://raw.githubusercontent.com/example/private/main/overlay.json'
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
});
