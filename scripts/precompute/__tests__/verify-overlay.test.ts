import {
  compareOverlayFleet,
  compareTaskCatalogs,
  compareImportCatalog,
  readTaskCatalogPair,
  OVERLAY_PROPAGATION_WINDOW_MS,
} from '@@/scripts/precompute/verify-overlay';
import { describe, expect, it } from 'vitest';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
describe('whole import snapshot release verification', () => {
  const published = { version: 'v1', sha256: 'sha1' };
  const snapshot = (gameMode: string) => ({
    data: { tasks: [{ id: 'task', objectives: [], failConditions: [] }] },
    dataOverlay: published,
    catalog: { lang: 'en', gameMode },
  });
  it.each(['regular', 'pve', 'pvp-season'])(
    'checks the complete %s source against the release',
    (mode) => {
      expect(compareImportCatalog(mode, published, snapshot(mode))).toMatchObject({
        status: 'current',
        taskCount: 1,
      });
      expect(
        compareImportCatalog(mode, { version: 'v2', sha256: 'sha2' }, snapshot(mode))
      ).toMatchObject({ status: 'mismatch' });
    }
  );
  it('cannot certify missing, malformed or wrong-scope imports', () => {
    expect(compareImportCatalog('regular', published, undefined).status).toBe('unverified');
    expect(compareImportCatalog('pve', published, snapshot('regular')).status).toBe('unverified');
    expect(
      compareImportCatalog('regular', published, { ...snapshot('regular'), data: { tasks: [] } })
        .status
    ).toBe('unverified');
  });
});
const now = Date.parse('2026-09-07T12:00:00Z');
const published = { version: '1', sha256: 'published', generated: new Date(now).toISOString() };
const entries = API_SUPPORTED_LANGUAGES.flatMap((lang) =>
  VALID_GAME_MODES.map((gameMode) => ({
    lang,
    gameMode,
    overlay: { version: '1', sha256: 'published' },
    source: 'PRECOMPUTE',
  }))
);
const manifest = { completedAt: now, entries };
describe('overlay fleet verification', () => {
  it('requires all 48 served responses and complete matching provenance', () => {
    const rows = compareOverlayFleet(published, manifest, entries, now);
    expect(rows).toHaveLength(48);
    expect(rows.every((row) => row.status === 'current')).toBe(true);
    expect(
      compareOverlayFleet(published, null, entries, now).every((row) => row.status === 'unverified')
    ).toBe(true);
  });
  it('tests both sides of the exact propagation boundary', () => {
    const stale = entries.map((entry) => ({ ...entry, overlay: { version: '0', sha256: 'old' } }));
    expect(
      compareOverlayFleet(published, manifest, stale, now + OVERLAY_PROPAGATION_WINDOW_MS).every(
        (row) => row.status === 'propagating'
      )
    ).toBe(true);
    expect(
      compareOverlayFleet(
        published,
        manifest,
        stale,
        now + OVERLAY_PROPAGATION_WINDOW_MS + 1
      ).every((row) => row.status === 'drift')
    ).toBe(true);
  });
  it.each(['HIT', 'STALE', 'MISS', 'BYPASS', 'DEV', undefined])(
    'does not certify matching SHA from %s',
    (source) => {
      const served = entries.map((entry) => ({ ...entry, source }));
      expect(
        compareOverlayFleet(published, manifest, served, now).every(
          (row) => row.status === 'unverified'
        )
      ).toBe(true);
    }
  );
  it.each([
    undefined,
    null,
    {},
    { version: '1', sha256: 'published' },
    { ...published, generated: 'invalid' },
    { ...published, sha256: ' ' },
  ])('handles malformed published metadata %j', (meta) => {
    expect(
      compareOverlayFleet(meta, manifest, entries, now).every((row) => row.status === 'unverified')
    ).toBe(true);
  });
  it.each([{}, { entries: {} }, { entries: [null, 'broken', {}] }])(
    'handles malformed manifests %j',
    (invalid) => {
      expect(
        compareOverlayFleet(published, invalid, entries, now).every(
          (row) => row.status === 'unverified'
        )
      ).toBe(true);
    }
  );
  it('keeps a filtered bust uncertified until the complete manifest is refreshed', () => {
    const staleManifest = {
      entries: entries.map((entry) => ({ ...entry, overlay: { version: '0', sha256: 'old' } })),
    };
    expect(
      compareOverlayFleet(published, staleManifest, entries, now).every(
        (row) => row.status === 'propagating'
      )
    ).toBe(true);
  });
});
describe('core and objective catalog coherence', () => {
  const core = {
    data: { tasks: [{ id: 'upstream' }, { id: 'overlay-addition' }] },
    dataOverlay: published,
  };
  const objectives = {
    data: {
      tasks: [
        { id: 'upstream', objectives: [] },
        { id: 'overlay-addition', objectives: [{ id: 'objective' }] },
      ],
    },
    dataOverlay: published,
  };
  it.each(VALID_GAME_MODES)(
    'requires overlay provenance and core task coverage for %s',
    (gameMode) => {
      expect(compareTaskCatalogs('en', gameMode, core, objectives)).toMatchObject({
        status: 'covered',
        missingTaskIds: [],
        coreCount: 2,
        objectiveCount: 2,
      });
      const incomplete = { ...objectives, data: { tasks: [objectives.data.tasks[0]] } };
      expect(compareTaskCatalogs('en', gameMode, core, incomplete)).toMatchObject({
        status: 'mismatch',
        missingTaskIds: ['overlay-addition'],
      });
      expect(
        compareTaskCatalogs('en', gameMode, core, {
          ...objectives,
          dataOverlay: { status: 'missing', error: 'HTTP 404' },
        })
      ).toMatchObject({ status: 'unverified' });
      expect(
        compareTaskCatalogs('en', gameMode, core, {
          ...objectives,
          dataOverlay: { version: '0', sha256: 'old' },
        })
      ).toMatchObject({ status: 'covered', overlayIdentityMatches: false });
    }
  );
  it.each([
    {},
    { data: { tasks: [] } },
    { data: { tasks: [{ id: 'upstream', objectives: {} }] } },
    { data: { tasks: [null] } },
  ])('does not certify malformed objective payload %j', (invalid) => {
    expect(
      compareTaskCatalogs('en', 'regular', core, { ...invalid, dataOverlay: published }).status
    ).toBe('unverified');
  });
  it('rejects conflicting duplicate task IDs in either catalog', () => {
    const duplicateCore = { ...core, data: { tasks: [core.data.tasks[0], core.data.tasks[0]] } };
    const duplicateObjectives = {
      ...objectives,
      data: {
        tasks: [
          ...objectives.data.tasks,
          { id: 'upstream', objectives: [{ id: 'conflicting', count: 99 }] },
        ],
      },
    };
    expect(compareTaskCatalogs('en', 'regular', duplicateCore, objectives).status).toBe(
      'unverified'
    );
    expect(compareTaskCatalogs('en', 'regular', core, duplicateObjectives).status).toBe(
      'unverified'
    );
  });
  it('retains successful core evidence when the objective read fails', async () => {
    const pair = await readTaskCatalogPair(
      'en',
      'regular',
      Promise.resolve({ payload: core, source: 'PRECOMPUTE' }),
      Promise.reject(new Error('HTTP 503 objectives'))
    );
    expect(pair.served).toMatchObject({
      lang: 'en',
      gameMode: 'regular',
      overlay: { version: published.version, sha256: published.sha256 },
      source: 'PRECOMPUTE',
    });
    expect(pair.catalog).toMatchObject({ coreCount: 2, objectiveCount: 0, status: 'unverified' });
    expect(pair.errors).toEqual(['Error: HTTP 503 objectives']);
  });
});
