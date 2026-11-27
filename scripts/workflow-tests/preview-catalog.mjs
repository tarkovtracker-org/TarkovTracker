import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPreviewCatalog } from '../preview/smoke/catalog.mjs';
const now = Date.parse('2026-11-28T00:00:00Z');
const origin = 'https://preview.example.test';
function probe(status, source, release) {
  return assertPreviewCatalog(origin, {
    now: () => now,
    async fetchImpl(url, options) {
      assert.equal(url, origin + '/api/tarkov/hideout?gameMode=regular');
      assert.equal(options.redirect, 'manual');
      const headers = new Headers({ 'X-Cache-Status': source });
      if (release !== null) headers.set('X-Catalog-Release', String(release));
      return new Response('{}', { status, headers });
    },
  });
}
test('preview readiness accepts a recent release from KV', async () => {
  assert.equal(await probe(200, 'PRECOMPUTE', now - 60_000), now - 60_000);
});
test('preview readiness surfaces missing and stale catalog data before the browser suite', async () => {
  await assert.rejects(probe(503, 'unknown', null), /unavailable \(HTTP 503/);
  await assert.rejects(probe(200, 'STALE', now), /source STALE/);
  await assert.rejects(probe(200, 'PRECOMPUTE', null), /timestamp is missing/);
  await assert.rejects(probe(200, 'PRECOMPUTE', now - 6 * 24 * 3600000 - 1), /older than six days/);
});
