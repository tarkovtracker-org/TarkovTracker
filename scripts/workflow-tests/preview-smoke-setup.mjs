import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import setupPreviewSmoke from '../preview/smoke/setup.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
function runPlaywright(config, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        config,
        '--global-timeout',
        '15000',
      ],
      { cwd: root, env }
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
}
function readinessBarrier() {
  const state = { ready: false, probes: 0, pending: [] };
  const serve = (request, response) => {
    if (request.url === '/') {
      state.ready = true;
      state.probes += 1;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('ready');
      return;
    }
    if (!state.ready) {
      response.writeHead(409);
      response.end('smoke started before readiness');
      return;
    }
    state.pending.push(response);
    if (state.pending.length === 2)
      state.pending.forEach((pending) => pending.end('both workers reached the barrier'));
  };
  return { state, serve };
}
test('shared readiness completes before two smoke files overlap', { timeout: 30000 }, async () => {
  const fixture = mkdtempSync(path.join(root, '.preview-smoke-setup-'));
  const report = mkdtempSync(path.join(tmpdir(), 'preview-smoke-setup-'));
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
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' }
  );
  const barrier = readinessBarrier();
  const server = https.createServer(
    { cert: readFileSync(cert), key: readFileSync(key) },
    barrier.serve
  );
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `https://127.0.0.1:${server.address().port}`;
    const productionConfig = pathToFileURL(
      path.join(root, 'scripts/preview/smoke/playwright.config.mjs')
    ).href;
    const config = path.join(fixture, 'playwright.config.mjs');
    writeFileSync(
      config,
      `import config from ${JSON.stringify(productionConfig)};
      export default { ...config, testDir: '.', testMatch: /probe\\.smoke\\.mjs$/, timeout: 5000,
        outputDir: ${JSON.stringify(path.join(report, 'test-results'))},
        reporter: [['json', {outputFile: ${JSON.stringify(path.join(report, 'results.json'))}}]] };`
    );
    for (const name of ['first', 'second']) {
      writeFileSync(
        path.join(fixture, `${name}.probe.smoke.mjs`),
        `import {test, expect} from '@playwright/test';
        test('${name} overlaps the other file after readiness', async ({request}) => {
          const response = await request.get(${JSON.stringify(`${origin}/${name}`)});
          expect(response.status()).toBe(200);
          expect(await response.text()).toBe('both workers reached the barrier');
        });`
      );
    }
    const result = await runPlaywright(config, {
      ...process.env,
      PREVIEW_URL: origin,
      PREVIEW_ACCESS_CLIENT_ID: '',
      PREVIEW_ACCESS_CLIENT_SECRET: '',
      NODE_EXTRA_CA_CERTS: cert,
    });
    assert.equal(result.code, 0, result.output);
    const data = JSON.parse(readFileSync(path.join(report, 'results.json'), 'utf8'));
    assert.equal(data.stats.expected, 2);
    assert.equal(data.stats.unexpected, 0);
    assert.equal(barrier.state.probes, 1, 'one shared readiness probe before either test');
    assert.equal(barrier.state.pending.length, 2, 'both files ran concurrently');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(fixture, { recursive: true, force: true });
    rmSync(report, { recursive: true, force: true });
  }
});
test('shared readiness rejects missing and insecure preview targets', async () => {
  const original = process.env.PREVIEW_URL;
  try {
    process.env.PREVIEW_URL = '';
    await assert.rejects(setupPreviewSmoke(), /PREVIEW_URL is required/);
    process.env.PREVIEW_URL = 'http://127.0.0.1';
    await assert.rejects(setupPreviewSmoke(), /Preview URL must be HTTPS/);
  } finally {
    if (original === undefined) delete process.env.PREVIEW_URL;
    else process.env.PREVIEW_URL = original;
  }
});
