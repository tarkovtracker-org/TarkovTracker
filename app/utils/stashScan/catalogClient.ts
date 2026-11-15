import { FEATURE_VERSION } from '@/utils/stashScan/core/features';
import { createIconIndex, type IconIndex } from '@/utils/stashScan/core/matcher';
import { decodeScanShard } from '@/utils/stashScan/indexCodec';
import {
  SCAN_LIMITS,
  scanError,
  type ScanCatalog,
  type ScanItem,
  type ScanShard,
} from '@/utils/stashScan/types';
export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function readBounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > limit) throw scanError('catalog_invalid');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  return joinChunks(chunks, length);
}
function joinChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function readAsset(path: string, limit: number, cache: RequestCache): Promise<Uint8Array> {
  const response = await fetch(`/stash-scan/${path}`, {
    cache,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) throw scanError('catalog_unavailable');
  return readBounded(response.body, limit);
}
function validItem(item: ScanItem): boolean {
  return (
    /^[a-f0-9]{24}$/.test(item.id) &&
    typeof item.name === 'string' &&
    typeof item.shortName === 'string'
  );
}
function validateItems(items: ScanItem[]): void {
  if (!Array.isArray(items) || items.length > 20_000 || !items.every(validItem))
    throw scanError('catalog_invalid');
}
function validateCatalog(value: ScanCatalog): ScanCatalog {
  if (value.version !== 1 || value.featureVersion !== FEATURE_VERSION)
    throw scanError('catalog_invalid');
  validateItems(value.items);
  validateCatalogAssets(value);
  return value;
}
export async function readScanCatalog(): Promise<ScanCatalog> {
  const bytes = await readAsset('catalog.json', 4 * 1024 * 1024, 'no-cache');
  return validateCatalog(JSON.parse(new TextDecoder().decode(bytes)) as ScanCatalog);
}
function validateShard(shard: ScanShard): void {
  if (!/^[a-f0-9]{64}$/.test(shard.sha256) || !/^\d+x\d+-[a-f0-9]{64}\.bin$/.test(shard.file))
    throw scanError('catalog_invalid');
  validateShardLengths(shard);
}
function validateShardLengths(shard: ScanShard): void {
  const validLength = (value: number, max: number) =>
    Number.isSafeInteger(value) && value > 0 && value <= max;
  if (
    !validLength(shard.bytes, SCAN_LIMITS.shardBytes) ||
    !validLength(shard.decodedBytes, SCAN_LIMITS.decodedShardBytes)
  )
    throw scanError('catalog_invalid');
}
async function readScanShard(shard: ScanShard, size: string): Promise<IconIndex> {
  validateShard(shard);
  const compressed = await readAsset(shard.file, shard.bytes, 'force-cache');
  if (compressed.length !== shard.bytes || (await digest(compressed)) !== shard.sha256)
    throw scanError('catalog_invalid');
  return decodeCompressedShard(compressed, shard, size);
}
async function decodeCompressedShard(
  compressed: Uint8Array,
  shard: ScanShard,
  size: string
): Promise<IconIndex> {
  const stream = new Blob([compressed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const bytes = await readBounded(stream, shard.decodedBytes);
  if (bytes.length !== shard.decodedBytes) throw scanError('catalog_invalid');
  const result = decodeScanShard(bytes);
  if (`${result.width}x${result.height}` !== size) throw scanError('catalog_invalid');
  return result.index;
}
export async function loadSizes(
  catalog: ScanCatalog,
  sizes: string[],
  cache: Map<string, IconIndex>
): Promise<IconIndex> {
  const combined = createIconIndex();
  for (const size of sizes) {
    const shard = catalog.shards[size];
    if (!shard) continue;
    if (!cache.has(size)) cache.set(size, await readScanShard(shard, size));
    const index = cache.get(size)!;
    combined.bySize.set(size, index.bySize.get(size)!);
    combined.size += index.size;
  }
  return combined;
}
function validateCatalogAssets(value: ScanCatalog): void {
  if (!value.shards || !Array.isArray(value.missing)) throw scanError('catalog_invalid');
}
