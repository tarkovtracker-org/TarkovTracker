import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from './dependency-evidence.mjs';
const { fetchResponse, put, dispose } = vi.hoisted(() => ({
  fetchResponse: vi.fn(),
  put: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./dependency-evidence.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchResponse,
}));
vi.mock('wrangler', () => ({
  getPlatformProxy: async () => ({ env: { TARKOV_DATA: { put } }, dispose }),
}));
const manifestKey = 'neutral-catalog-v1-manifest';
describe('Lighthouse catalog seed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.resetAllMocks();
  });
  it('verifies and seeds both the full objectives catalog and its counts view', async () => {
    const full =
      '{"data":{"tasks":[{"id":"task","objectives":[]}]},"dataOverlay":{"version":"v1"}}';
    const counts = '{"data":{"tasks":[{"id":"task","objectives":[]}]}}';
    const bytes = Buffer.from(counts);
    const key = `neutral-catalog-v1/tasks-objectives/regular/counts/${sha256(bytes)}`;
    const release = 123;
    const manifest = {
      completedAt: release,
      entries: {
        'tasks-objectives/regular': {
          key: `neutral-catalog-v1/tasks-objectives/regular/${sha256(Buffer.from(full))}`,
          bytes: Buffer.byteLength(full),
        },
        'tasks-objectives/regular/counts': { key, bytes: bytes.length },
      },
    };
    vi.stubGlobal('process', {
      ...process,
      argv: ['node', 'seed-lighthouse-catalog', 'test-state'],
    });
    fetchResponse.mockImplementation(async (url) => {
      if (url.pathname.endsWith('/overlay-status')) return Response.json(manifest);
      const body = url.searchParams.has('view') ? counts : full;
      return new Response(body, {
        headers: { 'X-Cache-Status': 'PRECOMPUTE', 'X-Catalog-Release': String(release) },
      });
    });
    await import('./seed-lighthouse-catalog.mjs');
    const requests = fetchResponse.mock.calls.map(([url]) => url.pathname + url.search);
    expect(requests).toContain('/api/tarkov/tasks-objectives?gameMode=regular&view=counts');
    const seeded = put.mock.calls.find(([storedKey]) => storedKey === key);
    expect(gunzipSync(Buffer.from(seeded[1])).toString()).toBe(counts);
    expect(put).toHaveBeenLastCalledWith(manifestKey, JSON.stringify(manifest));
    expect(dispose).toHaveBeenCalledOnce();
  });
});
