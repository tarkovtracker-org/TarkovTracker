import { describe, expect, it } from 'vitest';
import { sortTasks, sortTasksByProgression, sortTasksByTrader } from '@/utils/taskSorter';
import type { TaskBlocker, TaskEvaluationMap } from '@/stores/taskAvailability';
import type { Task } from '@/types/tarkov';
const task = (id: string, overrides: Partial<Task> = {}): Task => ({ id, name: id, ...overrides });
const blocked = (...blockers: TaskBlocker[]) => ({ available: false, blockers });
const available = { available: true, blockers: [] };
describe('progression sorting', () => {
  const evaluations: TaskEvaluationMap = {
    ready: { self: available },
    near: { self: blocked({ type: 'trader_level', current: 2, required: 3 }) },
    far: { self: blocked({ type: 'player_level', current: 1, required: 40 }) },
    chain: { self: blocked({ type: 'prerequisite', requirements: [{ task: { id: 'prior' } }] }) },
    multiple: { self: blocked({ type: 'player_level' }, { type: 'trader_reputation' }) },
    complete: { self: blocked({ type: 'complete' }) },
    failed: { self: blocked({ type: 'failed' }) },
    unknown: { self: blocked({ type: 'unknown' }) },
  };
  it('orders canonical readiness and uses the reverse ordering for descending', () => {
    const ids = Object.keys(evaluations);
    const tasks = ids.toReversed().map((id) => task(id));
    expect(sortTasksByProgression(tasks, 'asc', evaluations).map((t) => t.id)).toEqual(ids);
    expect(sortTasksByProgression(tasks, 'desc', evaluations).map((t) => t.id)).toEqual(
      ids.toReversed()
    );
  });
  it.each([1, 2])('ranks strict loyalty using the next attainable level from LL%s', (current) => {
    const evaluations: TaskEvaluationMap = {
      a: { self: blocked({ type: 'trader_level', current, required: 3, compareMethod: '>=' }) },
      z: { self: blocked({ type: 'trader_level', current, required: 2, compareMethod: '>' }) },
    };
    expect(
      sortTasksByProgression([task('z'), task('a')], 'asc', evaluations).map((t) => t.id)
    ).toEqual(['a', 'z']);
  });
  it('uses only selected team members and the best visible readiness', () => {
    const data = { ...evaluations, far: { self: evaluations.far!.self!, teammate: available } };
    const tasks = [task('near'), task('far')];
    expect(sortTasksByProgression(tasks, 'asc', data, ['self']).map((t) => t.id)).toEqual([
      'near',
      'far',
    ]);
    expect(
      sortTasksByProgression(tasks, 'asc', data, ['self', 'teammate']).map((t) => t.id)
    ).toEqual(['far', 'near']);
  });
  it('breaks equal names deterministically by ID without mutating input', () => {
    const tasks = [task('b', { name: 'Same' }), task('a', { name: 'Same' })];
    expect(sortTasksByProgression(tasks, 'asc').map((t) => t.id)).toEqual(['a', 'b']);
    expect(tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('groups only the task trader loyalty requirement before readiness', () => {
    const trader = { id: 'prapor', name: 'Prapor' };
    const own = task('own', {
      trader,
      minPlayerLevel: 1,
      normalizedTraderRequirements: [
        { id: 'own-ll', trader, value: 3, compareMethod: '>=', requirementType: 'level' },
      ],
    });
    const other = task('other', {
      trader,
      minPlayerLevel: 99,
      normalizedTraderRequirements: [
        {
          id: 'other-ll',
          trader: { id: 'fence', name: 'Fence' },
          value: 4,
          compareMethod: '>=',
          requirementType: 'level',
        },
      ],
    });
    expect(
      sortTasksByTrader([own, other], new Map([['prapor', 0]]), 1, 'asc').map((t) => t.id)
    ).toEqual(['other', 'own']);
  });
});
it('dispatches progression and trader sorts with the selected team readiness', () => {
  const tasks = [task('blocked'), task('ready')];
  const config = {
    evaluations: {
      blocked: { teammate: blocked({ type: 'player_level', required: 10 }) },
      ready: { teammate: available },
    },
    teamIds: ['teammate'],
    progressData: { tasksCompletions: {}, tasksFailed: {}, unlockedTasks: {} },
    traderOrderMap: new Map<string, number>(),
    defaultTraderOrder: 1,
  };
  for (const mode of ['progression', 'trader'] as const)
    expect(sortTasks(tasks, mode, 'asc', config).map((entry) => entry.id)).toEqual([
      'ready',
      'blocked',
    ]);
});
