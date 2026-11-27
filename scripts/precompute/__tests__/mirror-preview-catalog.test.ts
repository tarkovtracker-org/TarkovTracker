import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { buildPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import { buildTaskImportKey } from '@/server/utils/taskImportSnapshot';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import { KvReadNotFound, type CatalogStore } from '../kv';
import { mirrorPreviewCatalog } from '../mirror-preview-catalog';
import { CATALOG_SCOPES } from '../verify-catalog-release';
import type { CatalogRelease } from '@/utils/catalogDatasets';
vi.mock('node:timers/promises', () => {
  const setTimeout = vi.fn(async () => {});
  return { default: { setTimeout }, setTimeout };
});
const overlay = { version: '1.190', sha256: 'a'.repeat(64) };
const previous = { completedAt: Date.now() - 86400000, entries: {} };
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function memoryStore(initial = new Map<string, Uint8Array<ArrayBuffer>>()) {
  const rows = new Map(initial);
  return {
    rows,
    put: vi.fn<CatalogStore['put']>(async (key, data) => {
      rows.set(key, typeof data === 'string' ? new TextEncoder().encode(data) : data);
    }),
    read: vi.fn<CatalogStore['read']>(async (key) => {
      const row = rows.get(key);
      if (!row) throw new KvReadNotFound(key);
      return row.slice().buffer;
    }),
  };
}
function fixture() {
  const raw = json({ data: { example: true } });
  const digest = createHash('sha256').update(raw).digest('hex');
  const headers = {
    'X-Overlay-Sha256': overlay.sha256,
    'X-Overlay-Version': overlay.version,
    'X-Overlay-Generated': new Date().toISOString(),
  };
  const manifest: CatalogRelease = {
    overlaySha: overlay.sha256,
    completedAt: Date.now(),
    entries: Object.fromEntries(
      CATALOG_SCOPES.map((scope) => [
        scope,
        { key: `neutral-catalog-v1/${scope}/${digest}`, bytes: raw.length, headers },
      ])
    ),
  };
  const source = memoryStore();
  for (const entry of Object.values(manifest.entries)) {
    source.rows.set(entry.key, new Uint8Array(gzipSync(raw)));
  }
  for (const gameMode of VALID_GAME_MODES) {
    source.rows.set(
      buildTaskImportKey(gameMode),
      json(
        buildPrecomputedEnvelope({
          data: { tasks: [{ id: 'example', objectives: [], failConditions: [] }] },
          dataOverlay: overlay,
          catalog: { gameMode, lang: 'en' },
        })
      )
    );
  }
  source.rows.set(CATALOG_MANIFEST_KEY, json(manifest));
  const preview = memoryStore(new Map([[CATALOG_MANIFEST_KEY, json(previous)]]));
  return { source, preview, manifest };
}
describe('preview catalog refresh', () => {
  it('copies and reads back the complete release before switching the manifest', async () => {
    const { source, preview, manifest } = fixture();
    await expect(mirrorPreviewCatalog(source, preview, overlay.sha256)).resolves.toEqual({
      completedAt: manifest.completedAt,
      overlaySha: overlay.sha256,
      catalogObjects: 46,
      importSnapshots: 3,
    });
    const keys = preview.put.mock.calls.map(([key]) => key);
    expect(keys).toEqual([
      ...Object.values(manifest.entries).map(({ key }) => key),
      ...VALID_GAME_MODES.map(buildTaskImportKey),
      CATALOG_MANIFEST_KEY,
    ]);
    for (const key of keys) {
      expect(preview.read).toHaveBeenCalledWith(key);
      expect(preview.rows.get(key)).toEqual(source.rows.get(key));
    }
    expect(preview.put.mock.calls.at(-1)?.[2]?.expirationTtl).toBeLessThan(
      preview.put.mock.calls[0]?.[2]?.expirationTtl ?? 0
    );
    expect(source.put).not.toHaveBeenCalled();
  });
  it('rejects an incomplete release or a mismatched import before writing', async () => {
    const { source, preview, manifest } = fixture();
    source.rows.set(CATALOG_MANIFEST_KEY, json({ ...manifest, entries: {} }));
    await expect(mirrorPreviewCatalog(source, preview)).rejects.toThrow(
      /exact complete catalog scope/
    );
    source.rows.set(CATALOG_MANIFEST_KEY, json(manifest));
    source.rows.set(buildTaskImportKey('pve'), json({}));
    await expect(mirrorPreviewCatalog(source, preview)).rejects.toThrow(/import snapshot.*pve/);
    expect(preview.put).not.toHaveBeenCalled();
  });
  it('leaves the previous pointer active when a staged readback fails', async () => {
    const { source, preview } = fixture();
    const read = preview.read.getMockImplementation()!;
    preview.read.mockImplementation(async (key) =>
      key === buildTaskImportKey('pve') ? json({}).buffer : read(key)
    );
    await expect(mirrorPreviewCatalog(source, preview)).rejects.toThrow(/readback differs/);
    expect(preview.rows.get(CATALOG_MANIFEST_KEY)).toEqual(json(previous));
    expect(preview.put.mock.calls.map(([key]) => key)).not.toContain(CATALOG_MANIFEST_KEY);
  });
  it('rejects corrupt source bytes and leaves the preview pointer unchanged', async () => {
    const { source, preview, manifest } = fixture();
    const entry = manifest.entries['hideout/regular']!;
    source.rows.set(entry.key, new Uint8Array(gzipSync(json({ data: { changed: true } }))));
    await expect(mirrorPreviewCatalog(source, preview)).rejects.toThrow(/catalog bytes differ/);
    expect(preview.rows.get(CATALOG_MANIFEST_KEY)).toEqual(json(previous));
  });
  it('retains the old manifest if an import nears expiry during staging', async () => {
    const start = Date.now();
    vi.setSystemTime(start);
    try {
      const { source, preview } = fixture();
      const soon = buildTaskImportKey('regular');
      const snapshot = JSON.parse(new TextDecoder().decode(source.rows.get(soon)));
      snapshot.storedAt = start - 7 * 86400000 + 120000;
      source.rows.set(soon, json(snapshot));
      const put = preview.put.getMockImplementation()!;
      preview.put.mockImplementation(async (...args) => {
        if (args[0] === buildTaskImportKey('pvp-season')) vi.setSystemTime(start + 70000);
        await put(...args);
      });
      await expect(mirrorPreviewCatalog(source, preview)).rejects.toThrow(
        /too close to expiration/
      );
      expect(preview.rows.get(CATALOG_MANIFEST_KEY)).toEqual(json(previous));
    } finally {
      vi.useRealTimers();
    }
  });
  it('never replaces a newer preview release', async () => {
    const { source, preview, manifest } = fixture();
    preview.rows.set(
      CATALOG_MANIFEST_KEY,
      json({ ...manifest, completedAt: manifest.completedAt + 1 })
    );
    await expect(mirrorPreviewCatalog(source, preview)).rejects.toThrow(/already has a newer/);
    expect(preview.put).not.toHaveBeenCalled();
  });
});
