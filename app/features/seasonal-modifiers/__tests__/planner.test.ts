import { describe, expect, it } from 'vitest';
import {
  lowestNetCost,
  suggestBalance,
  type Modifier,
} from '@/features/seasonal-modifiers/planner';
const modifier = (id: string, netCost: number): Modifier => ({ id, netCost, category: 'skills' });
describe('seasonal modifier balance', () => {
  it('distinguishes recoverable and impossible positive totals', () => {
    const available = [modifier('first', -10), modifier('second', -5), modifier('perk', 7)];
    expect(lowestNetCost(15, available)).toBe(0);
    expect(lowestNetCost(20, available)).toBe(5);
  });
  it('uses the fewest additions that reach zero across both sides', () => {
    const cost = modifier('cost', 2);
    const drawback = modifier('drawback', -6);
    const available = [
      modifier('other', -9),
      drawback,
      cost,
      modifier('one', 1),
      modifier('two', 1),
    ];
    expect(suggestBalance(4, available)).toEqual({ closest: 0, additions: [drawback, cost] });
  });
  it('suggests the closest within-budget total and keeps already better selections', () => {
    const closest = modifier('closest', -6);
    expect(suggestBalance(4, [closest, modifier('worse', -9)])).toEqual({
      closest: -2,
      additions: [closest],
    });
    expect(suggestBalance(-4, [modifier('cost', 7)])).toEqual({ closest: -4, additions: [] });
    expect(suggestBalance(0, [closest])).toEqual({ closest: 0, additions: [] });
  });
});
