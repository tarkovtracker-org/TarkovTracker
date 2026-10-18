// Run locally with a public JSON fixture: node scripts/checks/precomputed-response-benchmark.mjs /path/payload.json
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const workerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = workerRequire('miniflare');
const { build } = workerRequire('esbuild');
const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'precomputed-response-profile-'));
let mf;
let socket;
try {
  const outfile = join(scratch, 'worker.mjs');
  const fixture = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'));
  const source = JSON.stringify({
    payload: fixture,
    overlay: { version: fixture.dataOverlay.version, sha256: fixture.dataOverlay.sha256 },
    storedAt: Date.now(),
    version: 2,
  });
  await build({
    entryPoints: [join(root, 'scripts/checks/precomputed-response-worker.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    alias: { '@': join(root, 'app') },
    tsconfigRaw: { compilerOptions: { target: 'ES2022' } },
  });
  mf = new Miniflare({
    workers: [
      {
        config: {
          name: 'precomputed-response-profile',
          compatibilityDate: '2026-01-09',
          manifest: {
            mainModule: 'worker.mjs',
            modules: { 'worker.mjs': { type: 'esm', contents: await readFile(outfile, 'utf8') } },
          },
          env: { SNAPSHOTS: { type: 'kv', id: 'local-snapshot-profile' } },
        },
      },
    ],
    inspectorPort: 0,
    telemetry: { enabled: false },
  });
  const kv = await mf.getKVNamespace('SNAPSHOTS', 'precomputed-response-profile');
  await kv.put('snapshot', source);
  const inspector = await mf.getInspectorURL();
  const discovery = new URL(inspector);
  discovery.protocol = 'http:';
  discovery.pathname = '/json';
  const targets = await (await fetch(discovery)).json();
  const target =
    targets.find((item) => item.title?.includes('precomputed-response-profile')) ?? targets[0];
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const value = JSON.parse(String(event.data));
    const waiter = pending.get(value.id);
    if (!waiter) return;
    pending.delete(value.id);
    if (value.error) waiter.reject(new Error(JSON.stringify(value.error)));
    else waiter.resolve(value.result);
  });
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await command('Profiler.enable');
  await command('Profiler.setSamplingInterval', { interval: 100 });
  const results = [];
  let expected;
  for (const mode of ['baseline', 'warm']) {
    const response = await mf.dispatchFetch(`https://local/${mode}?iterations=3`);
    assert.equal(response.status, 200);
    const result = await response.json();
    expected ??= result;
    assert.equal(result.sha256, expected.sha256);
  }
  for (const [input, count] of [
    ['', 1],
    ['%20', 1],
    ['0', 0],
    ['-2', 0],
    ['2.9', 2],
    ['NaN', 1],
    ['1000', 30],
  ]) {
    const result = await (await mf.dispatchFetch(`https://local/warm?iterations=${input}`)).json();
    assert.equal(result.iterations, count);
  }
  const before = await (await mf.dispatchFetch('https://local/warm?iterations=1')).json();
  assert.equal(typeof before.validations, 'number');
  assert.ok(before.validations > 0);
  let after = before;
  for (let i = 0; i < 20; i++) {
    after = await (await mf.dispatchFetch('https://local/warm?iterations=1')).json();
    assert.equal(after.sha256, before.sha256);
  }
  assert.equal(
    after.validations,
    before.validations,
    'native KV binding identity must support reuse across fetch invocations'
  );
  const crossDispatch = {
    requests: 20,
    validationsBefore: before.validations,
    validationsAfter: after.validations,
    identicalBodies: true,
  };
  for (let round = 0; round < 3; round++) {
    for (const mode of round % 2 ? ['warm', 'baseline', 'cold'] : ['baseline', 'warm', 'cold']) {
      await command('Profiler.start');
      const started = performance.now();
      const response = await mf.dispatchFetch(`https://local/${mode}?iterations=20`);
      assert.equal(response.status, 200);
      const result = await response.json();
      const elapsedMs = performance.now() - started;
      const { profile } = await command('Profiler.stop');
      assert.equal(result.sha256, expected.sha256);
      assert.equal(result.bytes, expected.bytes);
      const idle = new Set(
        profile.nodes
          .filter((node) => node.callFrame.functionName === '(idle)')
          .map((node) => node.id)
      );
      const activeUs = profile.samples.reduce(
        (total, id, i) => total + (idle.has(id) ? 0 : profile.timeDeltas[i]),
        0
      );
      results.push({
        round,
        mode,
        iterations: 20,
        sampledActiveV8MsPerOp: activeUs / 1000 / 20,
        elapsedMsPerOp: elapsedMs / 20,
        samples: profile.samples.length,
      });
    }
  }
  const median = (mode, field) => {
    const values = results
      .filter((r) => r.mode === mode)
      .map((r) => r[field])
      .sort((a, b) => a - b);
    return values[1];
  };
  console.log(
    JSON.stringify(
      {
        runtime: 'local workerd via installed Miniflare',
        crossDispatch,
        fixtureBytes: Buffer.byteLength(source),
        bytes: expected.bytes,
        sha256: expected.sha256,
        results,
        medians: Object.fromEntries(
          ['baseline', 'warm', 'cold'].map((mode) => [
            mode,
            {
              sampledActiveV8MsPerOp: median(mode, 'sampledActiveV8MsPerOp'),
              elapsedMsPerOp: median(mode, 'elapsedMsPerOp'),
            },
          ])
        ),
        limitation:
          'Actual production helper, actual local KV binding and workerd. V8 sampling excludes idle samples; elapsed includes local KV/IPC. Neither is billed production CPU or an account-wide savings estimate.',
      },
      null,
      2
    )
  );
} finally {
  try {
    socket?.close();
    await mf?.dispose();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
