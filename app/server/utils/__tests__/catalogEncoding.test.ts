// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canSendCatalogGzip } from '@/server/utils/catalogEncoding';
const strings = 'https://tarkovtracker.org/api/tarkov/strings?lang=en';
describe('catalog gzip negotiation', () => {
  it.each([
    ['br, GZIP', true],
    ['br, gzip;q=0.125', true],
    ['gzip; q=1.0', true],
    ['gzip;q=0, *;q=1', false],
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
