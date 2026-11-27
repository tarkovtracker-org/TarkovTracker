import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { joinChunks } from '@/utils/stashScan/core/byteChunks';
import type { ScanCatalog } from '@/utils/stashScan/types';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Hold from the first cache/shard write through manifest publication and pruning. */
export async function withScanBuildLock<T>(output: string, build: () => Promise<T>): Promise<T> {
  const lock = outputFile(output, '.build-lock');
  // EEXIST rejects concurrent builds; never remove a lock acquired by another builder.
  await mkdir(lock);
  const owner = outputFile(lock, 'owner.json');
  try {
    await writeFile(
      owner,
      JSON.stringify({
        hostname: hostname(),
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      }),
      { flag: 'wx' }
    );
    return await build();
  } finally {
    await rm(owner, { force: true });
    await rmdir(lock);
  }
}
export async function writeScanAsset(
  output: string,
  name: string,
  data: string | Uint8Array
): Promise<void> {
  const target = outputFile(output, name);
  const temporary = outputFile(output, `${name}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function boundedImage(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error('Missing grid image body');
  const reader = response.body.getReader();
  try {
    return await readImageChunks(reader);
  } finally {
    await reader.cancel();
  }
}
async function readImageChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) return joinChunks(chunks, length);
    length += next.value.length;
    if (length > MAX_IMAGE_BYTES) throw new Error('Oversized grid image');
    chunks.push(next.value);
  }
}
export async function cacheImage(response: Response, file: string): Promise<Uint8Array> {
  const next = await boundedImage(response);
  await writeScanAsset(dirname(file), basename(file), next);
  await writeScanAsset(dirname(file), `${basename(file)}.etag`, response.headers.get('etag') ?? '');
  return next;
}
/** Replacements and deletions must stay direct children of the selected output directory. */
function outputFile(output: string, name: string): string {
  const root = resolve(output);
  const file = resolve(root, name);
  if (dirname(file) !== root) throw new Error('Shard path escapes output directory');
  return file;
}
async function pruneShards(output: string, manifest: ScanCatalog): Promise<void> {
  const referenced = new Set(Object.values(manifest.shards).map((shard) => shard.file));
  const entries = await readdir(output, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await pruneUnreferenced(output, entry.name, referenced);
  }
}
async function pruneUnreferenced(
  output: string,
  name: string,
  referenced: Set<string>
): Promise<void> {
  if (!/^\d+x\d+-[a-f0-9]{64}\.bin$/.test(name)) return;
  if (referenced.has(name)) return;
  await rm(outputFile(output, name));
}
export async function publishScanCatalog(output: string, manifest: ScanCatalog): Promise<void> {
  await writeScanAsset(output, 'catalog.json', JSON.stringify(manifest));
  // A failed build/publication keeps every file used by the previous manifest.
  await pruneShards(output, manifest);
}
