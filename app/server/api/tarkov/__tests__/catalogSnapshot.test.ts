import { createApp, defineEventHandler, toWebHandler } from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogHandler } from '@/server/utils/serveCatalog';
import { CATALOG_DATASETS, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
const body = JSON.stringify({
  data: { tasks: [{ id: 'unchanged-id', description: '@tt:pve:tasks:key' }] },
});
function serve(
  dataset: Parameters<typeof catalogHandler>[0],
  scope: string,
  stored: string | null = body
) {
  const key = `neutral-catalog-v1/${scope}/immutable-digest`;
  const manifest = {
    completedAt: 123,
    entries: { [scope]: { key, headers: { 'X-Overlay-Sha256': 'active-sha' } } },
  };
  const get = vi.fn(async (requested: string) => {
    if (requested === CATALOG_MANIFEST_KEY) return manifest;
    return requested === key && stored !== null
      ? new Response(stored).body!.pipeThrough(new CompressionStream('gzip'))
      : null;
  });
  const app = createApp()
    .use(
      defineEventHandler((event) => {
        event.context.cloudflare = { env: { TARKOV_DATA: { get } } };
      })
    )
    .use(catalogHandler(dataset));
  return { request: toWebHandler(app), get, key };
}
describe('catalog snapshot routes', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the last verified scope available during a KV read failure', async () => {
    const kept = new Map<string, Response>();
    const cache = {
      match: async (key: string) => kept.get(key)?.clone(),
      put: async (key: string, value: Response) => {
        kept.set(key, value);
      },
    };
    vi.stubGlobal('caches', { default: cache });
    const { request, get } = serve('tasks-core', 'tasks-core/pve');
    const url = 'https://example.test/?gameMode=pve';
    const current = await request(new Request(url));
    expect(await current.text()).toEqual(body);
    get.mockRejectedValue(new Error('KV unavailable'));
    const stale = await request(new Request(url));
    expect(stale.headers.get('X-Cache-Status')).toBe('STALE');
    expect(await stale.text()).toEqual(body);
    const other = await request(new Request('https://example.test/?gameMode=regular'));
    expect(other.status).toBe(503);
  });
  it.each(CATALOG_DATASETS)('reads the same %s snapshot in every language', async (dataset) => {
    const { get, request, key } = serve(dataset, dataset + '/pve');
    for (const lang of ['en', 'de']) {
      const res = await request(
        new Request(`https://example.test/api/tarkov/${dataset}?gameMode=pve&lang=${lang}`)
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Overlay-Sha256')).toBe('active-sha');
      expect(res.headers.get('X-Cache-Status')).toBe('PRECOMPUTE');
      expect(await res.text()).toBe(body);
    }
    expect(get.mock.calls.map(([k]) => k)).toEqual([
      CATALOG_MANIFEST_KEY,
      key,
      CATALOG_MANIFEST_KEY,
      key,
    ]);
  });
  it('selects one German table across game modes', async () => {
    const { request } = serve('strings', 'strings/de');
    for (const mode of ['pve', 'pvp-season', 'regular']) {
      expect(
        (await request(new Request('https://example.test/?lang=de&gameMode=' + mode))).status
      ).toBe(200);
    }
  });
  it.each(['tasks-objectives', 'editions'] as const)(
    'fails closed for missing %s objects after pointer publication',
    async (dataset) => {
      const { request } = serve(dataset, dataset + '/regular', null);
      const res = await request(new Request('https://example.test'));
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    }
  );
});
