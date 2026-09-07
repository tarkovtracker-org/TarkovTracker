import { describe, expect, it } from 'vitest';
import { normalizeTraderRequirements } from '@/utils/taskRequirements';
describe('canonical trader requirements', () => {
  const trader = { id: 'fence', name: 'Fence' };
  it.each([1, 2, 3, 4])('retains explicit Fence LL %s without treating it as standing', (value) => {
    expect(normalizeTraderRequirements([{ requirementType: 'level', value, trader }])).toEqual([
      { id: 'trader-requirement-0', requirementType: 'level', value, trader, compareMethod: '>=' },
    ]);
  });
  it.each([-2, 0, 0.5])('retains explicit reputation %s without sign inference', (value) => {
    expect(
      normalizeTraderRequirements([
        { requirementType: 'reputation', value, trader, compareMethod: '<' },
      ])[0]
    ).toMatchObject({ requirementType: 'reputation', value, compareMethod: '<' });
  });
  it.each([
    null,
    3,
    { value: -2, trader },
    { requirementType: 'future', value: 2, trader },
    { requirementType: 'level', value: 5, trader },
    { requirementType: 'level', value: 1.5, trader },
    { requirementType: 'reputation', value: Number.NaN, trader },
    { requirementType: 'reputation', value: 2, trader, compareMethod: 'approximately' },
    { requirementType: 'level', value: 2, trader: { id: ' ' } },
  ])('retains malformed requirements as an explicit unknown blocker: %j', (raw) => {
    expect(normalizeTraderRequirements([raw])[0]).toMatchObject({ requirementType: 'unknown' });
  });
  it('distinguishes an absent requirement set from a malformed one', () => {
    expect(normalizeTraderRequirements(undefined)).toEqual([]);
    expect(normalizeTraderRequirements(null)).toEqual([
      { id: 'trader-requirement-0', requirementType: 'unknown', reason: 'shape' },
    ]);
  });
});
