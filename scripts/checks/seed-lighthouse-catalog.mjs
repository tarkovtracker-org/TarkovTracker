import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { getPlatformProxy } from 'wrangler';
const api = 'https://tarkovtracker.org/api/tarkov/';
const manifestKey = 'neutral-catalog-v1-manifest';
async function get(path) {
  const response = await fetch(new URL(path, api), {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Lighthouse catalog ${path} returned HTTP ${response.status}`);
  return response;
}
async function snapshot(scope, entry, release) {
  const parts = /^([a-z-]+)\/([a-z-]+)$/.exec(scope);
  if (!parts) throw new Error(`Invalid Lighthouse catalog scope: ${scope}`);
  const [, dataset, value] = parts;
  const param = dataset === 'strings' ? 'lang' : 'gameMode';
  const response = await get(`${dataset}?${param}=${value}`);
  const body = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(body).digest('hex');
  const matchesRelease = [
    response.headers.get('X-Cache-Status') === 'PRECOMPUTE',
    response.headers.get('X-Catalog-Release') === String(release),
    entry.key === `neutral-catalog-v1/${scope}/${digest}`,
    entry.bytes === body.length,
  ].every(Boolean);
  if (!matchesRelease) {
    throw new Error(`Lighthouse catalog ${scope} did not match release ${release}`);
  }
  return { key: entry.key, value: Uint8Array.from(gzipSync(body)).buffer };
}
const statePath = process.argv[2];
if (!statePath) throw new Error('Specify a persistence directory for the local Wrangler KV store.');
const manifest = await (await get('overlay-status')).json();
const entries = Object.entries(manifest?.entries ?? {});
if (!entries.length || !Number.isSafeInteger(manifest.completedAt) || manifest.completedAt <= 0) {
  throw new Error('Lighthouse requires an active catalog release.');
}
const pairs = [];
for (let start = 0; start < entries.length; start += 6) {
  const batch = entries.slice(start, start + 6);
  pairs.push(
    ...(await Promise.all(
      batch.map(([scope, entry]) => snapshot(scope, entry, manifest.completedAt))
    ))
  );
}
const { env, dispose } = await getPlatformProxy({
  configPath: 'wrangler.toml',
  persist: { path: join(statePath, 'v3') },
  remoteBindings: false,
});
try {
  for (const { key, value } of pairs) await env.TARKOV_DATA.put(key, value);
  await env.TARKOV_DATA.put(manifestKey, JSON.stringify(manifest));
} finally {
  await dispose();
}
console.log(`Seeded ${entries.length} Lighthouse catalogs from release ${manifest.completedAt}.`);
