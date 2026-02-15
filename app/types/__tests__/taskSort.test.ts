import { describe, expect, it } from 'vitest';
import { isValidSortDirection, isValidSortMode } from '@/types/taskSort';
describe('isValidSortMode', () => {
  it('returns true for valid sort modes', () => {
    expect(isValidSortMode('impact')).toBe(true);
    expect(isValidSortMode('alphabetical')).toBe(true);
    expect(isValidSortMode('none')).toBe(true);
  });
  it('returns false for invalid values', () => {
    expect(isValidSortMode('invalid')).toBe(false);
    expect(isValidSortMode(undefined)).toBe(false);
    expect(isValidSortMode('')).toBe(false);
  });
});
describe('isValidSortDirection', () => {
  it('returns true for valid directions', () => {
    expect(isValidSortDirection('asc')).toBe(true);
    expect(isValidSortDirection('desc')).toBe(true);
  });
  it('returns false for invalid values', () => {
    expect(isValidSortDirection('up')).toBe(false);
    expect(isValidSortDirection(undefined)).toBe(false);
  });
});
