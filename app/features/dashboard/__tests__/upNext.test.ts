import { describe, expect, it } from 'vitest';
import {
  lockedTraderUnlockTaskIds,
  opensCount,
  pickClosestBlocked,
  rankUpNext,
  type UpNextContext,
} from '@/features/dashboard/upNext';
import type { TaskAvailabilityResult, TaskBlocker } from '@/stores/taskAvailability';
import type { Task } from '@/types/tarkov';
const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, name: id, objectives: [{ id: `${id}-1` }, { id: `${id}-2` }], ...extra }) as Task;
const waitsOn = (...ids: string[]): TaskAvailabilityResult => ({
  available: false,
  blockers: [{ type: 'prerequisite', requirements: ids.map((id) => ({ task: { id } })) }],
});
const blocked = (...blockers: TaskBlocker[]): TaskAvailabilityResult => ({
  available: false,
  blockers,
});
const context = (
  evaluations: Record<string, TaskAvailabilityResult> = {},
  overrides: Partial<UpNextContext> = {}
): UpNextContext => ({
  evaluation: (id) => evaluations[id],
  isObjectiveComplete: () => false,
  unlockTraders: new Map(),
  ...overrides,
});
describe('opensCount', () => {
  it('counts only children whose sole gate is this task', () => {
    const parent = task('parent', { children: ['a', 'b', 'c', 'd'] });
    const evaluations = {
      a: waitsOn('parent'),
      b: waitsOn('parent', 'other'),
      c: blocked(...waitsOn('parent').blockers, { type: 'player_level', required: 40 }),
      d: { available: true, blockers: [] },
    };
    expect(opensCount(parent, context(evaluations).evaluation)).toBe(1);
  });
  it('falls back to successors when children are missing', () => {
    const parent = task('parent', { successors: ['a'] });
    expect(opensCount(parent, context({ a: waitsOn('parent') }).evaluation)).toBe(1);
  });
});
describe('lockedTraderUnlockTaskIds', () => {
  it('keeps unlock tasks only for traders that are still locked', () => {
    const map = lockedTraderUnlockTaskIds(
      [
        { id: 'jaeger', name: 'Jaeger', unlockTaskIds: ['intro', 'reward'] },
        { id: 'ref', name: 'Ref', unlockTaskIds: ['ref-task'] },
        { id: 'prapor', name: 'Prapor', unlockTaskIds: [] },
      ],
      (id) => id === 'ref-task'
    );
    expect([...map]).toEqual([
      ['intro', 'Jaeger'],
      ['reward', 'Jaeger'],
    ]);
  });
});
describe('rankUpNext', () => {
  it('orders by reason weight and caps the list', () => {
    const tasks = [
      task('plain'),
      task('kappa', { kappaRequired: true }),
      task('lk', { lightkeeperRequired: true }),
      task('opener', { children: ['child'] }),
      task('unlock'),
    ];
    const items = rankUpNext(
      tasks,
      context({ child: waitsOn('opener') }, { unlockTraders: new Map([['unlock', 'Jaeger']]) })
    );
    expect(items.map((item) => [item.taskId, item.reason])).toEqual([
      ['unlock', 'unlock-trader'],
      ['opener', 'opens'],
      ['lk', 'lightkeeper'],
      ['kappa', 'kappa'],
    ]);
  });
  it('derives progress reasons and breaks ties by name', () => {
    const done = new Set(['started-1', 'almost-1']);
    const items = rankUpNext(
      [
        task('b-fresh'),
        task('a-fresh'),
        task('started', {
          objectives: [{ id: 'started-1' }, { id: 's2' }, { id: 's3' }],
        } as Partial<Task>),
        task('almost'),
      ],
      context({}, { isObjectiveComplete: (id) => done.has(id) })
    );
    expect(items.map((item) => [item.taskId, item.reason])).toEqual([
      ['almost', 'almost-done'],
      ['started', 'in-progress'],
      ['a-fresh', 'ready'],
      ['b-fresh', 'ready'],
    ]);
  });
  it('ignores optional objectives when counting progress', () => {
    const [item] = rankUpNext(
      [task('t', { objectives: [{ id: 'req' }, { id: 'opt', optional: true }] } as Partial<Task>)],
      context()
    );
    expect(item?.progress).toEqual({ completed: 0, remaining: 1, total: 1 });
  });
});
describe('pickClosestBlocked', () => {
  it('keeps tasks with exactly one actionable gate', () => {
    const items = pickClosestBlocked(
      [task('level'), task('double'), task('done'), task('unknown')],
      context({
        level: blocked({ type: 'player_level', required: 15 }),
        double: blocked({ type: 'player_level' }, { type: 'trader_level' }),
        done: blocked({ type: 'complete' }),
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      taskId: 'level',
      reason: 'blocked',
      blocker: { type: 'player_level' },
    });
  });
});
