import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
import { adaptTasksCoreResponse } from '@/server/utils/tarkov-json';
import { buildTaskEvaluations, type TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import { buildPrestigeTaskMap } from '@/utils/prestige';
import type { Task } from '@/types/tarkov';
/**
 * A declared gate that cannot be interpreted must reach the evaluator as a diagnostic. Absence of
 * an optional gate and a malformed explicit gate are not allowed to become indistinguishable,
 * because the second one silently unlocks the task.
 */
const mapsPayload = { maps: { map1: { id: 'map1', name: 'Customs' } } };
const tradersPayload = { trader1: { id: 'trader1', name: 'Prapor' } };
const adaptTask = (raw: Record<string, unknown>): Task => {
  const tasks = { target: { id: 'target', name: 'Target', trader: 'trader1', ...raw } };
  const [task] = adaptTasksCoreResponse({ tasks }, mapsPayload, tradersPayload).data.tasks;
  return task!;
};
const progress = (overrides: Partial<TaskAvailabilityTeamData> = {}): TaskAvailabilityTeamData => ({
  completions: {},
  faction: 'USEC',
  level: 99,
  mode: 'pvp',
  traders: {},
  prestigeLevel: 0,
  storyChapters: {},
  ...overrides,
});
const evaluate = (task: Task, data = progress(), others: Task[] = []) =>
  buildTaskEvaluations([task, ...others], new Map([['self', data]]), {
    requireTraderLevels: false,
  })[task.id]!.self!;
const stubOverlayFetch = (overlay: Record<string, unknown>) => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ editions: testOverlayEditions, ...overlay }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
  );
  vi.stubGlobal('fetch', fetchMock as typeof fetch);
};
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});
describe('malformed declared prerequisite collections', () => {
  it('blocks with an unknown diagnostic instead of discarding a non-array collection', () => {
    const task = adaptTask({ taskRequirements: { task: 'missing', status: ['complete'] } });
    expect(task.taskRequirements).toBeUndefined();
    expect(task.requirementDiagnostics).toEqual(['task_requirement']);
    expect(evaluate(task)).toEqual({
      available: false,
      blockers: [{ type: 'unknown', reason: 'task_requirement' }],
    });
  });
  it.each([
    ['a bare id string', 'task0'],
    ['a number', 7],
    ['a boolean', true],
  ])('blocks a declared collection serialized as %s', (_label, taskRequirements) => {
    const task = adaptTask({ taskRequirements });
    expect(task.requirementDiagnostics).toEqual(['task_requirement']);
    expect(evaluate(task).available).toBe(false);
  });
  it('keeps a genuinely absent or empty collection unlocked', () => {
    for (const raw of [{}, { taskRequirements: null }, { taskRequirements: [] }]) {
      const task = adaptTask(raw);
      expect(task.requirementDiagnostics).toBeUndefined();
      expect(evaluate(task).available).toBe(true);
    }
  });
  it('retains the legacy bare-string prerequisite reference', () => {
    const task = adaptTask({ taskRequirements: [{ task: 'prior', status: ['complete'] }] });
    expect(task.taskRequirements).toEqual([{ task: { id: 'prior' }, status: ['complete'] }]);
    const prior: Task = { id: 'prior' };
    expect(evaluate(task, progress(), [prior]).available).toBe(false);
    expect(
      evaluate(task, progress({ completions: { prior: { complete: true } } }), [prior]).available
    ).toBe(true);
  });
  it('lets a satisfied story route still unlock a task with a malformed collection', () => {
    const task = adaptTask({ taskRequirements: { task: 'missing' } });
    task.storyUnlocks = [{ id: 'chapter-1', name: 'Batya' }];
    expect(evaluate(task).available).toBe(false);
    expect(
      evaluate(task, progress({ storyChapters: { 'chapter-1': { complete: true } } })).available
    ).toBe(true);
  });
  it('survives a non-array collection that reaches the evaluator from a stale payload', () => {
    const stale = { id: 'target', taskRequirements: { task: 'missing' } } as unknown as Task;
    expect(evaluate(stale)).toEqual({
      available: false,
      blockers: [{ type: 'unknown', reason: 'task_requirement' }],
    });
  });
});
describe('malformed declared prestige references', () => {
  it('blocks with an unknown diagnostic instead of discarding an id-less reference', () => {
    const task = adaptTask({ requiredPrestige: { unexpected: 'prestige-id' } });
    expect(task.requiredPrestige).toBeUndefined();
    expect(task.requirementDiagnostics).toEqual(['prestige_reference']);
    expect(evaluate(task)).toEqual({
      available: false,
      blockers: [{ type: 'unknown', reason: 'prestige_reference' }],
    });
  });
  it.each([
    ['an empty object', {}],
    ['an empty string', ''],
    ['an empty id', { id: '' }],
    ['a blank id', { id: '   ' }],
    ['an object id', { id: {} }],
    ['a number', 3],
    ['a list', ['prestige-1']],
  ])('blocks a declared prestige reference serialized as %s', (_label, requiredPrestige) => {
    const task = adaptTask({ requiredPrestige });
    expect(task.requirementDiagnostics).toEqual(['prestige_reference']);
    expect(evaluate(task).available).toBe(false);
  });
  it.each([0, 4, 5])(
    'blocks a malformed gate despite an inferred level at prestige %i',
    (prestigeLevel) => {
      const task = adaptTask({
        id: 'new_beginning_prestige_5',
        requiredPrestige: { unexpected: 'prestige-id' },
        storyUnlocks: [{ id: 'chapter-1', name: 'Batya' }],
      });
      const prestigeTaskMap = buildPrestigeTaskMap([task], []);
      expect(prestigeTaskMap.get(task.id)).toBe(4);
      const evaluated = buildTaskEvaluations(
        [task],
        new Map([
          ['self', progress({ prestigeLevel, storyChapters: { 'chapter-1': { complete: true } } })],
        ]),
        { requireTraderLevels: false, prestigeTaskMap }
      )[task.id]!.self!;
      expect(evaluated).toEqual({
        available: false,
        blockers: [{ type: 'unknown', reason: 'prestige_reference' }],
      });
    }
  );
  it('still coerces a numeric id rather than narrowing a supported shape', () => {
    const task = adaptTask({ requiredPrestige: { id: 42 } });
    expect(task.requiredPrestige).toEqual({ id: '42' });
    expect(task.requirementDiagnostics).toBeUndefined();
  });
  // A stale payload can still carry a declared falsy reference the adapter would now drop.
  it.each([[''], [0], [false]])(
    'blocks a declared falsy reference reaching the evaluator as %p',
    (requiredPrestige) => {
      const stale = { id: 'target', requiredPrestige } as unknown as Task;
      expect(evaluate(stale)).toEqual({
        available: false,
        blockers: [{ type: 'unknown', reason: 'prestige_reference' }],
      });
    }
  );
  it('keeps a genuinely absent reference unlocked', () => {
    for (const raw of [{}, { requiredPrestige: null }]) {
      const task = adaptTask(raw);
      expect(task.requirementDiagnostics).toBeUndefined();
      expect(evaluate(task).available).toBe(true);
    }
  });
  it.each([
    ['a bare id string', 'prestige1'],
    ['an object ref', { id: 'prestige1' }],
  ])('retains the supported %s reference', (_label, requiredPrestige) => {
    const task = adaptTask({ requiredPrestige });
    expect(task.requiredPrestige).toEqual({ id: 'prestige1' });
    expect(task.requirementDiagnostics).toBeUndefined();
    const options = { requireTraderLevels: false, prestigeTaskMap: new Map([['target', 1]]) };
    const evaluated = buildTaskEvaluations(
      [task],
      new Map([['self', progress({ prestigeLevel: 1 })]]),
      options
    );
    expect(evaluated.target!.self!.available).toBe(true);
  });
  // The adapter can only store an id reference, so an id-less one is a loss and must be reported.
  // The overlay keeps the same shape verbatim instead, which is covered below.
  it('reports an id-less reference the adapter cannot store', () => {
    const task = adaptTask({ requiredPrestige: { name: 'Prestige 4', prestigeLevel: 4 } });
    expect(task.requiredPrestige).toBeUndefined();
    expect(task.requirementDiagnostics).toEqual(['prestige_reference']);
    expect(evaluate(task).available).toBe(false);
  });
  it('reports both malformed gates on the same task', () => {
    const task = adaptTask({
      requiredPrestige: { unexpected: 'prestige-id' },
      taskRequirements: { task: 'missing' },
    });
    expect(task.requirementDiagnostics).toEqual(['task_requirement', 'prestige_reference']);
    expect(evaluate(task).blockers).toEqual(
      expect.arrayContaining([
        { type: 'unknown', reason: 'task_requirement' },
        { type: 'unknown', reason: 'prestige_reference' },
      ])
    );
    expect(evaluate(task).blockers).toHaveLength(2);
  });
});
describe('overlay declared-gate normalization', () => {
  const overlayMeta = {
    $meta: { generated: '2026-09-10T00:00:00.000Z', sha256: 'gate-sha', version: 'gate-v1' },
  };
  /** Apply one overlay over one base task and return the corrected task. */
  const correct = async (
    overlay: Record<string, unknown>,
    base: Array<Record<string, unknown>>
  ): Promise<Task> => {
    stubOverlayFetch({ ...overlayMeta, ...overlay });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay({ data: { tasks: base as Array<{ id: string }> } });
    return result.data!.tasks![0] as unknown as Task;
  };
  const brokenTask = () =>
    adaptTask({
      requiredPrestige: { unexpected: 'prestige-id' },
      taskRequirements: { task: 'missing' },
    }) as unknown as Record<string, unknown>;
  const baseTask = (raw: Record<string, unknown> = {}) =>
    adaptTask(raw) as unknown as Record<string, unknown>;
  it('diagnoses a malformed gate introduced by a task correction', async () => {
    // deepMerge treats an object patch over an existing array as an id-keyed patch map, so the
    // reachable case is a correction that declares a gate the adapted task does not carry.
    const patch = {
      requiredPrestige: { unexpected: 'prestige-id' },
      taskRequirements: { task: 'missing' },
    };
    const task = await correct({ tasks: { target: patch } }, [baseTask()]);
    expect(task.taskRequirements).toBeUndefined();
    expect(task.requiredPrestige).toBeUndefined();
    expect(task.requirementDiagnostics).toEqual(['task_requirement', 'prestige_reference']);
    expect(evaluate(task).available).toBe(false);
  });
  it.each(['ordinary', 'locale'])(
    'ignores diagnostic overrides in %s corrections',
    async (scope) => {
      const patch = { name: 'Renamed', requirementDiagnostics: [] };
      const tasks = { target: patch };
      const overlay = scope === 'locale' ? { locales: { en: { tasks } } } : { tasks };
      const task = await correct(overlay, [brokenTask()]);
      expect(task.requirementDiagnostics).toEqual(['task_requirement', 'prestige_reference']);
      expect(evaluate(task).available).toBe(false);
    }
  );
  it.each(['ordinary', 'locale'])(
    'retains untouched diagnostics when %s corrections repair one gate',
    async (scope) => {
      const tasks = { target: { taskRequirements: [], requirementDiagnostics: [] } };
      const overlay = scope === 'locale' ? { locales: { en: { tasks } } } : { tasks };
      const task = await correct(overlay, [brokenTask()]);
      expect(task.requirementDiagnostics).toEqual(['prestige_reference']);
      expect(evaluate(task).available).toBe(false);
    }
  );
  it('normalizes an ordinary correction using its original task id', async () => {
    const patch = { id: 'renamed', requiredPrestige: {}, taskRequirements: {} };
    const task = await correct({ tasks: { target: patch } }, [baseTask()]);
    expect(task.id).toBe('renamed');
    expect(task.requirementDiagnostics).toEqual(['task_requirement', 'prestige_reference']);
    expect(evaluate(task).available).toBe(false);
  });
  it('clears an adapter diagnostic when a correction repairs the gate', async () => {
    const patch = { requiredPrestige: 'prestige1', taskRequirements: [] };
    const task = await correct({ tasks: { target: patch } }, [brokenTask()]);
    expect(task.requirementDiagnostics).toBeUndefined();
    expect(task.requiredPrestige).toEqual({ id: 'prestige1' });
    expect(task.taskRequirements).toEqual([]);
  });
  // A correction may only clear the diagnostic for the gate it actually rewrites. The adapter has
  // already dropped the other malformed value, so a recomputation alone cannot re-detect it.
  it.each([
    ['a prestige correction over a prerequisite diagnostic', 'requiredPrestige', 'prestige1'],
    ['a prerequisite correction over a prestige diagnostic', 'taskRequirements', []],
  ])('retains the untouched gate diagnostic under %s', async (_label, field, value) => {
    const task = await correct({ tasks: { target: { [field]: value } } }, [brokenTask()]);
    const retained =
      field === 'requiredPrestige' ? 'task_requirement' : ('prestige_reference' as const);
    expect(task.requirementDiagnostics).toEqual([retained]);
    const evaluated = evaluate(task);
    expect(evaluated.available).toBe(false);
    expect(evaluated.blockers).toContainEqual({ type: 'unknown', reason: retained });
  });
  it('preserves an adapter diagnostic when a correction ignores the gate', async () => {
    const broken = adaptTask({ taskRequirements: { task: 'missing' } });
    const task = await correct({ tasks: { target: { name: 'Renamed' } } }, [
      broken as unknown as Record<string, unknown>,
    ]);
    expect(task.requirementDiagnostics).toEqual(['task_requirement']);
    expect(evaluate(task).available).toBe(false);
  });
  it('diagnoses a malformed gate on an overlay-injected task', async () => {
    const added = { id: 'added', name: 'Added', taskRequirements: { task: 'missing' } };
    const task = await correct({ tasksAdd: { added } }, []);
    expect(task.id).toBe('added');
    expect(task.taskRequirements).toBeUndefined();
    expect(task.requirementDiagnostics).toEqual(['task_requirement']);
    expect(evaluate(task).available).toBe(false);
  });
  // The published overlay declares injected prestige gates this way. `applyOverlay` keeps the
  // reference verbatim, so nothing is lost and the level still resolves from the task id.
  it('accepts the id-less prestige reference the overlay injects', async () => {
    const requiredPrestige = { name: 'Prestige 4', prestigeLevel: 4 };
    const added = { id: 'new_beginning_prestige_5', name: 'New Beginning', requiredPrestige };
    const task = await correct({ tasksAdd: { new_beginning_prestige_5: added } }, []);
    expect(task.requirementDiagnostics).toBeUndefined();
    expect(task.requiredPrestige).toEqual(requiredPrestige);
    const prestigeTaskMap = buildPrestigeTaskMap([task], []);
    expect(prestigeTaskMap.get(task.id)).toBe(4);
    expect(
      buildTaskEvaluations([task], new Map([['self', progress({ prestigeLevel: 4 })]]), {
        requireTraderLevels: false,
        prestigeTaskMap,
      })[task.id]!.self!.available
    ).toBe(true);
  });
  // Locale corrections are applied last, so a gate one of them declares needs the same treatment.
  // The patch is keyed by the pre-patch id, so one that also rewrites `id` must still be seen.
  it.each([
    ['a locale correction', { taskRequirements: { task: 'missing' } }, 'target'],
    [
      'a locale correction that rewrites the task id',
      { id: 'renamed', taskRequirements: {} },
      'renamed',
    ],
  ])('diagnoses a malformed gate introduced by %s', async (_label, patch, expectedId) => {
    const task = await correct({ locales: { en: { tasks: { target: patch } } } }, [baseTask()]);
    expect(task.id).toBe(expectedId);
    expect(task.taskRequirements).toBeUndefined();
    expect(task.requirementDiagnostics).toEqual(['task_requirement']);
    expect(evaluate(task).available).toBe(false);
  });
  it.each([
    ['a task correction', { tasks: { target: { name: 'Renamed' } } }, 'Renamed'],
    [
      'a locale correction',
      { locales: { en: { tasks: { target: { name: 'Localized' } } } } },
      'Localized',
    ],
  ])('leaves %s free of a fabricated diagnostic', async (_label, overlay, expectedName) => {
    const task = await correct(overlay, [baseTask({ requiredPrestige: 'prestige1' })]);
    expect(task.name).toBe(expectedName);
    expect(task.requiredPrestige).toEqual({ id: 'prestige1' });
    expect(task.requirementDiagnostics).toBeUndefined();
  });
});
