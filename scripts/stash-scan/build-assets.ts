import { randomUUID } from 'node:crypto';
import { readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ScanCatalog } from '@/utils/stashScan/types';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
function joinImageChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
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
    if (next.done) return joinImageChunks(chunks, length);
    length += next.value.length;
    if (length > MAX_IMAGE_BYTES) throw new Error('Oversized grid image');
    chunks.push(next.value);
  }
}
export async function cacheImage(response: Response, file: string): Promise<Uint8Array> {
  const next = await boundedImage(response);
  await writeFile(file, next);
  await writeFile(`${file}.etag`, response.headers.get('etag') ?? '');
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
  const temporary = outputFile(output, `catalog.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(manifest), { flag: 'wx' });
    await rename(temporary, outputFile(output, 'catalog.json'));
  } finally {
    await rm(temporary, { force: true });
  }
  // A failed build/publication keeps every file used by the previous manifest.
  await pruneShards(output, manifest);
}
