import { describe, expect, it } from 'vitest';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import {
  compareOverlayFleet,
  compareTaskCatalogs,
  OVERLAY_PROPAGATION_WINDOW_MS,
} from '@@/scripts/precompute/verify-overlay';
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
    'requires matching overlay identity and core task coverage for %s',
    (gameMode) => {
      expect(compareTaskCatalogs('en', gameMode, core, objectives)).toMatchObject({
        status: 'current',
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
      ).toMatchObject({ status: 'mismatch' });
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
});
