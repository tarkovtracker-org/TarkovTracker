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
const full = '{"data":{"tasks":[{"id":"task","objectives":[]}]},"dataOverlay":{"version":"v1"}}';
const counts = '{"data":{"tasks":[{"id":"task","objectives":[]}]}}';
const fullScope = 'tasks-objectives/regular';
const countsScope = fullScope + '/counts';
const release = 123;
function entry(scope, body) {
  return {
    key: `neutral-catalog-v1/${scope}/${sha256(Buffer.from(body))}`,
    bytes: Buffer.byteLength(body),
  };
}
const fullEntry = entry(fullScope, full);
const countsEntry = entry(countsScope, counts);
const manifest = {
  completedAt: release,
  entries: { [fullScope]: fullEntry, [countsScope]: countsEntry },
};
function stubCatalogs(countsBody = counts, countsRelease = release) {
  vi.stubGlobal('process', {
    ...process,
    argv: ['node', 'seed-lighthouse-catalog', 'test-state'],
  });
  fetchResponse.mockImplementation(async (url) => {
    if (url.pathname.endsWith('/overlay-status')) return Response.json(manifest);
    const wantsCounts = url.searchParams.has('view');
    return new Response(wantsCounts ? countsBody : full, {
      headers: {
        'X-Cache-Status': 'PRECOMPUTE',
        'X-Catalog-Release': String(wantsCounts ? countsRelease : release),
      },
    });
  });
}
describe('Lighthouse catalog seed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.resetAllMocks();
  });
  it('verifies and seeds both the full objectives catalog and its counts view', async () => {
    stubCatalogs();
    await import('./seed-lighthouse-catalog.mjs');
    const requests = fetchResponse.mock.calls.map(([url]) => url.pathname + url.search);
    expect(requests).toContain('/api/tarkov/tasks-objectives?gameMode=regular&view=counts');
    for (const [snapshot, expected] of [
      [fullEntry, full],
      [countsEntry, counts],
    ]) {
      const seeded = put.mock.calls.find(([storedKey]) => storedKey === snapshot.key);
      expect(seeded).toBeDefined();
      expect(gunzipSync(Buffer.from(seeded[1])).toString()).toBe(expected);
    }
    expect(put).toHaveBeenLastCalledWith(manifestKey, JSON.stringify(manifest));
    expect(dispose).toHaveBeenCalledOnce();
  });
  it.each([
    { reason: 'digest', body: counts.replace('"task"', '"tusk"'), release },
    { reason: 'release', body: counts, release: release + 1 },
  ])('writes nothing when the counts $reason differs', async ({ body, release: candidate }) => {
    stubCatalogs(body, candidate);
    await expect(import('./seed-lighthouse-catalog.mjs')).rejects.toThrow(
      'Lighthouse catalog tasks-objectives/regular/counts did not match release 123'
    );
    expect(put).not.toHaveBeenCalled();
  });
});
