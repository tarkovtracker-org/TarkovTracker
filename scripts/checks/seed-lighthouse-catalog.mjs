import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
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
  return { key: entry.key, value: gzipSync(body).toString('base64'), base64: true };
}
const output = process.argv[2];
if (!output) throw new Error('Specify an output file for the local Wrangler KV data.');
const manifest = await (await get('overlay-status')).json();
const entries = Object.entries(manifest.entries);
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
pairs.push({ key: manifestKey, value: JSON.stringify(manifest) });
await writeFile(output, JSON.stringify(pairs));
console.log(`Prepared ${entries.length} Lighthouse catalogs from release ${manifest.completedAt}.`);
