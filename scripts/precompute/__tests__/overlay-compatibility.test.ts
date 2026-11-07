import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
const tasks = [{ id: 'task', objectives: [{ id: 'objective', count: 7 }], failConditions: [] }];
vi.mock('@/server/utils/tarkov-json', () => ({
  createTarkovJsonTasksCoreFetcher: () => async () => ({ data: { tasks } }),
  createTarkovJsonTasksImportFetcher: () => async () => ({ data: { tasks } }),
}));
const emptyMode = { tasks: {}, objectives: {} };
const modes = { regular: emptyMode, pve: emptyMode, 'pvp-season': emptyMode };
const inactiveAliases = { schemaVersion: 1, modes };
const stubOverlay = (sections: Record<string, unknown>) => {
  const fetch = vi.fn(async () =>
    Response.json({
      editions: testOverlayEditions,
      $meta: { version: '1', generated: '2026-11-06', sha256: 'release-sha' },
      ...sections,
    })
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('EXPECTED_OVERLAY_SHA', '');
  return fetch;
};
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('precompute overlay compatibility', () => {
  it.each([{}, { taskIdAliases: inactiveAliases }])(
    'publishes the full fleet and import snapshots with an absent or inactive alias ledger: %j',
    async (sections) => {
      const fetch = stubOverlay(sections);
      const { runPrecompute } = await import('@@/scripts/precompute/precompute');
      const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
      const put = vi.fn();
      const core = await runPrecompute({ put });
      expect(core.failures).toEqual([]);
      expect(core.successes).toHaveLength(48);
      expect(core.manifest).toHaveLength(48);
      const imports = await runImportPrecompute({ put }, {}, core.manifest[0]?.overlay.sha256);
      expect(imports.failures).toEqual([]);
      expect(imports.successes).toHaveLength(3);
      expect(put).toHaveBeenCalledTimes(52);
      expect(fetch).toHaveBeenCalledTimes(1);
      for (const [key, value] of put.mock.calls) {
        if (key === 'overlay-precompute-manifest-json-v3') continue;
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
      const { runPrecompute } = await import('@@/scripts/precompute/precompute');
      const { runImportPrecompute } = await import('@@/scripts/precompute/import-snapshots');
      const put = vi.fn();
      const core = await runPrecompute({ put }, { lang: 'en', gameMode: 'regular' });
      expect(core.successes).toEqual([]);
      expect(core.failures).toEqual([
        {
          key: 'tasks-core-json-v3-en-regular',
          error: 'Unconsumed overlay sections: taskIdAliases',
        },
      ]);
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
    const { runPrecompute } = await import('@@/scripts/precompute/precompute');
    const put = vi.fn();
    const result = await runPrecompute({ put }, { lang: 'en', gameMode: 'regular' });
    expect(result.failures).toHaveLength(1);
    expect(put).not.toHaveBeenCalled();
  });
});
