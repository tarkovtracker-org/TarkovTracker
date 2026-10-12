import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { createTestHarness } from 'wrangler';
const root = fileURLToPath(new URL('../../', import.meta.url));
const routes = JSON.parse(
  // Generated build output is deliberately absent from Fallow's source-only audit snapshot.
  // fallow-ignore-next-line unresolved-import
  readFileSync(new URL('../../dist/_routes.json', import.meta.url), 'utf8')
);
const harness = createTestHarness({
  root,
  workers: [
    {
      config: {
        name: 'legacy-pages-test',
        main: './scripts/checks/legacy-api-pages-worker.mjs',
        compatibility_date: '2026-01-09',
        compatibility_flags: ['nodejs_compat'],
        vars: { APP_URL: 'https://tarkovtracker.org', NODE_ENV: 'production' },
      },
    },
  ],
});
const realFetch = globalThis.fetch;
const outbound = [];
const retirementCases = ['tarkovtracker.org', 'www.tarkovtracker.org'].flatMap((host) =>
  ['/api/v2', '/api/token', '/api/progress', '/api/team/progress'].flatMap((path) =>
    ['', '/', '?x=1', '/task/123?x=1'].flatMap((suffix) =>
      ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((method) => ({
        url: `https://${host}${path}${suffix}`,
        method,
      }))
    )
  )
);
const retirementRequest = (method) => ({
  method,
  headers: {
    Authorization: 'Bearer retired-secret',
    'X-Test-Unread-Body': '1',
    'X-Test-No-Bindings': '1',
  },
  ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { body: '{bad json' } : {}),
});
async function assertRetirement(response, method, url) {
  assert.equal(response.status, 410, `${url} ${method}`);
  assert.equal(response.headers.get('X-Test-Body-Reads'), '0');
  assert.equal(response.headers.get('X-Test-Body-Used'), 'false');
  assert.equal(response.headers.get('X-Test-Binding-Reads'), '0');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  for (const header of ['Location', 'Retry-After', 'Access-Control-Allow-Credentials']) {
    assert.equal(response.headers.has(header), false);
  }
  if (method === 'HEAD') assert.equal(await response.text(), '');
  else {
    const payload = await response.json();
    assert.equal(payload.error, 'legacy_api_retired');
    assert.equal(payload.api_base_url, 'https://api.tarkovtracker.org');
    assert.equal(payload.documentation_url, 'https://api.tarkovtracker.org/');
  }
}
before(async () => {
  await harness.listen();
  globalThis.fetch = async (input) => {
    outbound.push(String(input?.url || input));
    throw new Error('Unexpected outbound request');
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  await harness.close();
});
test('compiled Pages routing retains its existing Function boundary and static 404 document', () => {
  assert.deepEqual(routes, {
    version: 1,
    include: ['/api/*', '/overlay/*', '/profile/*'],
    exclude: [],
  });
  // Generated build output is deliberately absent from Fallow's source-only audit snapshot.
  // fallow-ignore-next-line unresolved-import
  assert.ok(readFileSync(new URL('../../dist/404.html', import.meta.url), 'utf8').length > 0);
});
test('compiled retirement handles every family and method before consuming a body or binding', async () => {
  for (const { url, method } of retirementCases) {
    const response = await harness.fetch(url, retirementRequest(method));
    await assertRetirement(response, method, url);
  }
  assert.deepEqual(outbound, []);
});
test('compiled browser preflight permits Authorization and returns bodyless 204', async () => {
  const response = await harness.fetch('https://www.tarkovtracker.org/api/progress/?x=1', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://old-client.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': ',Authorization,, Content-Type, If-None-Match,',
      'X-Test-Unread-Body': '1',
      'X-Test-No-Bindings': '1',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('X-Test-Body-Reads'), '0');
  assert.equal(response.headers.get('X-Test-Body-Used'), 'false');
  assert.equal(response.headers.get('X-Test-Binding-Reads'), '0');
  assert.deepEqual(outbound, []);
});
test('compiled normal POST retains body handling and Nitro binding context', async () => {
  const response = await harness.fetch('https://tarkovtracker.org/api/security/tarkov-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid json',
  });
  // The disabled verification endpoint keeps its existing 503; retirement cannot capture it.
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('X-Test-Body-Reads'), '1');
  assert.equal(response.headers.get('X-Test-Body-Used'), 'true');
  assert.equal(response.headers.get('X-Test-Assets-Read'), 'true');
  assert.equal(response.headers.get('X-Test-Environment-Preserved'), 'true');
  assert.notEqual((await response.json()).error, 'legacy_api_retired');
  assert.deepEqual(outbound, []);
});
test('compiled static assets retain the original Request and ASSETS binding', async () => {
  const response = await harness.fetch('https://tarkovtracker.org/favicon.ico');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'same request');
  assert.equal(response.headers.get('X-Test-Body-Reads'), '0');
  assert.equal(response.headers.get('X-Test-Assets-Read'), 'true');
});
test('compiled normal API paths and other hosts keep their existing protection', async () => {
  for (const url of [
    'https://tarkovtracker.org/api/v20',
    'https://tarkovtracker.org/api/tokenize',
    'https://tarkovtracker.org/api/progression',
    'https://tarkovtracker.org/api/team/progress-report',
    'https://api.tarkovtracker.org/api/v2',
    'https://other.tarkovtracker.org/api/v2',
    'https://preview.pages.dev/api/v2',
  ]) {
    const response = await harness.fetch(url);
    assert.ok([401, 403].includes(response.status), `${url}: ${response.status}`);
    assert.equal(response.headers.get('X-Test-Assets-Read'), 'true');
    assert.notEqual((await response.json()).error, 'legacy_api_retired');
  }
  assert.deepEqual(outbound, []);
});
