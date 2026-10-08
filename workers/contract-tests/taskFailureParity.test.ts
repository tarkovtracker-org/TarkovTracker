// Cross-runtime tests remain outside app TypeScript: Worker ambient globals and Nuxt aliases differ.
import { readFileSync } from 'node:fs';
import { computeInvalidProgress } from '@tarkovtracker/progress-contracts/progressInvalidation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { computeStreamerKappaMetrics } from '@/server/utils/streamerKappa';
import { adaptTaskObjectivesResponse, adaptTasksCoreResponse } from '@/server/utils/tarkov-json';
import type { GameMode } from '~~/workers/api-gateway/src/types';
import fixture from '@tarkovtracker/progress-contracts/fixtures/task-failure-branches.json';
import { getHideoutStations, getTasks } from '~~/workers/api-gateway/src/services/tarkov';
import { deleteMemoryCache } from '~~/workers/api-gateway/src/utils/memory-cache';
import { getTaskCatalogInvalidator } from '~~/workers/api-gateway/src/utils/task-catalog';
vi.mock('cloudflare:workers', () => ({
  waitUntil: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
}));
type Payload = Parameters<typeof adaptTasksCoreResponse>[0];
const sourceId = '597a0f5686f774273b74f676';
const targetId = '597a160786f77477531d39d2';
const hydrate = (payload: Payload) => {
  const core = adaptTasksCoreResponse(payload, { maps: {} }, {}).data.tasks;
  const objectives = new Map(
    adaptTaskObjectivesResponse(payload).data.tasks.map((task) => [task.id, task])
  );
  return useGraphBuilder().processTaskData(
    core.map((task) => ({ ...task, ...objectives.get(task.id) }))
  ).tasks;
};
const modes: GameMode[] = ['pvp', 'pve', 'seasonal'];
describe('browser and Worker failure-rule parity', () => {
  beforeEach(() => {
    for (const mode of ['regular', 'pve', 'pvp-season']) deleteMemoryCache(`tarkov:tasks:${mode}`);
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each(modes)('invalidates the captured branch with hydrated objectives in %s', async (mode) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(fixture))
    );
    const browser = hydrate(fixture.data);
    const worker = await getTasks(mode);
    const state = { pmcFaction: 'USEC', taskCompletions: { [sourceId]: { complete: true } } };
    const expected = computeInvalidProgress({ tasks: browser, ...state });
    expect(expected.invalidTasks[targetId]).toBe(true);
    expect(browser.find((task) => task.id === targetId)!.objectives!.length).toBeGreaterThan(0);
    expect(expected.invalidObjectives).not.toEqual({});
    expect(computeInvalidProgress({ tasks: worker, ...state })).toEqual(expected);
    expect(getTaskCatalogInvalidator(worker)!(state)).toEqual(expected);
    const streamer = computeStreamerKappaMetrics({
      tasks: browser.map((task) => ({ ...task, kappaRequired: true })),
      taskCompletions: state.taskCompletions,
      taskObjectives: {},
      pmcFaction: 'USEC',
      editions: [],
      gameEdition: 1,
      neededItemTaskObjectives: [],
    });
    expect(streamer.tasks).toMatchObject({ completed: 1, total: 1, remaining: 0 });
  });
  it.each(modes)(
    'preserves directed edges, failed prerequisites, cycles and unrelated tasks in %s',
    async (mode) => {
      const task = (
        id: string,
        taskRequirements: object[] = [],
        failConditions: object[] = []
      ) => ({
        id,
        name: id,
        objectives: [{ id: id + '-objective' }],
        taskRequirements,
        failConditions,
      });
      const payload = {
        tasks: {
          A: task('A'),
          B: task(
            'B',
            [{ task: 'C', status: ['complete'] }],
            [{ id: 'B-fail', task: 'A', status: ['Completed'] }]
          ),
          C: task('C', [{ task: 'B', status: ['complete'] }]),
          P: task('P'),
          strict: task('strict', [{ task: 'P', status: ['complete'] }]),
          acceptedFailed: task('acceptedFailed', [{ task: 'P', status: ['complete', 'failed'] }]),
          unrelated: task('unrelated'),
          missing: task(
            'missing',
            [],
            [{ id: 'missing-fail', task: 'absent', status: ['complete'] }]
          ),
        },
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ data: payload }))
      );
      const browser = hydrate(payload);
      const worker = await getTasks(mode);
      const state = {
        pmcFaction: 'USEC',
        taskCompletions: { A: { complete: true }, P: { failed: true } },
      };
      const expected = computeInvalidProgress({ tasks: browser, ...state });
      expect(expected.invalidTasks).toEqual({ B: true, C: true, strict: true });
      expect(expected.invalidObjectives).toEqual({
        'B-objective': true,
        'C-objective': true,
        'strict-objective': true,
      });
      expect(getTaskCatalogInvalidator(worker)!(state)).toEqual(expected);
      const reverse = { pmcFaction: 'USEC', taskCompletions: { B: { complete: true } } };
      expect(computeInvalidProgress({ tasks: browser, ...reverse }).invalidTasks.A).toBeUndefined();
      expect(getTaskCatalogInvalidator(worker)!(reverse)).toEqual(
        computeInvalidProgress({ tasks: browser, ...reverse })
      );
    }
  );
  it('keeps core-only metadata insufficient until fail-condition hydration', () => {
    const core = adaptTasksCoreResponse(fixture.data, { maps: {} }, {}).data.tasks;
    const state = { pmcFaction: 'USEC', taskCompletions: { [sourceId]: { complete: true } } };
    expect(
      computeInvalidProgress({ tasks: useGraphBuilder().processTaskData(core).tasks, ...state })
        .invalidTasks[targetId]
    ).toBeUndefined();
    expect(
      computeInvalidProgress({ tasks: hydrate(fixture.data), ...state }).invalidTasks[targetId]
    ).toBe(true);
  });
  it.skipIf(!process.env.TARKOV_PARITY_CAPTURE_DIRECTORY)(
    'accepts all current public task and hideout catalog shapes',
    async () => {
      for (const [mode, upstream] of [
        ['pvp', 'regular'],
        ['pve', 'pve'],
        ['seasonal', 'pvp-season'],
      ] as const) {
        const tasks = JSON.parse(
          readFileSync(
            process.env.TARKOV_PARITY_CAPTURE_DIRECTORY + '/' + upstream + '-tasks.json',
            'utf8'
          )
        ) as { data: Payload };
        const hideout = JSON.parse(
          readFileSync(
            process.env.TARKOV_PARITY_CAPTURE_DIRECTORY + '/' + upstream + '-hideout.json',
            'utf8'
          )
        ) as { data: Record<string, unknown> };
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL) =>
            Response.json(String(input).endsWith('/tasks') ? tasks : hideout)
          )
        );
        expect(await getTasks(mode)).toHaveLength(
          Object.keys(tasks.data.tasks as Record<string, unknown>).length
        );
        expect(await getHideoutStations(mode)).toHaveLength(Object.keys(hideout.data).length);
      }
    }
  );
  // Optional full-catalog probe uses consumer-local public captures; CI runs the compact fixture.
  it.skipIf(!process.env.TARKOV_PARITY_CAPTURE_DIRECTORY)(
    'matches all captured public modes and each successful branch source',
    async () => {
      for (const [mode, upstream] of [
        ['pvp', 'regular'],
        ['pve', 'pve'],
        ['seasonal', 'pvp-season'],
      ] as const) {
        const envelope = JSON.parse(
          readFileSync(
            `${process.env.TARKOV_PARITY_CAPTURE_DIRECTORY}/${upstream}-tasks.json`,
            'utf8'
          )
        ) as { data: Payload };
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => Response.json(envelope))
        );
        const browser = hydrate(envelope.data);
        const worker = await getTasks(mode);
        expect(worker).toHaveLength(browser.length);
        const branchSources = browser.filter((task) => task.alternatives?.length);
        expect(branchSources.length).toBeGreaterThan(0);
        console.info(
          `Public capture parity: ${mode}, tasks=${browser.length}, branch sources=${branchSources.length}`
        );
        for (const task of branchSources) {
          const state = { pmcFaction: 'USEC', taskCompletions: { [task.id]: { complete: true } } };
          expect(getTaskCatalogInvalidator(worker)!(state), `${mode}/${task.id}`).toEqual(
            computeInvalidProgress({ tasks: browser, ...state })
          );
        }
      }
    }
  );
});
