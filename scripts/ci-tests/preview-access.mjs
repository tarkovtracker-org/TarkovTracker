import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertPreviewTarget,
  previewAccessCookieHeaders,
  previewAccessHeaders,
  previewAccessSession,
  previewGet,
  protectPreviewBrowser,
  readAccessSessionCookie,
} from '../preview/smoke/access.mjs';
import { waitForDeployment } from '../preview/smoke/readiness.mjs';
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
const withAccessEnv = async (callback) => {
  const oldId = process.env.PREVIEW_ACCESS_CLIENT_ID;
  const oldSecret = process.env.PREVIEW_ACCESS_CLIENT_SECRET;
  process.env.PREVIEW_ACCESS_CLIENT_ID = 'id';
  process.env.PREVIEW_ACCESS_CLIENT_SECRET = 'secret';
  try {
    await callback();
  } finally {
    if (oldId === undefined) delete process.env.PREVIEW_ACCESS_CLIENT_ID;
    else process.env.PREVIEW_ACCESS_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.PREVIEW_ACCESS_CLIENT_SECRET;
    else process.env.PREVIEW_ACCESS_CLIENT_SECRET = oldSecret;
  }
};
const fakeRequest = (setCookie, status = 200) => {
  const calls = [];
  return {
    calls,
    get: async (url, options) => {
      calls.push({ url, options });
      return {
        status: () => status,
        headersArray: () => (setCookie ? [{ name: 'Set-Cookie', value: setCookie }] : []),
      };
    },
  };
};
test('reads only the Access session cookie', () => {
  assert.equal(
    readAccessSessionCookie([
      { name: 'set-cookie', value: 'other=1' },
      { name: 'Set-Cookie', value: 'CF_Authorization=jwt; Path=/; Secure; HttpOnly' },
    ]),
    'jwt'
  );
  assert.equal(readAccessSessionCookie([]), '');
});
test('skips the exchange without Access credentials', async () => {
  const request = fakeRequest('');
  await protectPreviewBrowser({}, request, 'https://none.example');
  const response = await previewGet(
    request,
    'https://none.example/manifest.json',
    'https://none.example'
  );
  assert.equal(request.calls.length, 1);
  assert.deepEqual(response.headersArray(), []);
  assert.deepEqual(request.calls[0].options.headers, {});
});
test('exchanges the service token once and sends only the session afterwards', async () => {
  await withAccessEnv(async () => {
    const origin = 'https://preview.example';
    const request = fakeRequest('CF_Authorization=jwt; Path=/');
    const cookies = [];
    const page = { context: () => ({ addCookies: async (list) => cookies.push(...list) }) };
    await protectPreviewBrowser(page, request, origin);
    await previewGet(request, `${origin}/api/tarkov/bootstrap`, origin);
    assert.equal(request.calls.length, 2);
    assert.deepEqual(request.calls[0].options, {
      headers: { 'CF-Access-Client-Id': 'id', 'CF-Access-Client-Secret': 'secret' },
      maxRedirects: 0,
    });
    assert.deepEqual(request.calls[1].options, {
      headers: { cookie: 'CF_Authorization=jwt' },
      maxRedirects: 0,
    });
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].domain, 'preview.example');
    assert.equal(cookies[0].secure, true);
    assert.equal(JSON.stringify(cookies).includes('secret'), false);
  });
});
test('fails when Access issues no session for the service token', async () => {
  await withAccessEnv(async () => {
    await assert.rejects(
      previewAccessSession(fakeRequest(''), 'https://nosession.example'),
      /did not issue a preview session/
    );
  });
});
test('runner polls exchange the service token once and then send only the session', async () => {
  await withAccessEnv(async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return {
        status: 200,
        headers: { getSetCookie: () => ['CF_Authorization=poll-jwt; Path=/; Secure'] },
      };
    };
    const origin = 'https://poll.example';
    assert.deepEqual(await previewAccessCookieHeaders(origin, fetchImpl), {
      cookie: 'CF_Authorization=poll-jwt',
    });
    assert.deepEqual(await previewAccessCookieHeaders(origin, fetchImpl), {
      cookie: 'CF_Authorization=poll-jwt',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(calls[0].options.headers['CF-Access-Client-Secret'], 'secret');
    await assert.rejects(
      previewAccessCookieHeaders('https://nopoll.example', async () => ({
        status: 200,
        headers: {},
      })),
      /did not issue a preview session/
    );
  });
  assert.deepEqual(
    await previewAccessCookieHeaders('https://anon.example', async () => {
      throw new Error('unused');
    }),
    {}
  );
});
test('rejects a session cookie attached to a denied Access response', async () => {
  await withAccessEnv(async () => {
    await assert.rejects(
      previewAccessSession(
        fakeRequest('CF_Authorization=denied; Path=/', 401),
        'https://denied.example'
      ),
      /did not issue a preview session .*401/
    );
  });
});
test('evicts a failed exchange so the next attempt retries it', async () => {
  await withAccessEnv(async () => {
    let attempt = 0;
    const fetchImpl = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network down');
      return { status: 200, headers: { getSetCookie: () => ['CF_Authorization=later; Path=/'] } };
    };
    const origin = 'https://flaky.example';
    await assert.rejects(previewAccessCookieHeaders(origin, fetchImpl), /network down/);
    assert.deepEqual(await previewAccessCookieHeaders(origin, fetchImpl), {
      cookie: 'CF_Authorization=later',
    });
    assert.equal(attempt, 2);
  });
});
test('readiness retries a transient Access exchange within its window', async () => {
  await withAccessEnv(async () => {
    const calls = [];
    const fetchImpl = async (_url, options) => {
      calls.push(options.headers);
      if (calls.length === 1) throw new Error('exchange blip');
      if (options.headers['CF-Access-Client-Secret']) {
        return { status: 200, headers: { getSetCookie: () => ['CF_Authorization=ready; Path=/'] } };
      }
      return { status: 200, headers: { get: () => 'text/html' } };
    };
    let clock = 0;
    const attempts = await waitForDeployment('https://ready.example', {
      fetchImpl,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    assert.equal(attempts, 2);
    assert.deepEqual(calls.at(-1), { cookie: 'CF_Authorization=ready' });
  });
});
