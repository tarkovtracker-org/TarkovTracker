import { describe, expect, it } from 'vitest';
import { getHiddenMapTaskIds, normalizeTaskIdList } from '@/features/maps/utils/mapTaskVisibility';
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
});
