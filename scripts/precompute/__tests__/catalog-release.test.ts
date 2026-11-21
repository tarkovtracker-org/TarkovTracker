import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_DATASETS, CATALOG_LANGUAGES, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import { catalogReleaseReport, publishCatalogRelease } from '../catalog-release';
vi.mock('node:timers/promises', () => {
  const setTimeout = vi.fn(async () => {});
  return { default: { setTimeout }, setTimeout };
});
const ref = '@tt:pve:tasks:objective';
const data = Object.fromEntries(
  [
    'playerLevels',
    'tasks',
    'maps',
    'traders',
    'hideoutStations',
    'items',
    'prestige',
    'editions',
  ].map((key) => [key, [{ id: 'objective', description: ref }]])
);
function builders() {
  return {
    buildNeutralCatalog: vi.fn(async (_dataset: string, _mode: string) => ({
      data,
      dataOverlay: { sha256: 'sha', version: 'v1' },
    })),
    buildCatalogStrings: vi.fn(async () => ({
      data: { strings: { [ref]: 'translated' } },
      dataOverlay: { sha256: 'sha', version: 'v1' },
    })),
  };
}
function memoryStore() {
  const writes = new Map<string, string | Uint8Array<ArrayBuffer>>();
  return {
    put: vi.fn(
      async (
        key: string,
        body: string | Uint8Array<ArrayBuffer>,
        _options?: { expirationTtl?: number }
      ) => {
        writes.set(key, body);
      }
    ),
    read: async (key: string) => new Response(writes.get(key)).arrayBuffer(),
  };
}
describe('neutral catalog publication', () => {
  it('activates a complete immutable release with every mode and selectable language', async () => {
    const kv = memoryStore();
    const { put } = kv;
    const build = builders();
    const manifest = await publishCatalogRelease(kv, build, 'sha');
    expect(Object.keys(manifest.entries)).toHaveLength(
      3 * (CATALOG_DATASETS.length + 1) + CATALOG_LANGUAGES.length
    );
    expect(build.buildNeutralCatalog.mock.calls).toEqual(
      ['regular', 'pve', 'pvp-season'].flatMap((mode) =>
        CATALOG_DATASETS.map((dataset) => [dataset, mode])
      )
    );
    expect(build.buildCatalogStrings).toHaveBeenCalledWith('tr', new Set([ref]));
    expect(put.mock.calls.at(-1)).toEqual([
      CATALOG_MANIFEST_KEY,
      JSON.stringify(manifest),
      expect.anything(),
    ]);
    expect(put.mock.calls.at(-1)?.[2]?.expirationTtl).toBeLessThan(
      put.mock.calls[0]?.[2]?.expirationTtl ?? 0
    );
    const staged = new Map(put.mock.calls.map(([key, value]) => [key, value]));
    for (const { key, bytes } of Object.values(manifest.entries)) {
      expect(gunzipSync(staged.get(key)!).byteLength).toBe(bytes);
    }
  });
  it('publishes ordered comparison inputs without unrelated objective fields', async () => {
    const kv = memoryStore();
    const build = builders();
    const tasks = [
      { id: 'first', objectives: { a: { id: 'shared', count: 0, description: ref }, b: null } },
      { id: 'second', objectives: [{ id: 'shared', count: 4 }, { id: 'unspecified' }] },
    ];
    const manifest = await publishCatalogRelease(
      kv,
      {
        ...build,
        buildNeutralCatalog: async (dataset, mode) => {
          const payload = await build.buildNeutralCatalog(dataset, mode);
          return dataset === 'tasks-objectives' ? { ...payload, data: { tasks } } : payload;
        },
      },
      'sha'
    );
    const entry = manifest.entries['tasks-objectives/pve/counts']!;
    expect(JSON.parse(gunzipSync(await kv.read(entry.key)).toString())).toEqual({
      data: {
        tasks: [
          { id: 'first', objectives: [{ id: 'shared', count: 0 }] },
          { id: 'second', objectives: [{ id: 'shared', count: 4 }, { id: 'unspecified' }] },
        ],
      },
      dataOverlay: { sha256: 'sha', version: 'v1' },
    });
  });
  it('rejects oversized uncompressed catalog data before any KV write', async () => {
    const kv = memoryStore();
    const build = builders();
    const oversized = { ...data, playerLevels: Array.from({ length: 18000 }, (_, i) => i) };
    await expect(
      publishCatalogRelease(
        kv,
        {
          ...build,
          buildNeutralCatalog: async () => ({
            data: oversized,
            dataOverlay: { sha256: 'sha', version: 'v1' },
          }),
        },
        'sha'
      )
    ).rejects.toThrow('Uncompressed catalog exceeds limit for bootstrap/regular');
    expect(kv.put).not.toHaveBeenCalled();
  });
  it('preserves the prior release when a locale is incomplete', async () => {
    const kv = memoryStore();
    const { put } = kv;
    const build = builders();
    await expect(
      publishCatalogRelease(
        kv,
        {
          ...build,
          buildCatalogStrings: async () => ({
            data: { strings: {} },
            dataOverlay: { sha256: 'sha', version: 'v1' },
          }),
        },
        'sha'
      )
    ).rejects.toThrow('Missing translation');
    expect(put).not.toHaveBeenCalledWith(
      CATALOG_MANIFEST_KEY,
      expect.anything(),
      expect.anything()
    );
  });
  it('waits for stale objects and the prior active pointer to converge without writing twice', async () => {
    const kv = memoryStore();
    const seen = new Set<string>();
    const read = async (key: string) => {
      if (seen.has(key)) return kv.read(key);
      seen.add(key);
      return new ArrayBuffer(0);
    };
    const manifest = await publishCatalogRelease({ ...kv, read }, builders(), 'sha');
    expect(seen.size).toBe(Object.keys(manifest.entries).length + 1);
    expect(kv.put).toHaveBeenCalledTimes(seen.size);
  });
  it('reports that the pointer was written if it cannot be confirmed', async () => {
    const kv = memoryStore();
    const read = (key: string) =>
      key === CATALOG_MANIFEST_KEY ? Promise.resolve(new ArrayBuffer(0)) : kv.read(key);
    await expect(publishCatalogRelease({ ...kv, read }, builders(), 'sha')).rejects.toThrow(
      'pointer was already written'
    );
  });
  it('leaves the active release alone when staged data fails readback', async () => {
    const kv = { ...memoryStore(), read: async () => new ArrayBuffer(0) };
    await expect(publishCatalogRelease(kv, builders(), 'sha')).rejects.toThrow(
      'KV readback differs'
    );
    expect(kv.put).not.toHaveBeenCalledWith(
      CATALOG_MANIFEST_KEY,
      expect.anything(),
      expect.anything()
    );
  });
  it('reports a staging failure to the workflow without activating a partial manifest', async () => {
    const kv = { ...memoryStore(), read: async () => new ArrayBuffer(0) };
    const report = await catalogReleaseReport(kv, builders(), 'sha');
    expect(report).toEqual({
      catalogRelease: undefined,
      catalogReleaseError: 'KV readback differs for bootstrap/regular',
    });
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
  it('rejects data from another overlay release before writing it', async () => {
    const kv = memoryStore();
    await expect(publishCatalogRelease(kv, builders(), 'other')).rejects.toThrow(
      'Unexpected overlay in tasks-core'
    );
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
});
