// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  cacheImage,
  publishScanCatalog,
  withScanBuildLock,
  writeScanAsset,
} from '@@/scripts/stash-scan/build-assets';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanCatalog } from '@/utils/stashScan/types';
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
  };
});
const root = resolve('node_modules/.cache/stash-scan-build-tests');
let directory: string;
const oldName = `1x1-${'a'.repeat(64)}.bin`;
const keptName = `1x1-${'b'.repeat(64)}.bin`;
const manifest = (): ScanCatalog => ({
  version: 1,
  featureVersion: 1,
  builtAt: 'test',
  items: [],
  missing: [],
  shards: { '1x1': { file: keptName, sha256: 'b'.repeat(64), bytes: 1, decodedBytes: 1 } },
});
beforeEach(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, 'build-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(writeFile).mockReset();
  vi.mocked(rename).mockReset();
  vi.mocked(rm).mockReset();
  // Destructive cleanup is limited to this test's resolved workspace-owned directory.
  expect(resolve(directory).startsWith(`${root}${sep}`)).toBe(true);
  await rm(directory, { recursive: true });
});
describe('bounded builder image responses', () => {
  it('streams at most 4MB and cancels overflow before writing a cache or ETag', async () => {
    const cancelled = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4 * 1024 * 1024));
          controller.enqueue(new Uint8Array([1]));
          controller.enqueue(new Uint8Array([2]));
          controller.close();
        },
        cancel: cancelled,
      })
    );
    const buffered = vi
      .spyOn(response, 'arrayBuffer')
      .mockRejectedValue(new Error('unbounded read'));
    const file = join(directory, 'icon.webp');
    await expect(cacheImage(response, file)).rejects.toThrow('Oversized grid image');
    expect(buffered).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(await readdir(directory)).toEqual([]);
  });
  it('rejects a missing response body without publishing an empty cache entry', async () => {
    await expect(cacheImage(new Response(null), join(directory, 'icon.webp'))).rejects.toThrow(
      'Missing grid image body'
    );
    expect(await readdir(directory)).toEqual([]);
  });
  it('caches an exactly 4MB image and its ETag after the complete stream is read', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024).fill(7);
    const file = join(directory, 'icon.webp');
    const result = await cacheImage(new Response(bytes, { headers: { etag: 'test-tag' } }), file);
    expect(Buffer.from(result).equals(bytes)).toBe(true);
    expect((await readFile(file)).equals(bytes)).toBe(true);
    expect(await readFile(`${file}.etag`, 'utf8')).toBe('test-tag');
  });
  it('preserves the complete cached image and ETag after an interrupted image write', async () => {
    const file = join(directory, 'icon.webp');
    await writeFile(file, 'complete image');
    await writeFile(`${file}.etag`, 'old-tag');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (target, _data, options) => {
      await actual.writeFile(target, 'partial', options);
      throw new Error('disk full');
    });
    await expect(
      cacheImage(new Response('new image', { headers: { etag: 'new-tag' } }), file)
    ).rejects.toThrow('disk full');
    expect(await readFile(file, 'utf8')).toBe('complete image');
    expect(await readFile(`${file}.etag`, 'utf8')).toBe('old-tag');
    expect((await readdir(directory)).sort()).toEqual(['icon.webp', 'icon.webp.etag']);
  });
  it('keeps complete image bytes and the prior ETag when metadata replacement fails', async () => {
    const file = join(directory, 'icon.webp');
    await writeFile(file, 'complete image');
    await writeFile(`${file}.etag`, 'old-tag');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(rename)
      .mockImplementationOnce(actual.rename)
      .mockRejectedValueOnce(new Error('metadata rename failed'));
    await expect(
      cacheImage(new Response('new image', { headers: { etag: 'new-tag' } }), file)
    ).rejects.toThrow('metadata rename failed');
    expect(await readFile(file, 'utf8')).toBe('new image');
    expect(await readFile(`${file}.etag`, 'utf8')).toBe('old-tag');
    expect((await readdir(directory)).sort()).toEqual(['icon.webp', 'icon.webp.etag']);
  });
});
describe('exclusive catalog builds', () => {
  it('records the owner host, PID and acquisition time for safe manual recovery', async () => {
    const before = Date.now();
    await withScanBuildLock(directory, async () => {
      const lock = join(directory, '.build-lock');
      expect(await readdir(lock)).toEqual(['owner.json']);
      const owner = JSON.parse(await readFile(join(lock, 'owner.json'), 'utf8'));
      expect(owner).toEqual({
        hostname: hostname(),
        pid: process.pid,
        acquiredAt: expect.any(String),
      });
      expect(Date.parse(owner.acquiredAt)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(owner.acquiredAt)).toBeLessThanOrEqual(Date.now());
    });
    expect(await readdir(directory)).toEqual([]);
  });
  it('cleans up partial owner metadata without starting the build', async () => {
    const build = vi.fn(async () => 'built');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (file, _data, options) => {
      await actual.writeFile(file, 'partial owner', options);
      throw new Error('owner write failed');
    });
    await expect(withScanBuildLock(directory, build)).rejects.toThrow('owner write failed');
    expect(build).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);
  });
  it.each(['publication', 'pruning'])('rejects a competitor during manifest %s', async (phase) => {
    await writeFile(join(directory, oldName), 'old shard');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const second = vi.fn(async () => 'competing build');
    const attempts: PromiseSettledResult<string>[] = [];
    const probe = async () => {
      attempts.push(...(await Promise.allSettled([withScanBuildLock(directory, second)])));
    };
    if (phase === 'publication') {
      vi.mocked(rename).mockImplementation(async (from, to) => {
        if (String(to) === join(directory, 'catalog.json')) await probe();
        await actual.rename(from, to);
      });
    } else {
      vi.mocked(rm).mockImplementation(async (file, options) => {
        if (String(file) === join(directory, oldName)) await probe();
        await actual.rm(file, options);
      });
    }
    const result = await Promise.allSettled([
      withScanBuildLock(directory, async () => {
        await writeScanAsset(directory, keptName, 'new shard');
        await publishScanCatalog(directory, manifest());
      }),
    ]);
    expect(attempts).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ code: 'EEXIST' }) },
    ]);
    expect(second).not.toHaveBeenCalled();
    expect(result).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(await readFile(join(directory, keptName), 'utf8')).toBe('new shard');
    expect(JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8'))).toEqual(manifest());
    expect((await readdir(directory)).sort()).toEqual([keptName, 'catalog.json'].sort());
  });
  it('rejects a second builder until the first has published and pruned', async () => {
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (started = resolve));
    const first = withScanBuildLock(directory, async () => {
      started();
      await held;
      await writeScanAsset(directory, keptName, 'new shard');
      await publishScanCatalog(directory, manifest());
      return 'published';
    });
    await ready;
    const second = vi.fn(async () => publishScanCatalog(directory, manifest()));
    try {
      await expect(withScanBuildLock(directory, second)).rejects.toMatchObject({ code: 'EEXIST' });
      expect(second).not.toHaveBeenCalled();
      // A rejected competitor must not remove the active builder's lock.
      expect(await readdir(directory)).toEqual(['.build-lock']);
    } finally {
      release();
      // Settle cleanup without masking a failed exclusion assertion above.
      await Promise.allSettled([first]);
    }
    await expect(first).resolves.toBe('published');
    await expect(readFile(join(directory, keptName), 'utf8')).resolves.toBe('new shard');
    expect((await readdir(directory)).sort()).toEqual([keptName, 'catalog.json'].sort());
    await expect(withScanBuildLock(directory, async () => 'next build')).resolves.toBe(
      'next build'
    );
  });
  it('releases the lock when a build fails', async () => {
    await expect(
      withScanBuildLock(directory, async () => {
        throw new Error('build failed');
      })
    ).rejects.toThrow('build failed');
    expect(await readdir(directory)).toEqual([]);
    await expect(withScanBuildLock(directory, async () => 'retry')).resolves.toBe('retry');
  });
});
describe('atomic manifest publication and shard pruning', () => {
  it('preserves a live shard when its replacement write is interrupted', async () => {
    await writeFile(join(directory, keptName), 'complete shard');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (file, _data, options) => {
      await actual.writeFile(file, 'partial', options);
      throw new Error('disk full');
    });
    await expect(writeScanAsset(directory, keptName, new Uint8Array([1]))).rejects.toThrow(
      'disk full'
    );
    expect(await readFile(join(directory, keptName), 'utf8')).toBe('complete shard');
    expect(await readdir(directory)).toEqual([keptName]);
  });
  it('preserves a live shard when atomic replacement fails', async () => {
    await writeFile(join(directory, keptName), 'complete shard');
    vi.mocked(rename).mockRejectedValueOnce(new Error('rename failed'));
    await expect(writeScanAsset(directory, keptName, new Uint8Array([1]))).rejects.toThrow(
      'rename failed'
    );
    expect(await readFile(join(directory, keptName), 'utf8')).toBe('complete shard');
    expect(await readdir(directory)).toEqual([keptName]);
  });
  async function existing(): Promise<void> {
    await writeFile(join(directory, 'catalog.json'), 'old complete manifest');
    await writeFile(join(directory, oldName), 'old shard');
    await writeFile(join(directory, keptName), 'new shard');
  }
  it('preserves the prior complete manifest and shards after a partial temporary write failure', async () => {
    await existing();
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (file, _data, options) => {
      await actual.writeFile(file, 'partial', options);
      throw new Error('disk full');
    });
    await expect(publishScanCatalog(directory, manifest())).rejects.toThrow('disk full');
    expect(await readFile(join(directory, 'catalog.json'), 'utf8')).toBe('old complete manifest');
    expect(await readFile(join(directory, oldName), 'utf8')).toBe('old shard');
    expect((await readdir(directory)).sort()).toEqual([oldName, keptName, 'catalog.json'].sort());
  });
  it('does not prune on failed atomic replacement and removes its incomplete publication file', async () => {
    await existing();
    vi.mocked(rename).mockRejectedValueOnce(new Error('rename failed'));
    await expect(publishScanCatalog(directory, manifest())).rejects.toThrow('rename failed');
    expect(await readFile(join(directory, 'catalog.json'), 'utf8')).toBe('old complete manifest');
    expect(await readFile(join(directory, oldName), 'utf8')).toBe('old shard');
    expect((await readdir(directory)).sort()).toEqual([oldName, keptName, 'catalog.json'].sort());
  });
  it('publishes by replacement before pruning only unreferenced known shard files', async () => {
    await existing();
    const unrelated = 'notes.bin';
    const oldFormat = `1x1-${'c'.repeat(64)}.bin.gz`;
    const nested = `1x1-${'d'.repeat(64)}.bin`;
    await writeFile(join(directory, unrelated), 'keep');
    await writeFile(join(directory, oldFormat), 'keep');
    await mkdir(join(directory, nested));
    await writeFile(join(directory, nested, oldName), 'nested stays');
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(rename).mockImplementationOnce(async (from, to) => {
      expect(await readFile(join(directory, oldName), 'utf8')).toBe('old shard');
      await actual.rename(from, to);
    });
    await publishScanCatalog(directory, manifest());
    expect(vi.mocked(rename)).toHaveBeenCalledOnce();
    const [from, to] = vi.mocked(rename).mock.calls[0]!;
    expect(resolve(String(from))).not.toBe(resolve(String(to)));
    expect(resolve(String(from)).startsWith(`${directory}${sep}`)).toBe(true);
    expect(resolve(String(to))).toBe(join(directory, 'catalog.json'));
    expect(JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8'))).toEqual(manifest());
    expect((await readdir(directory)).sort()).toEqual(
      [keptName, 'catalog.json', unrelated, oldFormat, nested].sort()
    );
    expect(await readFile(join(directory, nested, oldName), 'utf8')).toBe('nested stays');
  });
});
