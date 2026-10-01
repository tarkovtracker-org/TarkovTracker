import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../../', import.meta.url));
test('Access exchange failures retain no credentials in real Playwright reports', () => {
  // Keep fixtures under the repo so they resolve the pinned Playwright package.
  const fixture = mkdtempSync(path.join(root, '.preview-access-report-'));
  const report = mkdtempSync(path.join(tmpdir(), 'preview-access-report-'));
  const id = 'synthetic-access-client-unique';
  const secret = 'synthetic-access-secret-unique';
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
      export default { ...config, testDir: '.', outputDir: ${JSON.stringify(path.join(report, 'test-results'))}, testMatch: /exchange.smoke.mjs$/, timeout: 10000 };
    `
    );
    writeFileSync(
      path.join(fixture, 'exchange.smoke.mjs'),
      `
      import { test, expect } from '@playwright/test';
      import https from 'node:https';
      import { readFileSync } from 'node:fs';
      import { previewAccessSession } from '../scripts/preview/smoke/access.mjs';
      for (const stalled of [false, true]) {
        test(stalled ? 'stalled body control' : 'completed body control', async ({ request }) => {
          const server = https.createServer({
            cert: readFileSync(${JSON.stringify(cert)}), key: readFileSync(${JSON.stringify(key)}),
          }, (req, res) => {
            expect(req.headers['cf-access-client-id']).toBe(process.env.PREVIEW_ACCESS_CLIENT_ID);
            expect(req.headers['cf-access-client-secret']).toBe(process.env.PREVIEW_ACCESS_CLIENT_SECRET);
            res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'CF_Authorization=session; Path=/' });
            res.flushHeaders();
            if (!stalled) res.end('ok');
          });
          await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
          try {
            const origin = 'https://localhost:' + server.address().port;
            // This uses the real native transport, including TLS and a body that never completes.
            expect(await previewAccessSession(origin)).toBe('session');
          } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
          }
        });
      }
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
    assert.equal(json.stats.expected, 2);
    assert.equal(json.stats.unexpected, 1);
    assert.match(jsonText, /Preview Access session exchange failed/);
    const html = readFileSync(path.join(report, 'index.html'), 'utf8');
    const zip = html.match(/data:application\/zip;base64,([A-Za-z0-9+/=]+)/);
    assert.ok(zip, 'HTML reporter embeds its test-data ZIP');
    const retained = [
      jsonText,
      html,
      result.stdout,
      result.stderr,
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
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(report, { recursive: true, force: true });
  }
});
