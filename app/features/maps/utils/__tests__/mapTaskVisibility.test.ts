import { describe, expect, it } from 'vitest';
import {
  buildMapTaskVisibilityState,
  getMapTaskUserVisibility,
  isTaskShownOnMap,
  normalizeTaskIdList,
  resolveActiveFocusTaskIds,
} from '@/features/maps/utils/mapTaskVisibility';
describe('mapTaskVisibility', () => {
  it('shows every task when nothing is hidden or focused', () => {
    const state = buildMapTaskVisibilityState([], [], ['a', 'b']);
    expect(getMapTaskUserVisibility('a', state)).toBe('visible');
    expect(isTaskShownOnMap('b', state)).toBe(true);
  });
  it('hides user-hidden tasks', () => {
    const state = buildMapTaskVisibilityState(['a'], [], ['a', 'b']);
    expect(getMapTaskUserVisibility('a', state)).toBe('hidden');
    expect(getMapTaskUserVisibility('b', state)).toBe('visible');
  });
  it('shows only focused tasks while focus is active on this map', () => {
    const state = buildMapTaskVisibilityState([], ['a'], ['a', 'b', 'c']);
    expect(getMapTaskUserVisibility('a', state)).toBe('visible');
    expect(getMapTaskUserVisibility('b', state)).toBe('unfocused');
  });
  it('ignores focused tasks that are not on the current map', () => {
    const state = buildMapTaskVisibilityState(['b'], ['other-map-task'], ['a', 'b']);
    expect(state.activeFocusTaskIds.size).toBe(0);
    expect(getMapTaskUserVisibility('a', state)).toBe('visible');
    expect(getMapTaskUserVisibility('b', state)).toBe('hidden');
  });
  it('resolves active focus as the intersection with map tasks', () => {
    expect([...resolveActiveFocusTaskIds(['a', 'x'], ['a', 'b'])]).toEqual(['a']);
  });
  it('normalizes persisted id lists', () => {
    expect(normalizeTaskIdList(['a', 'a', '', 3, null, 'b'])).toEqual(['a', 'b']);
    expect(normalizeTaskIdList('a')).toEqual([]);
    expect(normalizeTaskIdList(undefined)).toEqual([]);
  });
});
