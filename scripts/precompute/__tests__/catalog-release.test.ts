import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_DATASETS, CATALOG_LANGUAGES, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import { publishCatalogRelease } from '../catalog-release';
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
    buildNeutralCatalog: vi.fn(async () => ({
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
    put: vi.fn(async (key: string, body: string | Uint8Array<ArrayBuffer>) => {
      writes.set(key, body);
    }),
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
      3 * CATALOG_DATASETS.length + CATALOG_LANGUAGES.length
    );
    expect(build.buildCatalogStrings).toHaveBeenCalledWith('tr', new Set([ref]));
    expect(put.mock.calls.at(-1)).toEqual([
      CATALOG_MANIFEST_KEY,
      JSON.stringify(manifest),
      expect.anything(),
    ]);
    const staged = new Map(put.mock.calls);
    for (const { key, bytes } of Object.values(manifest.entries)) {
      expect(gunzipSync(staged.get(key)!).byteLength).toBe(bytes);
    }
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
  it('rejects data from another overlay release before writing it', async () => {
    const kv = memoryStore();
    await expect(publishCatalogRelease(kv, builders(), 'other')).rejects.toThrow(
      'Unexpected overlay in tasks-core'
    );
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
});
