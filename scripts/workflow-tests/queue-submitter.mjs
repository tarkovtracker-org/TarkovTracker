import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { queueSubmitterConfig, queueSubmitterToken } from '../ci/queue-submitter.mjs';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const repo = { owner: 'example', repo: 'repo' };
const env = { QUEUE_SUBMITTER_APP_ID: '42', QUEUE_SUBMITTER_PRIVATE_KEY: pem };
const installation = {
  id: 9,
  app_id: 42,
  repository_selection: 'selected',
  suspended_at: null,
  account: { login: 'Example' },
};
const token = {
  token: 'ghs_fixture',
  repository_selection: 'selected',
  repositories: [{ full_name: 'example/repo' }],
  permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
};
function fixture(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const [header, payload, signature] = init.headers.Authorization.slice(7).split('.');
    const signed = Buffer.from(`${header}.${payload}`);
    assert.ok(verify('RSA-SHA256', signed, publicKey, Buffer.from(signature, 'base64url')));
    assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).iss, '42');
    const data = url.endsWith('/installation')
      ? { ...installation, ...overrides.installation }
      : { ...token, ...overrides.token };
    return { ok: overrides.status === undefined, status: overrides.status, json: async () => data };
  };
  return { calls, run: () => queueSubmitterToken({ repo, env, fetchImpl }) };
}
test('unconfigured submitter keeps the inherited credential unless automation requires the App', () => {
  assert.equal(queueSubmitterConfig({}), null);
  assert.throws(
    () => queueSubmitterConfig({ QUEUE_SUBMITTER_REQUIRED: 'true' }),
    /Queue submitter App is required/
  );
});
test('partial or malformed configuration fails closed', () => {
  for (const partial of [
    { QUEUE_SUBMITTER_APP_ID: '42' },
    { QUEUE_SUBMITTER_PRIVATE_KEY: pem },
    { QUEUE_SUBMITTER_APP_ID: '0', QUEUE_SUBMITTER_PRIVATE_KEY: pem },
    { QUEUE_SUBMITTER_APP_ID: 'x42', QUEUE_SUBMITTER_PRIVATE_KEY: pem },
  ])
    assert.throws(() => queueSubmitterConfig(partial), /incomplete or invalid/);
});
test('invalid private key material is rejected before any API request', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    throw new Error('unexpected request');
  };
  for (const key of [
    'not a pem',
    generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
  ])
    await assert.rejects(
      queueSubmitterToken({ repo, env: { ...env, QUEUE_SUBMITTER_PRIVATE_KEY: key }, fetchImpl }),
      /private key is invalid|requires an RSA key/
    );
  assert.equal(requests, 0);
});
test('mints a single-repository contents/pull-requests token from the verified installation', async () => {
  const f = fixture();
  assert.equal(await f.run(), 'ghs_fixture');
  assert.deepEqual(
    f.calls.map(({ method, url }) => `${method} ${url}`),
    [
      'GET https://api.github.com/repos/example/repo/installation',
      'POST https://api.github.com/app/installations/9/access_tokens',
    ]
  );
  assert.deepEqual(f.calls[1].body, {
    repositories: ['repo'],
    permissions: { contents: 'write', pull_requests: 'write' },
  });
});
test('rejects foreign, all-repository or suspended installations', async () => {
  for (const change of [
    { app_id: 43 },
    { repository_selection: 'all' },
    { suspended_at: '2026-10-29T00:00:00Z' },
    { account: { login: 'other' } },
  ])
    await assert.rejects(fixture({ installation: change }).run(), /installation identity/);
});
test('rejects tokens with the wrong repository scope or permissions', async () => {
  for (const change of [
    { repository_selection: 'all' },
    { repositories: [{ full_name: 'other/repo' }] },
    { repositories: [] },
    { permissions: { contents: 'write' } },
    { permissions: { contents: 'write', pull_requests: 'write', actions: 'write' } },
    { permissions: { contents: 'read', pull_requests: 'write' } },
    { token: '' },
  ])
    await assert.rejects(fixture({ token: change }).run(), /token scope is invalid/);
});
test('API failures do not echo credentials', async () => {
  const error = await fixture({ status: 401 })
    .run()
    .catch((caught) => caught);
  assert.match(error.message, /returned 401/);
  assert.ok(!error.message.includes('BEGIN PRIVATE KEY'));
});
