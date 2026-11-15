// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSizes, readScanCatalog } from '@/utils/stashScan/catalogClient';
import { FEATURE_VERSION } from '@/utils/stashScan/core/features';
function manifest(item: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    featureVersion: FEATURE_VERSION,
    builtAt: '2026-11-15T00:00:00Z',
    missing: [],
    shards: {},
    items: [
      {
        id: '5448fee04bdc2dbc018b4567',
        name: 'Water',
        shortName: 'Water',
        width: 1,
        height: 1,
        maxStack: 1,
        ...item,
      },
    ],
  };
}
function serveJson(value: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(value))
  );
}
describe('published recognition catalog', () => {
  afterEach(() => vi.unstubAllGlobals());
  function serveAssets() {
    const fetcher = vi.fn(async (url: string) => {
      const file = resolve('public', url.slice(1));
      return new Response(readFileSync(file));
    });
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  }
  it.each(['{', 'null', '[]', 'true', JSON.stringify({ ...manifest(), items: [null] })])(
    'normalizes malformed catalog JSON or root/item shape %s',
    async (json) => {
      serveJson(json);
      await expect(readScanCatalog()).rejects.toThrow('stash_import.errors.catalog_invalid');
    }
  );
  it.each([
    ['id', ['5448fee04bdc2dbc018b4567']],
    ['id', null],
    ['id', 123],
    ['width', 0],
    ['width', -1],
    ['width', 1.5],
    ['width', 11],
    ['width', null],
    ['width', '1'],
    ['height', 0],
    ['height', -1],
    ['height', 1.5],
    ['height', 11],
    ['height', null],
    ['height', '1'],
    ['maxStack', -1],
    ['maxStack', 1.5],
    ['maxStack', 1_000_001],
    ['maxStack', Number.MAX_SAFE_INTEGER + 1],
    ['maxStack', null],
    ['maxStack', '1'],
  ])('rejects invalid item %s=%s', async (field, value) => {
    serveJson(JSON.stringify(manifest({ [String(field)]: value })));
    await expect(readScanCatalog()).rejects.toThrow('stash_import.errors.catalog_invalid');
  });
  it('normalizes invalid UTF-8 to a catalog error before JSON parsing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([0xff])))
    );
    await expect(readScanCatalog()).rejects.toThrow('stash_import.errors.catalog_invalid');
  });
  it.each([0, 1, 1_000_000])(
    'accepts the explicit unknown/nonstack/maximum stack bound %s',
    async (maxStack) => {
      serveJson(JSON.stringify(manifest({ width: 10, height: 10, maxStack })));
      expect((await readScanCatalog()).items[0]!.maxStack).toBe(maxStack);
    }
  );
  it('accepts the published manifest through the browser validation boundary', async () => {
    const fetcher = serveAssets();
    const catalog = await readScanCatalog();
    expect(catalog.items.length).toBeGreaterThan(5000);
    expect(catalog.items.every((item) => /^[a-f0-9]{24}$/.test(item.id))).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      '/stash-scan/catalog.json',
      expect.objectContaining({ credentials: 'omit', redirect: 'error' })
    );
  });
  it('downloads and validates only requested sizes, then reuses decoded templates', async () => {
    const fetcher = serveAssets();
    const catalog = await readScanCatalog();
    const cache = new Map();
    const index = await loadSizes(catalog, ['1x1'], cache);
    expect(index.size).toBeGreaterThan(100);
    expect([...index.bySize.keys()]).toEqual(['1x1']);
    expect(catalog.shards['1x1']!.file).toMatch(/\.bin$/);
    await loadSizes(catalog, ['1x1'], cache);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every((call) => call[0].startsWith('/stash-scan/'))).toBe(true);
  });
  it('rejects corrupted recognition assets before decoding or caching them', async () => {
    const fetcher = serveAssets();
    const catalog = await readScanCatalog();
    fetcher.mockImplementationOnce(async () => new Response(new Uint8Array([1, 2, 3])));
    const cache = new Map();
    await expect(loadSizes(catalog, ['1x1'], cache)).rejects.toThrow('catalog_invalid');
    expect(cache.size).toBe(0);
  });
});
