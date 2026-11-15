// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSizes, readScanCatalog } from '@/utils/stashScan/catalogClient';
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
