import { describe, expect, it } from 'vitest';
import {
  getObjectiveCategory,
  type ObjectiveCategory,
} from '@/features/maps/utils/objectiveCategory';
import type { MapMark } from '@/features/maps/utils/marksHash';
interface ObjectiveCategoryCase {
  pinned?: boolean;
  users?: string[];
  expected: ObjectiveCategory;
}
const createMark = (overrides: Partial<MapMark>): MapMark => ({
  zones: [],
  ...overrides,
});
const cases: ObjectiveCategoryCase[] = [
  { pinned: true, users: ['self'], expected: 'pinned' },
  { pinned: true, users: ['teammate-a'], expected: 'pinned' },
  { pinned: false, users: ['self', 'teammate-a'], expected: 'self' },
  { pinned: false, users: ['teammate-a'], expected: 'team' },
  { pinned: false, users: undefined, expected: 'team' },
  { pinned: undefined, users: ['self'], expected: 'self' },
];
describe('getObjectiveCategory', () => {
  it.each(cases)(
    'returns $expected for pinned=$pinned and users=$users',
    ({ expected, ...mark }) => {
      expect(getObjectiveCategory(createMark(mark))).toBe(expected);
    }
  );
});
