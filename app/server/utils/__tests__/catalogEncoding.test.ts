// @vitest-environment node
import { gzipSync } from 'node:zlib';
import { createApp, toWebHandler } from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSendCatalogGzip, sendCatalogGzip } from '@/server/utils/catalogEncoding';
import { catalogHandler } from '@/server/utils/serveCatalog';
import { CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
vi.mock('@/server/utils/edgeCache', () => ({ shouldBypassCache: () => false }));
const strings = 'https://tarkovtracker.org/api/tarkov/strings?lang=en';
describe('catalog gzip negotiation', () => {
  it.each([
    ['br, GZIP', true],
    ['br, gzip;q=0.125', true],
    ['gzip; q=1.0', true],
    ['*', true],
    ['*;q=0.5', true],
    ['*;q=0', false],
    ['gzip;q=0, *;q=1', false],
    ['*;q=1, gzip;q=0', false],
    ['gzip;q=0.000', false],
    ['gzip;q=pepper', false],
    ['gzip;q=2', false],
    ['br, identity', false],
  ])('handles %s', (encoding, accepted) => {
    const request = new Request(strings, { headers: { 'Accept-Encoding': encoding } });
    expect(canSendCatalogGzip(request)).toBe(accepted);
  });
  it('uses the original client encoding when Cloudflare overwrites the header', () => {
    const request = Object.assign(
      new Request(strings, { headers: { 'Accept-Encoding': 'br, gzip' } }),
      {
        cf: { clientAcceptEncoding: 'identity' },
      }
    );
    expect(canSendCatalogGzip(request)).toBe(false);
  });
  it('keeps internal catalog calls and HEAD responses on the existing path', () => {
    const headers = { 'Accept-Encoding': 'gzip' };
    expect(canSendCatalogGzip()).toBe(false);
    expect(canSendCatalogGzip(new Request(strings, { method: 'HEAD', headers }))).toBe(false);
    expect(canSendCatalogGzip(new Request('https://tarkovtracker.org/profile', { headers }))).toBe(
      false
    );
  });
});
describe('warm strings responses', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reuses the current verified gzip body and strips the internal marker at the Pages boundary', async () => {
    const scope = 'strings/en';
    const key = 'neutral-catalog-v1/strings/en/fixture';
    const body = '{"data":{"strings":{"key":"value"}}}';
    const gzip = Uint8Array.from(gzipSync(body));
    const cache = new Response(gzip, {
      headers: {
        'X-Catalog-Key': key,
        'X-Catalog-Bytes': String(body.length),
        'X-Catalog-Release': '123',
      },
    });
    const put = vi.fn();
    vi.stubGlobal('caches', { default: { match: async () => cache.clone(), put } });
    const get = vi.fn().mockResolvedValue({
      completedAt: 123,
      entries: { [scope]: { key, bytes: body.length, headers: {} } },
    });
    const request = new Request(strings, { headers: { 'Accept-Encoding': 'gzip' } });
    const fetch = toWebHandler(createApp().use(catalogHandler('strings')));
    const response = sendCatalogGzip(
      await fetch(request, {
        cloudflare: { request, env: { TARKOV_DATA: { get } } },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Encoding')).toBe('gzip');
    expect(response.headers.get('X-Catalog-Release')).toBe('123');
    expect(response.headers.has('X-Tarkov-Catalog-Precompressed')).toBe(false);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(gzip);
    expect(get.mock.calls).toEqual([[CATALOG_MANIFEST_KEY, 'json']]);
    expect(put).not.toHaveBeenCalled();
  });
});
