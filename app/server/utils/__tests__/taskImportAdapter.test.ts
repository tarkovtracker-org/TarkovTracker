import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
import {
  adaptTasksImportResponse,
  createTarkovJsonTasksImportFetcher,
} from '@/server/utils/tarkov-json';
import { isTaskImportCatalog } from '@/utils/taskImportCatalog';
const source = {
  tasks: {
    task: {
      id: 'task',
      minPlayerLevel: 5,
      objectives: [{ id: 'obj', type: 'giveItem', count: 2 }],
      failConditions: [{ id: 'fail', type: 'giveItem', count: 1 }],
    },
    retired: { id: 'retired', objectives: [], failConditions: [] },
  },
};
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('coherent import adaptation', () => {
  it('projects core, objectives and fail conditions from the same raw task record', () => {
    const task = adaptTasksImportResponse(source).data.tasks[0]!;
    expect(task).toMatchObject({
      id: 'task',
      minPlayerLevel: 5,
      objectives: [{ id: 'obj', count: 2 }],
      failConditions: [{ id: 'fail', count: 1 }],
    });
  });
  it.each(['regular', 'pve', 'pvp-season'] as const)(
    'fetches one %s task set and applies one private overlay to all fields',
    async (gameMode) => {
      const fetcher = vi.fn(async (url: string) => {
        const data = url.endsWith('/tasks') ? source : {};
        return { data, translations: [] };
      });
      const base = await createTarkovJsonTasksImportFetcher({
        gameMode,
        lang: 'en',
        deps: { fetcher: fetcher as never },
      })();
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(
        fetcher.mock.calls.filter(([url]) => url === `https://json.tarkov.dev/${gameMode}/tasks`)
      ).toHaveLength(1);
      const token = 'synthetic-import-token';
      vi.stubEnv('OVERLAY_TOKEN', token);
      vi.stubEnv(
        'OVERLAY_URL',
        'https://raw.githubusercontent.com/example/private/main/overlay.json'
      );
      const overlay = {
        editions: {
          ...testOverlayEditions,
          standard: { ...testOverlayEditions.standard, title: 'raw-editions-only' },
        },
        $meta: { version: 'import-v1', sha256: 'sha1', generated: '2026-10-12' },
        tasks: {
          task: {
            minPlayerLevel: 25,
            objectives: [{ id: 'obj', type: 'giveItem', count: 9 }],
            failConditions: [{ id: 'fail', type: 'giveItem', count: 3 }],
            taskRequirements: [{ task: { id: 'gate' }, status: ['complete'] }],
          },
          retired: { disabled: true },
        },
        tasksAdd: {
          added: {
            id: 'added',
            objectives: [{ id: 'added-obj', type: 'giveItem', count: 4 }],
            failConditions: [],
          },
        },
      };
      const network = vi.fn(async () => new Response(JSON.stringify(overlay)));
      vi.stubGlobal('fetch', network);
      const { applyOverlay } = await import('@/server/utils/overlay');
      const snapshot = {
        ...(await applyOverlay(base, { gameMode, locale: 'en' })),
        catalog: { lang: 'en', gameMode },
      };
      expect(isTaskImportCatalog(snapshot, gameMode)).toBe(true);
      expect(snapshot.data.tasks.map((task) => task.id)).toEqual(['task', 'added']);
      expect(snapshot.data.tasks[0]).toMatchObject({
        minPlayerLevel: 25,
        objectives: [{ id: 'obj', count: 9 }],
        failConditions: [{ id: 'fail', count: 3 }],
        taskRequirements: [{ task: { id: 'gate' } }],
      });
      expect(network).toHaveBeenCalledTimes(1);
      expect(network).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        })
      );
      expect(JSON.stringify(snapshot)).not.toContain(token);
      expect(JSON.stringify(snapshot)).not.toContain('raw-editions-only');
    }
  );
});
