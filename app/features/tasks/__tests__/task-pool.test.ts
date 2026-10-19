import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  poolContributorGroups,
  poolProgressLabel,
  poolRequirementLabel,
  type PoolTaskContext,
} from '@/features/tasks/task-pool';
import type { RequirementComparison, TaskProgressionPool } from '@/types/tarkov';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
const t = (key: string, params: Record<string, unknown> = {}): string => {
  const text = key.split('.').reduce((value, part) => value[part], en) as string;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
};
const pool: TaskProgressionPool = {
  traderId: 'mechanic',
  loyaltyLevel: 2,
  verification: 'verified',
  coverage: 'complete',
  derivation: { type: 'distinctTaskCompletions', taskIds: ['a', 'b'] },
};
describe('task pool presentation', () => {
  it.each([
    ['>=', 'at least'],
    ['>', 'more than'],
    ['<=', 'at most'],
    ['<', 'fewer than'],
    ['=', 'exactly'],
    ['==', 'exactly'],
    ['!=', 'a number other than'],
  ] as const)('preserves %s in the player instruction', (method, comparison) => {
    expect(poolRequirementLabel(t, pool, 'Mechanic', method, 3)).toBe(
      `Complete ${comparison} 3 LL2 tasks for Mechanic`
    );
  });
  it('uses singular and a safe fallback when the pool has no localized trader', () => {
    expect(poolRequirementLabel(t, pool, 'Mechanic', '>=', 1)).toBe(
      'Complete at least 1 LL2 task for Mechanic'
    );
    expect(poolRequirementLabel(t, pool, undefined, '>=', 3)).toBe(
      'Complete at least 3 tasks from the required pool'
    );
  });
  it('distinguishes tracked, account and unknown values without clamping progress', () => {
    expect(poolProgressLabel(t, 5, 3, '>=')).toBe('5/3 tracked');
    expect(poolProgressLabel(t, 2, 3, undefined)).toBe('2/3 tracked');
    expect(poolProgressLabel(t, 2, 3, '>=', 'account')).toBe('2/3 in game');
    expect(poolProgressLabel(t, undefined, 3, '>=')).toBe('Progress unverified');
    expect(poolProgressLabel(t, 2, 3, '==' as RequirementComparison)).toBe('2 tracked');
  });
  it('orders real available work first and groups alternative completions once', () => {
    const context: PoolTaskContext = {
      currentTaskId: 'target',
      taskById: (id) => ({ id, name: id }),
      completion: (id) => ({
        complete: ['done', 'bear', 'usec'].includes(id),
        failed: id === 'failed',
      }),
      available: (id) => ['available', 'target'].includes(id),
      unavailable: (id) => id === 'opposite',
    };
    const groups = poolContributorGroups(
      {
        type: 'taskGroupCompletions',
        groups: [
          ['target'],
          ['locked'],
          ['done'],
          ['available'],
          ['failed'],
          ['opposite'],
          { anyOf: ['bear', 'usec'] },
        ],
      },
      context
    );
    expect(groups.map((g) => g.tasks[0]!.id)).toEqual([
      'available',
      'locked',
      'bear',
      'done',
      'failed',
      'opposite',
      'target',
    ]);
    expect(groups[2]).toMatchObject({
      anyOf: true,
      complete: true,
      tasks: [{ status: 'completed' }, { status: 'completed' }],
    });
    expect(groups.at(-1)?.tasks[0]).toMatchObject({ id: 'target', current: true });
    expect(groups.find((g) => g.key === 'opposite')?.tasks[0]?.status).toBe('unavailable');
  });
  it('retains unnamed contributors and complete group membership', () => {
    const groups = poolContributorGroups(
      { type: 'taskGroupCompletions', groups: [{ anyOf: ['a', 'b'] }] },
      {
        currentTaskId: 'target',
        taskById: (id) => ({ id }),
        completion: () => undefined,
        available: () => false,
        unavailable: () => false,
      }
    );
    expect(groups[0]?.tasks.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ]);
  });
});
