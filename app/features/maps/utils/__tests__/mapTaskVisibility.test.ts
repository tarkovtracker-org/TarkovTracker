import { describe, expect, it } from 'vitest';
import {
  getHiddenMapTaskIds,
  meetsMapReputationMinimum,
  normalizeTaskIdList,
} from '@/features/maps/utils/mapTaskVisibility';
import type { Task } from '@/types/tarkov';
describe('mapTaskVisibility', () => {
  it('returns hidden tasks on the current map in map order', () => {
    expect(getHiddenMapTaskIds(['a', 'b', 'c'], new Set(['c', 'a', 'elsewhere']))).toEqual([
      'a',
      'c',
    ]);
  });
  it('returns nothing when no map task is hidden', () => {
    expect(getHiddenMapTaskIds(['a'], new Set(['b']))).toEqual([]);
  });
  it('normalizes persisted task id lists', () => {
    expect(normalizeTaskIdList(['a', 'a', '', 3, null, 'b'])).toEqual(['a', 'b']);
    expect(normalizeTaskIdList('a')).toEqual([]);
    expect(normalizeTaskIdList(undefined)).toEqual([]);
  });
  it.each([
    { amounts: undefined, minimum: null, matches: true },
    { amounts: undefined, minimum: 0, matches: false },
    { amounts: [], minimum: 0, matches: false },
    { amounts: [0, -0.05], minimum: 0, matches: false },
    { amounts: [0.005], minimum: 0, matches: true },
    { amounts: [0.01, 0.05, -0.1], minimum: 0.05, matches: true },
    { amounts: [0.03, 0.03], minimum: 0.05, matches: false },
    { amounts: [Infinity, NaN], minimum: 0, matches: false },
  ])('matches rewards $amounts at minimum $minimum ($matches)', ({ amounts, minimum, matches }) => {
    const task = {
      finishRewards: amounts && {
        traderStanding: amounts.map((standing, index) => ({
          trader: { id: String(index), name: `Trader ${index}` },
          standing,
        })),
      },
    } as Task;
    expect(meetsMapReputationMinimum(task, minimum)).toBe(matches);
  });
});
