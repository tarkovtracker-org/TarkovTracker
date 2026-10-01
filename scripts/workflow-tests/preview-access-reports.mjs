import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
const root = fileURLToPath(new URL('../../', import.meta.url));
function retainedFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? retainedFiles(file) : [readFileSync(file).toString()];
  });
}
test('Access exchange and API failures retain no credentials in real Playwright reports', () => {
  // Keep fixtures under the repo so they resolve the pinned Playwright package.
  const fixture = mkdtempSync(path.join(root, '.preview-access-report-'));
  const report = mkdtempSync(path.join(tmpdir(), 'preview-access-report-'));
  // CI reporters embed the PR diff. Runtime values distinguish transport leaks from source text.
  const id = `synthetic-access-client-${randomUUID()}`;
  const secret = `synthetic-access-secret-${randomUUID()}`;
  const session = `synthetic-access-session-${randomUUID()}`;
  try {
    const cert = path.join(fixture, 'cert.pem');
    const key = path.join(fixture, 'key.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
      ],
      { stdio: 'ignore' }
    );
    writeFileSync(
      path.join(fixture, 'playwright.config.mjs'),
      `
      import config from '../scripts/preview/smoke/playwright.config.mjs';
      export default { ...config, captureGitInfo: { diff: true }, testDir: '.', outputDir: ${JSON.stringify(path.join(report, 'test-results'))}, testMatch: /exchange.smoke.mjs$/, timeout: 10000 };
    `
    );
    writeFileSync(
      path.join(fixture, 'exchange.smoke.mjs'),
      `
      import { test, expect } from '@playwright/test';
      import https from 'node:https';
      import { readFileSync } from 'node:fs';
      import net from 'node:net';
      import { previewAccessSession, previewGet } from '../scripts/preview/smoke/access.mjs';
      const cookie = 'CF_Authorization=' + process.env.SYNTHETIC_ACCESS_SESSION;
      async function prime(origin) {
        await previewAccessSession(origin, process.env, async () => ({
          status: 200, headers: { getSetCookie: () => [cookie + '; Path=/'] },
        }));
      }
      async function localApi(callback) {
        const server = https.createServer({
          cert: readFileSync(${JSON.stringify(cert)}), key: readFileSync(${JSON.stringify(key)}),
        }, (req, res) => {
          expect(req.headers.cookie).toBe(cookie);
          expect(req.headers['cf-access-client-id']).toBeUndefined();
          expect(req.headers['cf-access-client-secret']).toBeUndefined();
          if (req.url === '/redirect') {
            res.writeHead(302, { location: 'https://localhost:1/untrusted' });
            res.end();
          } else if (req.url === '/stalled') {
            res.writeHead(200); res.flushHeaders();
          } else if (req.url === '/invalid') {
            res.end(cookie);
          } else {
            res.setHeader('content-type', 'application/json');
            res.end('{"data":{"lastPurgeAt":null}}');
          }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'https://localhost:' + server.address().port;
        try {
          await prime(origin);
          await callback(origin);
        } finally {
          server.closeAllConnections();
          await new Promise(resolve => server.close(resolve));
        }
      }
      for (const stalled of [false, true]) {
        test(stalled ? 'stalled body control' : 'completed body control', async ({ request }) => {
          const server = https.createServer({
            cert: readFileSync(${JSON.stringify(cert)}), key: readFileSync(${JSON.stringify(key)}),
          }, (req, res) => {
            expect(req.headers['cf-access-client-id']).toBe(process.env.PREVIEW_ACCESS_CLIENT_ID);
            expect(req.headers['cf-access-client-secret']).toBe(process.env.PREVIEW_ACCESS_CLIENT_SECRET);
            res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': cookie + '; Path=/' });
            res.flushHeaders();
            if (!stalled) res.end('ok');
          });
          await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
          try {
            const origin = 'https://localhost:' + server.address().port;
            // This uses the real native transport, including TLS and a body that never completes.
            expect(await previewAccessSession(origin)).toBe(process.env.SYNTHETIC_ACCESS_SESSION);
          } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
          }
        });
      }
      test('authenticated JSON, redirects and disposal control', async ({ request }) => {
        await localApi(async origin => {
          const response = await previewGet(request, origin + '/json', origin);
          expect(response.status()).toBe(200);
          expect(await response.json()).toEqual({data:{lastPurgeAt:null}});
          await response.dispose();
          await expect(response.json()).rejects.toThrow('Preview response JSON is unavailable or invalid.');
          const redirect = await previewGet(request, origin + '/redirect', origin);
          expect(redirect.status()).toBe(302);
          await redirect.dispose();
        });
      });
      test('disposal diagnostics are discarded', async ({ request }) => {
        const origin = 'https://disposal.invalid';
        await prime(origin);
        const response = await previewGet(request, origin, origin, async () => ({
          status:200, text:async () => '{}',
          body:{cancel:async () => {throw new Error(cookie, {cause:new Error(process.env.PREVIEW_ACCESS_CLIENT_SECRET)});}},
        }));
        expect(await response.json()).toEqual({});
        await response.dispose();
      });
      test('refused authenticated connection is sanitized', async ({ request }) => {
        const server = net.createServer();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'https://localhost:' + server.address().port;
        await new Promise(resolve => server.close(resolve));
        await prime(origin);
        try {
          await previewGet(request, origin + '/manifest.json', origin);
        } catch (error) {
          await test.info().attach('transport-error', {body:Buffer.from(error.message),contentType:'text/plain'});
          throw error;
        }
      });
      test('stalled authenticated body is sanitized', async ({ request }) => {
        await localApi(origin => previewGet(request, origin + '/stalled', origin, fetch, 100));
      });
      test('invalid response JSON is sanitized', async ({ request }) => {
        await localApi(async origin => {
          const response = await previewGet(request, origin + '/invalid', origin);
          await response.json();
        });
      });
      test('transport diagnostic is sanitized', async ({ request }) => {
        await previewAccessSession('https://failure.example', process.env, async () => {
          throw new Error('request headers: ' + process.env.PREVIEW_ACCESS_CLIENT_ID + ' ' +
            process.env.PREVIEW_ACCESS_CLIENT_SECRET, { cause: new Error(process.env.PREVIEW_ACCESS_CLIENT_SECRET) });
        });
      });
    `
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        path.join(fixture, 'playwright.config.mjs'),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PREVIEW_ACCESS_CLIENT_ID: id,
          PREVIEW_ACCESS_CLIENT_SECRET: secret,
          SYNTHETIC_ACCESS_SESSION: session,
          NODE_EXTRA_CA_CERTS: cert,
          SMOKE_REPORT_DIR: report,
        },
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    assert.equal(result.status, 1, result.error?.message ?? result.stdout + result.stderr);
    const jsonText = readFileSync(path.join(report, 'results.json'), 'utf8');
    const json = JSON.parse(jsonText);
    assert.equal(json.stats.expected, 4);
    assert.equal(json.stats.unexpected, 4);
    assert.match(jsonText, /Preview Access session exchange failed/);
    assert.match(jsonText, /Authenticated preview request failed/);
    assert.match(jsonText, /Preview response JSON is unavailable or invalid/);
    const html = readFileSync(path.join(report, 'index.html'), 'utf8');
    const zip = html.match(/data:application\/zip;base64,([A-Za-z0-9+/=]+)/);
    assert.ok(zip, 'HTML reporter embeds its test-data ZIP');
    const retained = [
      jsonText,
      html,
      result.stdout,
      result.stderr,
      ...retainedFiles(report),
      ...Object.values(unzipSync(Buffer.from(zip[1], 'base64'))).map((bytes) =>
        Buffer.from(bytes).toString()
      ),
    ];
    for (const content of retained) {
      assert.equal(content.includes(id), false, 'client ID leaked into retained diagnostics');
      assert.equal(
        content.includes(secret),
        false,
        'client secret leaked into retained diagnostics'
      );
      assert.equal(
        content.includes(session),
        false,
        'session cookie leaked into retained diagnostics'
      );
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(report, { recursive: true, force: true });
  }
});
