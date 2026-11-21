import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createTestHarness } from 'wrangler';
const root = fileURLToPath(new URL('../../', import.meta.url));
const tarkovRoutes = readdirSync(new URL('../../app/server/api/tarkov/', import.meta.url), {
  recursive: true,
})
  .filter((name) => name.endsWith('.get.ts'))
  .map((name) => name.replaceAll('\\', '/').replace('.get.ts', ''));
assert.ok(tarkovRoutes.includes('access-check'), 'Tarkov GET route discovery must not be empty');
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
test('compiled client-log boundary drops oversized bodies before Nitro buffering or bindings', async () => {
  for (const path of [
    '/api/logs/client',
    '/api/logs/client/',
    '/api/logs/%63lient',
    '/api/logs/client%2f',
  ]) {
    const response = await harness.fetch(`https://tarkovtracker.org${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Unread-Body': '1',
        'X-Test-No-Bindings': '1',
      },
      body: JSON.stringify({ args: ['x'.repeat(128 * 1024)] }),
    });
    assert.equal(response.status, 204, path);
    assert.equal(response.headers.get('X-Test-Body-Reads'), '0');
    assert.equal(response.headers.get('X-Test-Binding-Reads'), '0');
    assert.equal(await response.text(), '');
  }
});
test('compiled bounded client logs retain Nitro body handling and ordinary nested diagnostics', async () => {
  const response = await harness.fetch('https://tarkovtracker.org/api/logs/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://tarkovtracker.org' },
    body: JSON.stringify({ level: 'warn', args: [{ retry: { count: 3 } }] }),
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('X-Test-Body-Used'), 'true');
  assert.equal(response.headers.get('X-Test-Assets-Read'), 'true');
  assert.deepEqual(outbound, []);
});
test('compiled client logs handle the widest bounded container array without an argument spread', async () => {
  const body = JSON.stringify({
    level: 'debug',
    args: [Array.from({ length: 43_500 }, () => ({}))],
  });
  assert.ok(Buffer.byteLength(body) <= 128 * 1024);
  const response = await harness.fetch('https://tarkovtracker.org/api/logs/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://tarkovtracker.org' },
    body,
  });
  assert.equal(response.status, 204);
  assert.deepEqual(outbound, []);
});
test('compiled static assets retain the original Request and ASSETS binding', async () => {
  const response = await harness.fetch('https://tarkovtracker.org/favicon.ico');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'same request');
  assert.equal(response.headers.get('X-Test-Body-Reads'), '0');
  assert.equal(response.headers.get('X-Test-Assets-Read'), 'true');
});
test('compiled unknown Tarkov paths return uncacheable JSON instead of the SPA', async () => {
  for (const path of [
    '/api/tarkov',
    '/api/tarkov/',
    '/api/tarkov/missing',
    '/api/tarkov/missing/nested',
    '/api/tarkov/missing/?lang=en',
  ]) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const response = await harness.fetch(`https://tarkovtracker.org${path}`, {
        method,
        headers: { Accept: 'text/html' },
      });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.match(response.headers.get('Content-Type'), /^application\/json/);
      if (method === 'HEAD') assert.equal(await response.text(), '');
      else assert.equal((await response.json()).statusCode, 404);
    }
  }
  assert.deepEqual(outbound, []);
});
test('compiled known Tarkov route takes precedence over the fallback', async () => {
  for (const method of ['GET', 'HEAD', 'GET', 'HEAD']) {
    const response = await harness.fetch('https://tarkovtracker.org/api/tarkov/access-check', {
      method,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /^application\/json/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    else assert.deepEqual(await response.json(), { ok: true });
  }
  assert.deepEqual(outbound, []);
});
async function assertCatalogUnavailable(response, method, label) {
  assert.equal(response.status, 503, label);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type'), /^application\/json/);
  assert.equal(response.headers.has('X-Cache-Status'), false);
  assert.equal(response.headers.get('X-Test-Upstream-Reads'), '0');
  if (method === 'HEAD') assert.equal(await response.text(), '');
  else assert.equal((await response.json()).statusCode, 503);
}
test('compiled catalog GET and HEAD fail closed on cold missing or unavailable KV', async () => {
  for (const fault of ['absent', 'unavailable', 'missing-manifest', 'missing-body']) {
    for (const route of ['tasks-core?gameMode=pve', 'strings?lang=de']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await harness.fetch(`https://tarkovtracker.org/api/tarkov/${route}`, {
          method,
          headers: { 'X-Test-Catalog-Fault': fault, 'X-Test-Clear-Catalog-Cache': '1' },
        });
        await assertCatalogUnavailable(response, method, `${fault} ${method} ${route}`);
      }
    }
  }
  assert.deepEqual(outbound, []);
});
async function assertCatalogObject(scope, entry, manifest) {
  const [dataset, value] = scope.split('/');
  const query = dataset === 'strings' ? `lang=${value}` : `gameMode=${value}`;
  const url = `https://tarkovtracker.org/api/tarkov/${dataset}?${query}`;
  const response = await harness.fetch(url);
  assert.equal(response.status, 200, scope);
  assert.equal(response.headers.get('X-Cache-Status'), 'PRECOMPUTE', scope);
  assert.equal(response.headers.get('X-Catalog-Release'), String(manifest.completedAt), scope);
  assert.equal(response.headers.get('Cache-Control'), 'no-store', scope);
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store', scope);
  assert.equal(response.headers.has('X-Catalog-Key'), false, scope);
  assert.equal(response.headers.get('X-Test-Upstream-Reads'), '0', scope);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.byteLength, entry.bytes, scope);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.key.split('/').at(-1),
    scope
  );
  for (const [name, value] of Object.entries(entry.headers))
    assert.equal(response.headers.get(name), value, `${scope}: ${name}`);
  assert.ok(JSON.parse(bytes.toString('utf8')).data, scope);
}
test('compiled production readers serve all 43 immutable catalog objects with exact bytes and provenance', async () => {
  const response = await harness.fetch('https://tarkovtracker.org/api/tarkov/overlay-status');
  assert.equal(response.status, 200);
  const manifest = await response.json();
  const datasets = [
    'bootstrap',
    'tasks-core',
    'tasks-objectives',
    'tasks-rewards',
    'hideout',
    'items-lite',
    'items',
    'prestige',
    'editions',
    'map-spawns',
  ];
  const modes = ['regular', 'pve', 'pvp-season'];
  const languages = ['cs', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'tr', 'zh'];
  const expected = [
    ...datasets.flatMap((dataset) => modes.map((mode) => `${dataset}/${mode}`)),
    ...languages.map((lang) => `strings/${lang}`),
  ];
  assert.deepEqual(Object.keys(manifest.entries).sort(), expected.sort());
  assert.equal(manifest.overlaySha, 'a'.repeat(64));
  for (const [scope, entry] of Object.entries(manifest.entries))
    await assertCatalogObject(scope, entry, manifest);
  assert.deepEqual(outbound, []);
});
test('compiled language bundle retains mode-specific objective values and stable objective IDs', async () => {
  const strings = await (
    await harness.fetch('https://tarkovtracker.org/api/tarkov/strings?lang=de')
  ).json();
  const descriptions = [];
  for (const mode of ['regular', 'pve']) {
    const payload = await (
      await harness.fetch(
        `https://tarkovtracker.org/api/tarkov/tasks-objectives?gameMode=${mode}&lang=de`
      )
    ).json();
    const objective = payload.data.tasks[0].objectives[0];
    assert.equal(objective.id, 'head-objective');
    assert.ok(objective.description.startsWith(`@tt:${mode}:tasks:`));
    descriptions.push(strings.data.strings[objective.description]);
  }
  assert.deepEqual(descriptions, ['Prestige 1 dogtag', 'Level 20 dogtag']);
  const fallback = await (
    await harness.fetch('https://tarkovtracker.org/api/tarkov/strings?lang=unsupported')
  ).json();
  assert.equal(fallback.data.strings['@tt:pve:tasks:head-objective'], 'pve objective in English');
});
async function waitForLastGoodCatalog(url) {
  const deadline = performance.now() + 3000;
  const headers = { 'X-Test-Catalog-Fault': 'unavailable' };
  let response = await harness.fetch(url, { headers });
  // Only the earlier successful request can populate this cache while KV is unavailable.
  while (response.status === 503 && performance.now() < deadline) {
    await response.body?.cancel();
    await delay(25);
    response = await harness.fetch(url, { headers });
  }
  assert.equal(response.status, 200, 'Expected the background catalog cache write to finish');
  assert.equal(response.headers.get('X-Cache-Status'), 'STALE');
  return response;
}
for (const route of ['strings?lang=de', 'items-lite?gameMode=regular', 'items?gameMode=pve']) {
  test(`compiled warm ${route} sends one gzip encoding without changing its release or bytes`, async () => {
    const url = `https://tarkovtracker.org/api/tarkov/${route}`;
    const identity = await harness.fetch(url, {
      headers: { 'Accept-Encoding': 'identity', 'X-Test-Clear-Catalog-Cache': '1' },
    });
    assert.equal(identity.status, 200);
    const body = await identity.text();
    const release = identity.headers.get('X-Catalog-Release');
    assert.equal(await (await waitForLastGoodCatalog(url)).text(), body);
    const warm = await harness.fetch(url, {
      headers: { 'Accept-Encoding': 'gzip', 'X-Test-Return-Original': '1' },
    });
    assert.equal(warm.status, 200);
    assert.equal(warm.headers.get('MF-Content-Encoding'), 'gzip');
    assert.match(warm.headers.get('Vary') ?? '', /Accept-Encoding/i);
    assert.equal(warm.headers.has('X-Tarkov-Catalog-Precompressed'), false);
    assert.equal(warm.headers.get('Cache-Control'), 'no-store');
    assert.equal(warm.headers.get('X-Catalog-Release'), release);
    assert.equal(warm.headers.get('X-Overlay-Sha256'), identity.headers.get('X-Overlay-Sha256'));
    // Miniflare's fetch client removes exactly the advertised transport encoding.
    assert.equal(await warm.text(), body);
    const rejected = await harness.fetch(url, {
      headers: { 'Accept-Encoding': 'gzip;q=0, identity', 'X-Test-Return-Original': '1' },
    });
    assert.equal(rejected.headers.get('Vary'), warm.headers.get('Vary'));
    assert.notEqual(rejected.headers.get('MF-Content-Encoding'), 'gzip');
    assert.equal(await rejected.text(), body);
  });
}
test('compiled cold catalog HEAD prepares last-good bytes for a later outage GET', async () => {
  const url = 'https://tarkovtracker.org/api/tarkov/items?gameMode=pve';
  const head = await harness.fetch(url, {
    method: 'HEAD',
    headers: { 'X-Test-Clear-Catalog-Cache': '1' },
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const stale = await waitForLastGoodCatalog(url);
  assert.equal((await stale.json()).data.items.length, 1200);
});
test('compiled warm catalog GET and HEAD retain last-good bytes during a KV outage', async () => {
  const url = 'https://tarkovtracker.org/api/tarkov/tasks-objectives?gameMode=pve';
  const fresh = await harness.fetch(url, { headers: { 'X-Test-Clear-Catalog-Cache': '1' } });
  assert.equal(fresh.headers.get('X-Cache-Status'), 'PRECOMPUTE');
  const body = await fresh.text();
  assert.equal(await (await waitForLastGoodCatalog(url)).text(), body);
  for (const method of ['GET', 'HEAD']) {
    const stale = await harness.fetch(url, {
      method,
      headers: { 'X-Test-Catalog-Fault': 'unavailable' },
    });
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('X-Cache-Status'), 'STALE');
    assert.equal(stale.headers.get('X-Catalog-Release'), fresh.headers.get('X-Catalog-Release'));
    assert.equal(stale.headers.get('Cache-Control'), 'no-store');
    assert.equal(stale.headers.get('X-Test-Upstream-Reads'), '0');
    assert.equal(await stale.text(), method === 'HEAD' ? '' : body);
  }
});
for (const route of tarkovRoutes) {
  test(`compiled ${route} HEAD preserves GET metadata without a body`, async () => {
    for (const suffix of ['', '/?gameMode=pve&lang=en']) {
      const url = `https://tarkovtracker.org/api/tarkov/${route}${suffix}`;
      const requestHead = () =>
        harness.fetch(url, { method: 'HEAD', headers: { Accept: 'text/html' } });
      const coldHead = await requestHead();
      const get = await harness.fetch(url, { headers: { Accept: 'text/html' } });
      assert.equal(get.status, 200, `${url}: GET fixture must succeed`);
      assert.match(get.headers.get('Content-Type'), /^application\/json/, url);
      await get.json();
      for (const head of [coldHead, await requestHead()]) {
        assert.equal(head.status, get.status, url);
        for (const header of [
          'Content-Type',
          'Cache-Control',
          'Cloudflare-CDN-Cache-Control',
          'Vary',
          'X-Overlay-Version',
          'X-Overlay-Sha256',
          'X-Cache-Status',
          'X-Catalog-Release',
        ]) {
          assert.equal(head.headers.get(header), get.headers.get(header), `${url}: ${header}`);
        }
        assert.equal(await head.text(), '', url);
      }
    }
    assert.deepEqual(outbound, []);
  });
}
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
