import { describe, expect, it } from 'vitest';
import {
  mapObjectiveCategory,
  type MapObjectiveCategory,
} from '@/composables/useMapObjectiveMarks';
import type { MapMark } from '@/features/maps/utils/marksHash';
interface MapObjectiveCategoryCase {
  pinned: boolean;
  users: string[];
  expected: MapObjectiveCategory;
}
const cases: MapObjectiveCategoryCase[] = [
  { pinned: true, users: ['self'], expected: 'pinned' },
  { pinned: true, users: ['teammate-a'], expected: 'pinned' },
  { pinned: true, users: [], expected: 'pinned' },
  { pinned: false, users: ['self', 'teammate-a'], expected: 'self' },
  { pinned: false, users: ['self'], expected: 'self' },
  { pinned: false, users: ['teammate-a'], expected: 'team' },
  { pinned: false, users: [], expected: 'team' },
];
const createMark = (overrides: Partial<MapMark>): MapMark => ({ zones: [], ...overrides });
// `LeafletMap` resolves a mark's category through this normalization because `pinned` and `users`
// are both optional on a mark. Keep it in step with the call site in `LeafletMap.vue`.
const categoryForMark = (mark: MapMark): MapObjectiveCategory =>
  mapObjectiveCategory(mark.pinned === true, mark.users ?? []);
describe('mapObjectiveCategory', () => {
  it.each(cases)(
    'returns $expected for pinned=$pinned and users=$users',
    ({ expected, pinned, users }) => {
      expect(mapObjectiveCategory(pinned, users)).toBe(expected);
    }
  );
  it('treats a mark with no pinned flag and no users as a team objective', () => {
    expect(categoryForMark(createMark({}))).toBe('team');
  });
  it('treats a mark with no pinned flag but a self user as a self objective', () => {
    expect(categoryForMark(createMark({ users: ['self'] }))).toBe('self');
  });
  it('prefers pinned over both self and team membership for a pinned mark', () => {
    expect(categoryForMark(createMark({ pinned: true, users: ['self', 'teammate-a'] }))).toBe(
      'pinned'
    );
  });
});
