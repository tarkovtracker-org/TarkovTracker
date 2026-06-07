import { describe, expect, it } from 'vitest';
import { sortTraderStats } from '@/utils/constants';
import type { TraderStats } from '@/composables/useDashboardStats';
const makeTrader = (overrides: Partial<TraderStats> & { normalizedName: string }): TraderStats => ({
  id: overrides.normalizedName,
  name: overrides.normalizedName,
  imageLink: undefined,
  levels: [],
  totalTasks: 10,
  completedTasks: 5,
  percentage: 50,
  ...overrides,
});
const prapor = makeTrader({ normalizedName: 'prapor', percentage: 30, completedTasks: 3 });
const therapist = makeTrader({ normalizedName: 'therapist', percentage: 80, completedTasks: 8 });
const fence = makeTrader({ normalizedName: 'fence', percentage: 50, completedTasks: 5 });
const skier = makeTrader({ normalizedName: 'skier', percentage: 80, completedTasks: 7 });
const traders = [fence, prapor, skier, therapist];
const mockGetLevel = (id: string) => ({ prapor: 3, therapist: 4, fence: 1, skier: 2 })[id] ?? 1;
const mockGetRep = (id: string) =>
  ({ prapor: 0.5, therapist: 1.0, fence: 0.0, skier: 0.3 })[id] ?? 0;
describe('sortTraderStats', () => {
  it('default mode returns canonical TRADER_ORDER', () => {
    const result = sortTraderStats(traders, 'default', 'desc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['prapor', 'therapist', 'fence', 'skier']);
  });
  it('default mode ignores direction parameter', () => {
    const desc = sortTraderStats(traders, 'default', 'desc', mockGetLevel, mockGetRep);
    const asc = sortTraderStats(traders, 'default', 'asc', mockGetLevel, mockGetRep);
    expect(desc.map((t) => t.normalizedName)).toEqual(asc.map((t) => t.normalizedName));
  });
  it('progress mode desc sorts highest percentage first', () => {
    const result = sortTraderStats(traders, 'progress', 'desc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['therapist', 'skier', 'fence', 'prapor']);
  });
  it('progress mode asc sorts lowest percentage first', () => {
    const result = sortTraderStats(traders, 'progress', 'asc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['prapor', 'fence', 'skier', 'therapist']);
  });
  it('progress mode breaks ties by completedTasks then canonical order', () => {
    const tied = [
      makeTrader({ normalizedName: 'skier', percentage: 80, completedTasks: 8 }),
      makeTrader({ normalizedName: 'therapist', percentage: 80, completedTasks: 8 }),
    ];
    const result = sortTraderStats(tied, 'progress', 'desc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['therapist', 'skier']);
  });
  it('level mode desc sorts highest level first', () => {
    const result = sortTraderStats(traders, 'level', 'desc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['therapist', 'prapor', 'skier', 'fence']);
  });
  it('level mode asc sorts lowest level first', () => {
    const result = sortTraderStats(traders, 'level', 'asc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['fence', 'skier', 'prapor', 'therapist']);
  });
  it('level mode breaks ties by reputation then canonical order', () => {
    const sameLvl = [
      makeTrader({ normalizedName: 'skier' }),
      makeTrader({ normalizedName: 'prapor' }),
    ];
    const getLvl = () => 2;
    const getRep = (id: string) => (id === 'skier' ? 0.5 : 0.3);
    const result = sortTraderStats(sameLvl, 'level', 'desc', getLvl, getRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['skier', 'prapor']);
  });
  it('does not mutate the input array', () => {
    const original = [...traders];
    sortTraderStats(traders, 'progress', 'desc', mockGetLevel, mockGetRep);
    expect(traders).toEqual(original);
  });
  it('breaks ties deterministically by name for traders outside TRADER_ORDER', () => {
    const unknownTraders = [
      makeTrader({ normalizedName: 'unknown-zeta', percentage: 50, completedTasks: 5 }),
      makeTrader({ normalizedName: 'unknown-alpha', percentage: 50, completedTasks: 5 }),
    ];
    const result = sortTraderStats(unknownTraders, 'progress', 'desc', mockGetLevel, mockGetRep);
    expect(result.map((t) => t.normalizedName)).toEqual(['unknown-alpha', 'unknown-zeta']);
    const reversed = sortTraderStats(
      [...unknownTraders].reverse(),
      'progress',
      'desc',
      mockGetLevel,
      mockGetRep
    );
    expect(reversed.map((t) => t.normalizedName)).toEqual(['unknown-alpha', 'unknown-zeta']);
  });
});
