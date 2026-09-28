import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertPreviewTarget,
  previewAccessHeaders,
  protectPreviewBrowser,
} from '../preview/smoke/access.mjs';
test('Access credentials are paired and optional', () => {
  assert.deepEqual(previewAccessHeaders({}), {});
  assert.throws(() => previewAccessHeaders({ PREVIEW_ACCESS_CLIENT_ID: 'id' }));
  assert.deepEqual(
    previewAccessHeaders({
      PREVIEW_ACCESS_CLIENT_ID: 'id',
      PREVIEW_ACCESS_CLIENT_SECRET: 'secret',
    }),
    {
      'CF-Access-Client-Id': 'id',
      'CF-Access-Client-Secret': 'secret',
    }
  );
});
test('Access target is exact-origin HTTPS', () => {
  assertPreviewTarget('https://preview.example/api/tarkov/bootstrap', 'https://preview.example');
  assert.throws(() =>
    assertPreviewTarget('https://preview.example.evil/api', 'https://preview.example')
  );
  assert.throws(() => assertPreviewTarget('http://preview.example/api', 'https://preview.example'));
});
test('browser credentials use runner fetch with redirects disabled', async () => {
  const oldId = process.env.PREVIEW_ACCESS_CLIENT_ID;
  const oldSecret = process.env.PREVIEW_ACCESS_CLIENT_SECRET;
  process.env.PREVIEW_ACCESS_CLIENT_ID = 'id';
  process.env.PREVIEW_ACCESS_CLIENT_SECRET = 'secret';
  try {
    let handler;
    await protectPreviewBrowser(
      {
        route: async (pattern, callback) => {
          assert.equal(pattern, 'https://preview.example/**');
          handler = callback;
        },
      },
      'https://preview.example'
    );
    let fulfilled = false;
    await handler({
      request: () => ({ url: () => 'https://preview.example/', headers: () => ({}) }),
      fetch: async (options) => {
        assert.equal(options.maxRedirects, 0);
        return 'response';
      },
      fulfill: async ({ response }) => {
        assert.equal(response, 'response');
        fulfilled = true;
      },
    });
    assert.equal(fulfilled, true);
  } finally {
    if (oldId === undefined) delete process.env.PREVIEW_ACCESS_CLIENT_ID;
    else process.env.PREVIEW_ACCESS_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.PREVIEW_ACCESS_CLIENT_SECRET;
    else process.env.PREVIEW_ACCESS_CLIENT_SECRET = oldSecret;
  }
});
