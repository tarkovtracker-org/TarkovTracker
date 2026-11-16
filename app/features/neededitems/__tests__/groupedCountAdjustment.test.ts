import { describe, expect, it } from 'vitest';
import { planGroupedCountAdjustment as plan } from '@/features/neededitems/groupedCountAdjustment';
const targets = [
  { id: 'first', total: 5, current: 1, fixed: false },
  { id: 'later', total: 10, current: 8, fixed: false },
];
describe('grouped count adjustments', () => {
  it('fills only the additional amount without moving an existing later allocation', () => {
    expect(plan(targets, 12)).toEqual([{ target: targets[0], count: 4 }]);
  });
  it('reduces lower-priority allocations first', () => {
    expect(plan(targets, 6)).toEqual([{ target: targets[1], count: 5 }]);
  });
  it('spans needs in priority order and clamps to capacity', () => {
    expect(plan(targets, 100)).toEqual([
      { target: targets[0], count: 5 },
      { target: targets[1], count: 10 },
    ]);
  });
  it('never removes counts from a completed parent', () => {
    const fixed = { ...targets[0]!, current: 5, fixed: true };
    expect(plan([targets[1]!, fixed], -10)).toEqual([{ target: targets[1], count: 0 }]);
  });
  it('never adds counts to a fixed target ahead of an editable target', () => {
    const fixed = { ...targets[0]!, fixed: true };
    expect(plan([fixed, targets[1]!], 10)).toEqual([{ target: targets[1], count: 9 }]);
  });
  it.each([9, NaN, Infinity])('does nothing for unchanged or invalid totals (%s)', (value) => {
    expect(plan(targets, value)).toEqual([]);
  });
  it('uses whole units and never mutates its inputs', () => {
    const before = structuredClone(targets);
    expect(plan(targets, 10.9)).toEqual([{ target: targets[0], count: 2 }]);
    expect(targets).toEqual(before);
  });
});
