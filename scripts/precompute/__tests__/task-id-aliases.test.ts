import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
import { unknownOverlaySections } from '@/server/utils/overlayValidation';
import type { OverlayData } from '@/server/utils/overlayTypes';
const tasks = [{ id: 'task', objectives: [{ id: 'objective', count: 7 }], failConditions: [] }];
vi.mock('@/server/utils/tarkov-json', () => ({
  createTarkovJsonTasksCoreFetcher: () => async () => ({ data: { tasks } }),
  createTarkovJsonTasksImportFetcher: () => async () => ({ data: { tasks } }),
}));
const emptyMode = () => ({ tasks: {}, objectives: {} });
const emptyAliases = () => ({
  schemaVersion: 1,
  modes: { regular: emptyMode(), pve: emptyMode(), 'pvp-season': emptyMode() },
});
const meta = { version: '1.174', generated: '2026-11-06T17:45:08.222Z', sha256: 'release-sha' };
const overlay = (taskIdAliases: unknown) => ({
  $meta: meta,
  editions: testOverlayEditions,
  taskIdAliases,
});
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('staged empty task alias compatibility', () => {
  it('accepts older overlays without a ledger and the exact empty version-1 ledger', () => {
    expect(unknownOverlaySections({})).toEqual([]);
    expect(unknownOverlaySections(overlay(emptyAliases()))).toEqual([]);
  });
  it.each([
    undefined,
    null,
    [],
    {},
    'invalid',
    { ...emptyAliases(), schemaVersion: '1' },
    { ...emptyAliases(), schemaVersion: 2 },
    { ...emptyAliases(), extra: {} },
    { modes: emptyAliases().modes },
    { schemaVersion: 1 },
    { schemaVersion: 1, modes: {} },
    { schemaVersion: 1, modes: [] },
    { schemaVersion: 1, modes: { regular: emptyMode(), pve: emptyMode() } },
    { schemaVersion: 1, modes: { ...emptyAliases().modes, pvp: emptyMode() } },
  ])('keeps malformed or unsupported ledgers unconsumed: %j', (value) => {
    expect(unknownOverlaySections(overlay(value))).toEqual(['taskIdAliases']);
  });
  it.each(['regular', 'pve', 'pvp-season'] as const)('validates every map in %s', (mode) => {
    for (const invalid of [
      null,
      [],
      {},
      { tasks: {} },
      { objectives: {} },
      { ...emptyMode(), extra: {} },
      { tasks: [], objectives: {} },
      { tasks: {}, objectives: null },
      { tasks: { old: 'new' }, objectives: {} },
      { tasks: {}, objectives: { old: { id: 'new', taskId: 'task' } } },
    ]) {
      const aliases = { ...emptyAliases(), modes: { ...emptyAliases().modes, [mode]: invalid } };
      expect(unknownOverlaySections(overlay(aliases))).toEqual(['taskIdAliases']);
    }
  });
  it('does not allow misplaced ledgers or unrelated unknown sections', () => {
    const candidate = {
      ...overlay(emptyAliases()),
      future: {},
      modes: { regular: { taskIdAliases: emptyAliases() } },
      locales: { en: { taskIdAliases: emptyAliases() } },
    } as unknown as OverlayData;
    expect(unknownOverlaySections(candidate)).toEqual([
      'future',
      'modes.regular.taskIdAliases',
      'locales.en.taskIdAliases',
    ]);
  });
  it('generates all core and import snapshots through the real overlay with pinned provenance', async () => {
    vi.stubEnv('EXPECTED_OVERLAY_SHA', meta.sha256);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(overlay(emptyAliases()))))
    );
    const { runPrecompute } = await import('@@/scripts/precompute/precompute');
    const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
    const put = vi.fn(async () => {});
    const core = await runPrecompute({ put });
    expect(core.failures).toEqual([]);
    expect(core.successes).toHaveLength(48);
    expect(core.manifest).toHaveLength(48);
    const imports = await runImportPrecompute({ put }, {}, core.manifest[0]?.overlay.sha256);
    expect(imports.failures).toEqual([]);
    expect(imports.successes).toHaveLength(3);
    expect(put).toHaveBeenCalledTimes(52);
    for (const [key, raw] of put.mock.calls as unknown as Array<[string, string]>) {
      if (key.startsWith('overlay-precompute-manifest')) continue;
      const envelope = JSON.parse(raw);
      expect(envelope.overlay).toEqual({ version: meta.version, sha256: meta.sha256 });
      expect(envelope.payload.dataOverlay.unconsumedSections).toEqual([]);
      expect(envelope.payload.data.tasks[0].id).toBe('task');
      expect(envelope.payload.data.tasks[0].objectives[0]).toMatchObject({
        id: 'objective',
        count: 7,
      });
    }
  });
  it.each(['populated', 'malformed', 'mismatched provenance'])(
    'retains every existing snapshot for %s aliases through the real overlay',
    async (kind) => {
      const aliases = emptyAliases();
      if (kind === 'populated') aliases.modes.pve.tasks = { old: 'new' };
      if (kind === 'malformed') aliases.schemaVersion = 2;
      vi.stubEnv(
        'EXPECTED_OVERLAY_SHA',
        kind === 'mismatched provenance' ? 'different-sha' : meta.sha256
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(overlay(aliases))))
      );
      const { runPrecompute } = await import('@@/scripts/precompute/precompute');
      const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
      const put = vi.fn();
      const core = await runPrecompute({ put });
      expect(core.successes).toEqual([]);
      expect(core.failures).toHaveLength(48);
      const imports = await runImportPrecompute({ put }, {}, process.env.EXPECTED_OVERLAY_SHA);
      expect(imports.successes).toEqual([]);
      expect(imports.failures).toHaveLength(3);
      expect(put).not.toHaveBeenCalled();
    }
  );
});
