import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cacheImage, publishScanCatalog, writeScanAsset } from '@@/scripts/stash-scan/build-assets';
import { addGridImage, readReferenceGrid } from '@@/scripts/stash-scan/references';
import { FEATURE_VERSION } from '@/utils/stashScan/core/features';
import { createIconIndex, type IconIndex } from '@/utils/stashScan/core/matcher';
import { encodeScanShard } from '@/utils/stashScan/indexCodec';
import {
  SCAN_LIMITS,
  type ScanCatalog,
  type ScanItem,
  type ScanShard,
} from '@/utils/stashScan/types';
// Offline only: never shipped into the worker or run on an application request.
const output = join(process.cwd(), 'public', 'stash-scan');
const cache = join(process.cwd(), 'node_modules', '.cache', 'stash-scan-images');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const readCached = (file: string) => readFile(file).catch(() => undefined);
interface CatalogSource {
  id: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
  stackMaxSize?: number;
  gridImageLink?: string;
}
interface CatalogEntry extends ScanItem {
  url: string;
}
async function request(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20_000),
    redirect: 'error',
  });
  if (!response.ok && response.status !== 304)
    throw new Error(`Catalog request failed (${response.status}): ${url}`);
  return response;
}
function entry(item: CatalogSource, names: Record<string, string>): CatalogEntry {
  return {
    id: item.id,
    name: names[item.name] ?? item.name,
    shortName: names[item.shortName] ?? item.shortName,
    width: item.width,
    height: item.height,
    maxStack: item.stackMaxSize ?? 0,
    url: item.gridImageLink!,
  };
}
function eligibleSource(item: CatalogSource): boolean {
  const dimensions = [item.width, item.height];
  return (
    /^[a-f0-9]{24}$/.test(item.id) &&
    Boolean(item.gridImageLink) &&
    dimensions.every((n) => Number.isInteger(n) && n >= 1 && n <= 10)
  );
}
async function catalog(): Promise<CatalogEntry[]> {
  const [base, english] = await Promise.all([
    request('https://json.tarkov.dev/regular/items'),
    request('https://json.tarkov.dev/regular/items_en'),
  ]);
  const items = (await base.json()) as { data: { items: Record<string, CatalogSource> } };
  const names = (await english.json()) as { data: Record<string, string> };
  return Object.values(items.data.items)
    .filter(eligibleSource)
    .map((item) => entry(item, names.data))
    .sort((a, b) => a.id.localeCompare(b.id));
}
function imageUrl(item: CatalogEntry): URL {
  const url = new URL(item.url);
  if (url.protocol !== 'https:' || url.hostname !== 'assets.tarkov.dev')
    throw new Error(`Untrusted grid image: ${item.id}`);
  return url;
}
async function imageBytes(item: CatalogEntry): Promise<Uint8Array> {
  const url = imageUrl(item);
  const file = join(cache, `${item.id}.webp`);
  const [bytes, etag] = await Promise.all([readCached(file), readCached(`${file}.etag`)]);
  const headers: Record<string, string> = etag ? { 'If-None-Match': etag.toString() } : {};
  const response = await request(url.href, bytes ? headers : {});
  if (response.status === 304) return bytes!;
  return cacheImage(response, file);
}
async function addItem(index: IconIndex, item: CatalogEntry): Promise<boolean> {
  const upstream = await addGridImage(index, item, await imageBytes(item));
  const reference = await readReferenceGrid(item.id);
  return reference ? (await addGridImage(index, item, reference)) || upstream : upstream;
}
async function buildTemplates(entries: CatalogEntry[]) {
  const index = createIconIndex();
  const missing: string[] = [];
  let next = 0;
  const run = async () => {
    while (next < entries.length) {
      const item = entries[next++]!;
      if (!(await addItem(index, item))) missing.push(item.id);
    }
  };
  await Promise.all(Array.from({ length: 8 }, run));
  return { index, missing: missing.sort() };
}
async function writeShards(index: IconIndex): Promise<Record<string, ScanShard>> {
  const shards: Record<string, ScanShard> = {};
  for (const [size, templates] of [...index.bySize].sort(([a], [b]) => a.localeCompare(b))) {
    templates.sort(
      (a, b) => a.itemId.localeCompare(b.itemId) || Number(a.rotated) - Number(b.rotated)
    );
    const [width, height] = size.split('x').map(Number);
    const raw = encodeScanShard(width!, height!, templates);
    const bytes = gzipSync(raw, { level: 9 });
    if (raw.length > SCAN_LIMITS.decodedShardBytes || bytes.length > SCAN_LIMITS.shardBytes)
      throw new Error(`Shard budget exceeded: ${size}`);
    const hash = sha256(bytes);
    const file = `${size}-${hash}.bin`;
    await writeScanAsset(output, file, bytes);
    shards[size] = { file, sha256: hash, bytes: bytes.length, decodedBytes: raw.length };
  }
  return shards;
}
async function main() {
  await Promise.all([mkdir(output, { recursive: true }), mkdir(cache, { recursive: true })]);
  const entries = await catalog();
  console.log(`Building local-recognition templates for ${entries.length} items…`);
  const { index, missing } = await buildTemplates(entries);
  const shards = await writeShards(index);
  const items = entries.map(({ url: _url, ...item }) => item);
  const manifest: ScanCatalog = {
    version: 1,
    featureVersion: FEATURE_VERSION,
    builtAt: new Date().toISOString(),
    items,
    missing,
    shards,
  };
  // Publish the manifest last: failed builds never replace the previous complete manifest.
  await publishScanCatalog(output, manifest);
  console.log(
    JSON.stringify({
      items: items.length,
      templates: index.size,
      missing: missing.length,
      compressedBytes: Object.values(shards).reduce((sum, shard) => sum + shard.bytes, 0),
    })
  );
}
await main();
