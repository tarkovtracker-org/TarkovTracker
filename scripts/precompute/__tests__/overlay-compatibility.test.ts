import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
const tasks = [{ id: 'task', objectives: [{ id: 'objective', count: 7 }], failConditions: [] }];
vi.mock('@/server/utils/tarkov-json', () => ({
  createTarkovJsonTasksImportFetcher: () => async () => ({ data: { tasks } }),
}));
const emptyMode = { tasks: {}, objectives: {} };
const modes = { regular: emptyMode, pve: emptyMode, 'pvp-season': emptyMode };
const inactiveAliases = { schemaVersion: 1, modes };
const sourceOverlay = (sections: Record<string, unknown>) => ({
  editions: testOverlayEditions,
  $meta: { version: '1', generated: '2026-11-06', sha256: 'release-sha' },
  ...sections,
});
const neutralOverlay = async (sections: Record<string, unknown>) => {
  const source = sourceOverlay(sections);
  const unsigned = {
    ...source,
    schemaVersion: 1,
    $strings: { en: {} },
    $localeTargets: {},
    $source: source.$meta,
    $meta: { version: '1', generated: '2026-11-06' },
  };
  const sha256 = createHash('sha256')
    .update(JSON.stringify(unsigned, null, 2))
    .digest('hex');
  const { parseNeutralOverlay } = await import('@/server/utils/neutralOverlay');
  return parseNeutralOverlay({ ...unsigned, $meta: { ...unsigned.$meta, sha256 } });
};
const stubOverlay = (sections: Record<string, unknown>) => {
  const fetch = vi.fn(async () => Response.json(sourceOverlay(sections)));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('precompute overlay compatibility', () => {
  it.each([{}, { taskIdAliases: inactiveAliases }])(
    'accepts neutral overlays and publishes whole imports with an absent or inactive alias ledger: %j',
    async (sections) => {
      const fetch = stubOverlay(sections);
      const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
      const put = vi.fn();
      const neutral = await neutralOverlay(sections);
      expect(neutral.meta.sha256).toBe('release-sha');
      const imports = await runImportPrecompute({ put }, {}, neutral.meta.sha256);
      expect(imports.failures).toEqual([]);
      expect(imports.successes).toHaveLength(3);
      expect(put).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenCalledTimes(1);
      for (const [key, value] of put.mock.calls) {
        expect(key).toMatch(/^tasks-import-json-v1-en-(regular|pve|pvp-season)$/);
        expect(JSON.parse(value).payload.dataOverlay).toMatchObject({
          sha256: 'release-sha',
          unconsumedSections: [],
        });
        expect(JSON.parse(value).payload.data.tasks).toMatchObject(tasks);
      }
    }
  );
  const unsupportedLedgers = [
    null,
    {},
    [],
    { ...inactiveAliases, schemaVersion: 2 },
    { ...inactiveAliases, schemaVersion: '1' },
    { ...inactiveAliases, future: {} },
    { schemaVersion: 1, modes: null },
    { schemaVersion: 1, modes: [] },
    { schemaVersion: 1, modes: { regular: emptyMode } },
    { schemaVersion: 1, modes: { ...modes, arena: emptyMode } },
    ...[
      null,
      {},
      [],
      { tasks: {} },
      { tasks: [], objectives: {} },
      { tasks: {}, objectives: null },
      { ...emptyMode, future: {} },
    ].map((regular) => ({
      schemaVersion: 1,
      modes: { ...modes, regular },
    })),
    ...Object.keys(modes).flatMap((mode) =>
      ['tasks', 'objectives'].map((section) => ({
        schemaVersion: 1,
        modes: {
          ...modes,
          [mode]: {
            ...emptyMode,
            [section]:
              section === 'tasks'
                ? { placeholder_task: '0123456789abcdef01234567' }
                : {
                    placeholder_task_obj0: {
                      id: '0123456789abcdef01234568',
                      taskId: '0123456789abcdef01234567',
                    },
                  },
          },
        },
      }))
    ),
  ];
  it.each(unsupportedLedgers)(
    'retains last-good entries for an unsupported alias ledger: %j',
    async (taskIdAliases) => {
      stubOverlay({ taskIdAliases });
      const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
      const put = vi.fn();
      await expect(neutralOverlay({ taskIdAliases })).rejects.toThrow(
        'Invalid neutral overlay sections'
      );
      const imports = await runImportPrecompute({ put }, {}, 'release-sha');
      expect(imports.successes).toEqual([]);
      expect(imports.failures).toHaveLength(3);
      expect(put).not.toHaveBeenCalled();
    }
  );
  it.each([
    { future: {} },
    { modes: { regular: { taskIdAliases: inactiveAliases } } },
    { locales: { en: { taskIdAliases: inactiveAliases } } },
  ])('still blocks unconsumed root and scoped sections: %j', async (sections) => {
    stubOverlay({ taskIdAliases: inactiveAliases, ...sections });
    const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
    const put = vi.fn();
    await expect(neutralOverlay({ taskIdAliases: inactiveAliases, ...sections })).rejects.toThrow(
      'Invalid neutral overlay sections'
    );
    const result = await runImportPrecompute({ put }, {}, 'release-sha');
    expect(result.failures).toHaveLength(3);
    expect(put).not.toHaveBeenCalled();
  });
});
