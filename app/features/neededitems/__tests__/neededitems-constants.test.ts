import { describe, expect, it } from 'vitest';
import {
  isValidNeededItemsFilterType,
  isValidNeededItemsSortBy,
  isValidNeededItemsSortDirection,
} from '@/features/neededitems/neededitems-constants';
describe('isValidNeededItemsFilterType', () => {
  it('returns true for valid filter types', () => {
    expect(isValidNeededItemsFilterType('all')).toBe(true);
    expect(isValidNeededItemsFilterType('tasks')).toBe(true);
    expect(isValidNeededItemsFilterType('hideout')).toBe(true);
    expect(isValidNeededItemsFilterType('completed')).toBe(true);
  });
  it('returns false for invalid values', () => {
    expect(isValidNeededItemsFilterType('invalid')).toBe(false);
    expect(isValidNeededItemsFilterType(undefined)).toBe(false);
  });
});
describe('isValidNeededItemsSortBy', () => {
  it('returns true for valid sort modes', () => {
    expect(isValidNeededItemsSortBy('priority')).toBe(true);
    expect(isValidNeededItemsSortBy('name')).toBe(true);
    expect(isValidNeededItemsSortBy('category')).toBe(true);
    expect(isValidNeededItemsSortBy('count')).toBe(true);
  });
  it('returns false for invalid values', () => {
    expect(isValidNeededItemsSortBy('invalid')).toBe(false);
    expect(isValidNeededItemsSortBy(undefined)).toBe(false);
  });
});
describe('isValidNeededItemsSortDirection', () => {
  it('returns true for valid directions', () => {
    expect(isValidNeededItemsSortDirection('asc')).toBe(true);
    expect(isValidNeededItemsSortDirection('desc')).toBe(true);
  });
  it('returns false for invalid values', () => {
    expect(isValidNeededItemsSortDirection('up')).toBe(false);
    expect(isValidNeededItemsSortDirection(undefined)).toBe(false);
  });
});
